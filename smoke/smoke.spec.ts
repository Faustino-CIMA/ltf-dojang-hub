import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { freshTotp, invalidateTotpWindow } from "./totp.mjs";

const password = process.env.SMOKE_PASSWORD || "pass12345";
const secret = process.env.SMOKE_TOTP_SECRET || "JBSWY3DPEHPK3PXP";
const openId = process.env.SMOKE_OPEN_ID;
const missingId = process.env.SMOKE_MISSING_ID;
const verifiedId = process.env.SMOKE_VERIFIED_ID;

async function signIn(page: Page, username: string) {
  await page.goto("/en/login");
  await page.getByRole("textbox", { name: "Username or email" }).fill(username);
  await page.getByRole("textbox", { name: "Password" }).fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.getByLabel("Code").waitFor();
  for (let attempt = 0; attempt < 2; attempt += 1) {
    await page.getByLabel("Code").fill(await freshTotp(secret));
    await page.getByRole("button", { name: "Continue" }).click();
    try {
      await page.waitForURL(/\/en\/dashboard/, { timeout: 8_000 });
      return;
    } catch (error) {
      if (attempt === 1) {
        throw error;
      }
      invalidateTotpWindow();
    }
  }
}

async function expectStaticLinkBorder(locator: Locator) {
  const style = await locator.evaluate((element) => {
    const computed = getComputedStyle(element);
    const probe = document.createElement("span");
    probe.style.color = "var(--link)";
    document.body.appendChild(probe);
    const link = getComputedStyle(probe).color;
    probe.remove();
    return {
      animationName: computed.animationName,
      borderTopWidth: computed.borderTopWidth,
      borderTopStyle: computed.borderTopStyle,
      borderTopColor: computed.borderTopColor,
      backgroundImage: computed.backgroundImage,
      link,
    };
  });
  expect(style.animationName).toBe("none");
  expect(style.borderTopWidth).toBe("1px");
  expect(style.borderTopStyle).toBe("solid");
  expect(style.backgroundImage).toBe("none");
  expect(style.borderTopColor).toBe(style.link);
}

async function expectRingDoesNotFill(highlight: Locator) {
  const outer = await highlight.evaluate((element) => getComputedStyle(element).backgroundImage);
  expect(outer).toBe("none");
  const ring = highlight.locator(".guide-run");
  const style = await ring.evaluate((element) => {
    const computed = getComputedStyle(element);
    return {
      backgroundImage: computed.backgroundImage,
      backgroundColor: computed.backgroundColor,
      borderTopWidth: computed.borderTopWidth,
      maskClip: computed.maskClip,
      maskComposite: computed.maskComposite,
      webkitMaskClip: computed.getPropertyValue("-webkit-mask-clip"),
      webkitMaskComposite: computed.getPropertyValue("-webkit-mask-composite"),
    };
  });
  expect(style.backgroundImage).toContain("conic-gradient");
  expect(style.backgroundColor).toBe("rgba(0, 0, 0, 0)");
  expect(style.borderTopWidth).toBe("1px");
  const mask = `${style.maskClip} ${style.webkitMaskClip} ${style.maskComposite} ${style.webkitMaskComposite}`.toLowerCase();
  expect(mask).toContain("padding-box");
  expect(mask).toMatch(/exclude|xor/);
}

async function expectStaticGuideChrome(page: Page, highlight: Locator, bubble: Locator) {
  await expectRingDoesNotFill(highlight);
  await expectStaticLinkBorder(bubble);
  await expectStaticLinkBorder(page.locator("[data-guide-nav]"));
}

test.describe.configure({ mode: "serial" });

test("a club admin signs in and sees the three card-check states", async ({ page }) => {
  test.skip(!openId || !missingId || !verifiedId, "Seed the smoke club before this run.");
  await signIn(page, process.env.SMOKE_USERNAME || "smoke-club");
  await expect(page).toHaveURL(/\/en\/dashboard\/club/);

  await page.goto(`/en/dashboard/club/members/${openId}/verify`);
  await expect(page.getByRole("heading", { name: "Check the card on a phone" })).toBeVisible();
  await expect(page.getByText("Enter the social security number on the club record")).toHaveCount(0);

  await page.goto(`/en/dashboard/club/members/${missingId}/verify`);
  await expect(page.getByText("Enter the social security number on the club record before this check.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Enter the social security number" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Check the card on a phone" })).toHaveCount(0);

  await page.goto(`/en/dashboard/club/members/${verifiedId}/verify`);
  await expect(page.getByText("Verified on 29.11.2026")).toBeVisible();
  await expect(page.getByLabel("Reason")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Check the card on a phone" })).toHaveCount(0);
});

test("member and statement downloads are PDFs for the fake club", async ({ page }) => {
  test.skip(!openId, "Seed the smoke club before this run.");
  await signIn(page, process.env.SMOKE_USERNAME || "smoke-club");
  await page.goto(`/en/dashboard/club/members/${openId}`);
  await page.getByRole("button", { name: "Row actions" }).click();
  const statement = page.waitForEvent("download");
  await page.getByRole("menuitem", { name: "Download statement" }).click();
  const statementFile = await (await statement).createReadStream();
  const statementBytes = Buffer.concat(await readAll(statementFile));
  expect(pdfText(statementBytes)).toContain("Example Club");

  await page.getByRole("button", { name: "Row actions" }).click();
  await page.getByRole("menuitem", { name: "Download member data" }).click();
  const memberData = page.waitForEvent("download");
  await page.getByRole("button", { name: "PDF report" }).click();
  const memberBytes = Buffer.concat(await readAll(await (await memberData).createReadStream()));
  expect(memberBytes.subarray(0, 5).toString()).toBe("%PDF-");
  expect(pdfText(memberBytes)).toContain("Example Club");
});

test("the member can download their own file", async ({ page }) => {
  await signIn(page, process.env.SMOKE_MEMBER_USERNAME || "smoke-member");
  await page.goto("/en/dashboard/member");
  await page.getByRole("button", { name: "Download my data" }).click();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "PDF report" }).click();
  const bytes = Buffer.concat(await readAll(await (await download).createReadStream()));
  expect(bytes.subarray(0, 5).toString()).toBe("%PDF-");
  expect(pdfText(bytes)).toContain("Bea");
});

test("the order guide follows real clicks and does not place an order", async ({ page }) => {
  await signIn(page, process.env.SMOKE_USERNAME || "smoke-club");
  await page.goto("/en/dashboard/club/members");
  const row = page.locator("[data-guide='members.select-row']").first();
  await row.waitFor();
  await page.getByRole("button", { name: "Help" }).click();
  await page.getByRole("button", { name: "Ordering licenses" }).click();
  await page.getByRole("button", { name: "Show me" }).click();
  const stepOne = page.getByRole("complementary", { name: /Step 1 of 8, Order a license/ });
  await expect(stepOne).toBeVisible();
  await page.waitForTimeout(400);
  await expect(stepOne).toBeVisible();

  await row.click();
  await expect(page.getByRole("complementary", { name: /Step 2 of 8, Order a license/ })).toBeVisible();
  await page.getByRole("button", { name: "Show all steps" }).click();
  await expect(page.getByRole("button", { name: "Show one step" })).toBeVisible();
  await row.click();
  await expect(row).not.toBeChecked();
  await row.click();
  await expect(row).toBeChecked();

  await page.getByRole("button", { name: "Actions", exact: true }).click();
  await page.getByRole("button", { name: "Order license" }).click();
  await expect(page).toHaveURL(/\/en\/dashboard\/club\/members\/order-licenses/);
  await expect(page.getByRole("complementary", { name: /Step 4 of 8, Order a license/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Create order for/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Order created" })).toHaveCount(0);
});

test("the add-member guide follows real typing and does not save", async ({ page }) => {
  await signIn(page, process.env.SMOKE_USERNAME || "smoke-club");
  await page.goto("/en/dashboard/club/members");
  await page.locator("[data-guide='members.select-row']").first().waitFor();
  await page.getByRole("button", { name: "Help" }).click();
  await page.getByRole("button", { name: "Adding a member" }).click();
  await page.getByRole("button", { name: "Show me" }).click();
  const stepOne = page.getByRole("complementary", { name: /Step 1 of 9, Add a member/ });
  await expect(stepOne).toBeVisible();
  await page.waitForTimeout(400);
  await expect(stepOne).toBeVisible();

  await page.locator("[data-guide='members.menu']").click();
  await expect(page.getByRole("complementary", { name: /Step 2 of 9, Add a member/ })).toBeVisible();
  await page.locator("[data-guide='members.create']").click();
  await expect(page.getByRole("complementary", { name: /Step 3 of 9, Add a member/ })).toBeVisible();
  await page.waitForTimeout(300);
  await expect(page.getByRole("complementary", { name: /Step 3 of 9, Add a member/ })).toBeVisible();

  await page.locator("[data-guide='member.last-name']").fill("Keller");
  await page.locator("[data-guide='member.last-name']").press("Tab");
  await expect(page.getByRole("complementary", { name: /Step 4 of 9, Add a member/ })).toBeVisible();
  await page.getByRole("button", { name: "Show all steps" }).click();
  await page.locator("[data-guide='member.first-name']").fill("Lea");
  await expect(page.locator("[data-guide='member.first-name']")).toHaveValue("Lea");
  await expect(page.getByRole("button", { name: "Create member" })).toBeVisible();
  await expect(page.getByText("The member is on the list.")).toHaveCount(0);
});

test("the import guide follows a real file and does not save", async ({ page }) => {
  await signIn(page, process.env.SMOKE_USERNAME || "smoke-club");
  await page.goto("/en/dashboard/club/members");
  await page.locator("[data-guide='members.select-row']").first().waitFor();
  await page.getByRole("button", { name: "Help" }).click();
  await page.getByRole("button", { name: "Importing members from a spreadsheet" }).click();
  await page.getByRole("button", { name: "Show me" }).click();
  const stepOne = page.getByRole("complementary", { name: /Step 1 of 11, Import members/ });
  await expect(stepOne).toBeVisible();
  await page.waitForTimeout(400);
  await expect(stepOne).toBeVisible();

  await page.locator("[data-guide='members.menu']").click();
  await expect(page.getByRole("complementary", { name: /Step 2 of 11, Import members/ })).toBeVisible();
  await page.locator("[data-guide='members.import']").click();
  await expect(page).toHaveURL(/\/en\/dashboard\/club\/members\/import/);
  await expect(page.getByRole("complementary", { name: /Step 3 of 11, Import members/ })).toBeVisible();

  await page.locator("[data-guide='import.update-mode']").click();
  await page.getByRole("option", { name: "Create new only (skip existing)" }).click();
  await expect(page.getByRole("complementary", { name: /Step 4 of 11, Import members/ })).toBeVisible();

  const chooserPromise = page.waitForEvent("filechooser");
  await page.locator("[data-guide='import.file']").click();
  const chooser = await chooserPromise;
  await chooser.setFiles({
    name: "new-members.csv",
    mimeType: "text/csv",
    buffer: Buffer.from("Last name,First name,Date of birth\nKeller,Lea,14.03.2015\n"),
  });
  await expect(page.getByRole("complementary", { name: /Step 5 of 11, Import members/ })).toBeVisible();
  await page.locator("[data-guide='import.date-format']").click();
  await page.getByRole("option", { name: "DD.MM.YYYY" }).click();
  await expect(page.getByRole("complementary", { name: /Step 6 of 11, Import members/ })).toBeVisible();

  await page.getByRole("button", { name: "Show all steps" }).click();
  await page.locator("[data-guide='import.continue']").click();
  await expect(page.getByRole("complementary", { name: /Step 7 of 11, Import members/ })).toBeVisible();
  await page.locator("[data-guide='import.auto-map']").click();
  await expect(page.getByRole("complementary", { name: /Step 8 of 11, Import members/ })).toBeVisible();
  await expect(page.locator("[data-guide='import.preview']")).toBeVisible();
  await expect(page.getByText("Import succeeded")).toHaveCount(0);
});

test("a guide started on a member page opens the members list", async ({ page }) => {
  test.skip(!openId, "Seed the smoke club before this run.");
  await signIn(page, process.env.SMOKE_USERNAME || "smoke-club");
  await page.goto(`/en/dashboard/club/members/${openId}`);
  await page.getByRole("button", { name: "Help" }).click();
  await page.getByRole("button", { name: "Ordering licenses" }).click();
  await page.getByRole("button", { name: "Show me" }).click();
  await expect(page).toHaveURL(/\/en\/dashboard\/club\/members$/);
  await expect(page).not.toHaveURL(/shop/);
  await expect(page.getByRole("complementary", { name: /Step 1 of 8, Order a license/ })).toBeVisible();
  await expect(page.locator("[data-guide='members.select-row']").first()).toBeVisible();
});

test("a guide highlight moves onto the open Members menu", async ({ page }) => {
  await signIn(page, process.env.SMOKE_USERNAME || "smoke-club");
  await page.goto("/en/dashboard/club/members");
  await page.locator("[data-guide='members.select-row']").first().waitFor();
  await page.getByRole("button", { name: "Help" }).click();
  await page.getByRole("button", { name: "Adding a member" }).click();
  await page.getByRole("button", { name: "Show me" }).click();
  const stepOne = page.getByRole("complementary", { name: /Step 1 of 9, Add a member/ });
  await expect(stepOne).toBeVisible();
  await expect(page.locator("[data-guide-highlight='members.menu']")).toBeVisible();
  await expectStaticGuideChrome(page, page.locator("[data-guide-highlight='members.menu']"), stepOne);

  await page.locator("[data-guide='members.menu']").click();
  const bubble = page.getByRole("complementary", { name: /Step 2 of 9, Add a member/ });
  const highlight = page.locator("[data-guide-highlight='members.create']");
  const item = page.locator("[data-guide='members.create']");
  await expect(bubble).toBeVisible();
  await expect(highlight).toBeVisible();
  await expect(item).toBeVisible();
  const bubbleBox = await bubble.boundingBox();
  const highlightBox = await highlight.boundingBox();
  const itemBox = await item.boundingBox();
  expect(bubbleBox && highlightBox && itemBox).toBeTruthy();
  expect(Math.abs((highlightBox?.y ?? 0) - (itemBox?.y ?? 0))).toBeLessThan(24);
  expect(Math.abs((highlightBox?.x ?? 0) - (itemBox?.x ?? 0))).toBeLessThan(24);
  expect((bubbleBox?.width ?? 0) > 80).toBe(true);
  expect((bubbleBox?.y ?? -1) >= 0).toBe(true);
  await expectRingDoesNotFill(highlight);
  await expectStaticLinkBorder(bubble);
});

test("the pay guide opens invoices and does not pay", async ({ page }) => {
  await signIn(page, process.env.SMOKE_USERNAME || "smoke-club");
  let checkoutStarted = false;
  page.on("request", (request) => {
    if (request.method() === "POST" && request.url().includes("create-checkout-session")) {
      checkoutStarted = true;
    }
  });
  await page.goto("/en/dashboard/club/members");
  await page.locator("[data-guide='members.select-row']").first().waitFor();
  await page.getByRole("button", { name: "Help" }).click();
  await page.getByRole("button", { name: "Paying the LTF" }).click();
  await page.getByRole("button", { name: "Show me" }).click();
  await expect(page).toHaveURL(/\/en\/dashboard\/club\/invoices$/);
  await expect(page).not.toHaveURL(/shop/);
  const stepOne = page.getByRole("complementary", { name: /Step 1 of 5, Pay an invoice/ });
  await expect(stepOne).toBeVisible();
  await expect(page.locator("[data-guide-highlight='invoice.accounting']")).toBeVisible();

  await page.locator("[data-guide='invoice.accounting']").click();
  const ledger = page.locator("[data-guide='invoice.ledger-ltf']");
  const ledgerHighlight = page.locator("[data-guide-highlight='invoice.ledger-ltf']");
  await expect(page.getByRole("complementary", { name: /Step 2 of 5, Pay an invoice/ })).toBeVisible();
  await expect(ledgerHighlight).toBeVisible();
  await expect(ledger).toBeVisible();
  const ledgerBox = await ledger.boundingBox();
  const ledgerHighlightBox = await ledgerHighlight.boundingBox();
  expect(Math.abs((ledgerHighlightBox?.y ?? 0) - (ledgerBox?.y ?? 0))).toBeLessThan(24);
  expect(Math.abs((ledgerHighlightBox?.x ?? 0) - (ledgerBox?.x ?? 0))).toBeLessThan(24);

  await ledger.click();
  await expect(page.getByRole("complementary", { name: /Step 3 of 5, Pay an invoice/ })).toBeVisible();

  const menu = page.locator("[data-guide='invoice.row-menu']");
  if ((await menu.count()) > 0) {
    await menu.first().click();
    const pay = page.locator("[data-guide='invoice.pay-now']").first();
    const payHighlight = page.locator("[data-guide-highlight='invoice.pay-now']");
    await expect(page.getByRole("complementary", { name: /Step 4 of 5, Pay an invoice/ })).toBeVisible();
    await expect(payHighlight).toBeVisible();
    await expect(pay).toBeVisible();
    const payBox = await pay.boundingBox();
    const payHighlightBox = await payHighlight.boundingBox();
    expect(Math.abs((payHighlightBox?.y ?? 0) - (payBox?.y ?? 0))).toBeLessThan(24);
    expect(Math.abs((payHighlightBox?.x ?? 0) - (payBox?.x ?? 0))).toBeLessThan(24);
  }
  await expect(page).toHaveURL(/\/en\/dashboard\/club\/invoices$/);
  await expect(page.getByRole("heading", { name: "Payment successful" })).toHaveCount(0);
  expect(checkoutStarted).toBe(false);
});

test("the pay guide started on a member page opens the invoices list", async ({ page }) => {
  test.skip(!openId, "Seed the smoke club before this run.");
  await signIn(page, process.env.SMOKE_USERNAME || "smoke-club");
  await page.goto(`/en/dashboard/club/members/${openId}`);
  await page.getByRole("button", { name: "Help" }).click();
  await page.getByRole("button", { name: "Paying the LTF" }).click();
  await page.getByRole("button", { name: "Show me" }).click();
  await expect(page).toHaveURL(/\/en\/dashboard\/club\/invoices$/);
  await expect(page).not.toHaveURL(/shop/);
  await expect(page.getByRole("complementary", { name: /Step 1 of 5, Pay an invoice/ })).toBeVisible();
  await expect(page.locator("[data-guide-highlight='invoice.accounting']")).toBeVisible();
});

test("the import guide started on a member page opens the members list", async ({ page }) => {
  test.skip(!openId, "Seed the smoke club before this run.");
  await signIn(page, process.env.SMOKE_USERNAME || "smoke-club");
  await page.goto(`/en/dashboard/club/members/${openId}`);
  await page.getByRole("button", { name: "Help" }).click();
  await page.getByRole("button", { name: "Importing members from a spreadsheet" }).click();
  await page.getByRole("button", { name: "Show me" }).click();
  await expect(page).toHaveURL(/\/en\/dashboard\/club\/members$/);
  await expect(page).not.toHaveURL(/shop/);
  await expect(page.getByRole("complementary", { name: /Step 1 of 11, Import members/ })).toBeVisible();
});

test("a tiny import can be checked, saved, and undone", async ({ page }) => {
  await signIn(page, process.env.SMOKE_USERNAME || "smoke-club");
  await page.goto("/en/dashboard/club/data");
  await page.getByRole("tab", { name: "Import" }).click();
  await page.locator('input[type="file"]').setInputFiles({
    name: "smoke-members.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(
      "# keys: last_name,first_name\nLast name,First name\nlast_name,first_name\nSMOKEIMPORT,Bea\n",
    ),
  });
  await page.getByRole("button", { name: "Upload" }).click();
  await page.getByRole("button", { name: "Check the rows" }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Check without saving" }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByText(/to add/)).toBeVisible();
  await page.getByRole("button", { name: "Import" }).click();
  await expect(page.getByText("Import finished")).toBeVisible({ timeout: 60_000 });
  const hint = await page.getByText(/Type the batch number/).innerText();
  const batchId = hint.match(/(\d+)/)?.[1];
  expect(batchId).toBeTruthy();
  await page.locator("#import-undo").fill(batchId || "");
  await page.getByRole("button", { name: "Undo this import" }).click();
  await expect(page.getByText("The import was undone. Grade promotions were kept.")).toBeVisible();
});

async function readAll(stream: NodeJS.ReadableStream) {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return chunks;
}

function pdfText(bytes: Buffer) {
  expect(bytes.subarray(0, 5).toString()).toBe("%PDF-");
  const file = `/tmp/smoke-pdf-${process.pid}.pdf`;
  writeFileSync(file, bytes);
  const python = process.env.SMOKE_PYTHON || "python3";
  const result = spawnSync(
    python,
    [
      "-c",
      "from pypdf import PdfReader\nimport sys\nprint('\\n'.join((page.extract_text() or '') for page in PdfReader(sys.argv[1]).pages))",
      file,
    ],
    { encoding: "utf8" },
  );
  if (result.status !== 0) {
    throw new Error(result.stderr || "Could not read the PDF");
  }
  return result.stdout;
}
