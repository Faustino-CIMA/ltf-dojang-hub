import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import { MemberAccountBadge } from "@/components/members/member-account-badge";
import { MemberAccountPanel } from "@/components/members/member-account-panel";
import { accountBadgeTone, canBulkCreateAccounts, clubMemberRowActionKeys } from "@/lib/member-accounts";
import { togglePageSelection } from "@/lib/row-selection";

const previewMemberAccounts = jest.fn();
const postMemberAccounts = jest.fn();

jest.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, string | number>) => {
    if (!values) {
      return key;
    }
    return `${key}:${Object.values(values).join("|")}`;
  },
  useLocale: () => "en",
}));

jest.mock("@/lib/member-accounts", () => {
  const actual = jest.requireActual("@/lib/member-accounts");
  return {
    ...actual,
    previewMemberAccounts: (...args: unknown[]) => previewMemberAccounts(...args),
    postMemberAccounts: (...args: unknown[]) => postMemberAccounts(...args),
  };
});

describe("member account badge and menu", () => {
  it("uses warning and info tokens and never a danger token", () => {
    const { rerender } = render(<MemberAccountBadge state="none" label="No account" />);
    expect(screen.getByText("No account").className).not.toContain("badge-danger");
    expect(accountBadgeTone("none")).toBe("neutral");
    rerender(<MemberAccountBadge state="pending" label="Waiting" />);
    expect(screen.getByText("Waiting").className).toContain("badge-warning");
    expect(screen.getByText("Waiting").className).not.toContain("badge-danger");
    rerender(<MemberAccountBadge state="active" label="Account" />);
    expect(screen.getByText("Account").className).toContain("badge-info");
    expect(screen.getByText("Account").className).not.toContain("badge-danger");
    rerender(<MemberAccountBadge state="disabled" label="Disabled" />);
    expect(screen.getByText("Disabled").className).not.toContain("badge-danger");
    expect(screen.getByText("Disabled").className).not.toContain("badge-warning");
  });

  it("keeps Edit, then the account action, with Delete last", () => {
    expect(clubMemberRowActionKeys("none", false)).toEqual(["edit", "create", "delete"]);
    expect(clubMemberRowActionKeys("pending", false)).toEqual(["edit", "copy", "delete"]);
    expect(clubMemberRowActionKeys("active", false)).toEqual(["edit", "delete"]);
    expect(clubMemberRowActionKeys("disabled", false)).toEqual(["edit", "delete"]);
    expect(clubMemberRowActionKeys("pending", true)).toEqual(["edit", "delete"]);
  });

  it("keeps other pages ticked and only offers create when a ticked row has no login", () => {
    const page = togglePageSelection([], [1, 2]);
    const withOtherPage = togglePageSelection(page, [3]);
    expect(withOtherPage).toEqual([1, 2, 3]);
    expect(
      canBulkCreateAccounts(withOtherPage, [{ id: 3, account_state: "active" }]),
    ).toBe(true);
    expect(canBulkCreateAccounts([3], [{ id: 3, account_state: "active" }])).toBe(false);
    expect(canBulkCreateAccounts([3], [{ id: 3, account_state: "none" }])).toBe(true);
  });
});

describe("member account confirm", () => {
  beforeEach(() => {
    previewMemberAccounts.mockReset();
    postMemberAccounts.mockReset();
    URL.createObjectURL = jest.fn(() => "blob:member-logins");
    URL.revokeObjectURL = jest.fn();
    HTMLAnchorElement.prototype.click = jest.fn();
  });

  it("shows the count, and the file warning only after the links file exists", async () => {
    previewMemberAccounts.mockResolvedValue({
      results: [
        {
          member_id: 1,
          name: "NG Ada",
          account_state: "none",
          proposed_username: "ang",
          reason: "",
          match: null,
          can_create: true,
          can_link: false,
          can_copy: false,
        },
        {
          member_id: 2,
          name: "YOUNG Kid",
          account_state: "none",
          proposed_username: "",
          reason: "under_16",
          match: null,
          can_create: false,
          can_link: false,
          can_copy: false,
        },
      ],
    });
    postMemberAccounts.mockResolvedValue({
      created_count: 1,
      linked_count: 0,
      skipped: [{ member_id: 2, reason: "under_16" }],
      needs_link: [],
      csv: "username,name\nang,NG Ada\n",
      pdf_base64: btoa("pdf"),
      copy_link: "https://hub.example.test/en/account-setup?token=once",
    });
    render(
      <MemberAccountPanel
        open
        namespace="ClubAdmin"
        memberIds={[1, 2]}
        intent="create"
        onClose={() => undefined}
        onDone={() => undefined}
      />,
    );
    expect(await screen.findByText("accountWillCreate:1")).toBeInTheDocument();
    expect(screen.getByText("accountUnder16Skip:1")).toBeInTheDocument();
    expect(screen.queryByText("accountFileWarning")).not.toBeInTheDocument();
    expect(screen.queryByText("accountSensitiveWarning")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "accountConfirm" }));
    await waitFor(() => expect(postMemberAccounts).toHaveBeenCalledTimes(1));
    expect(screen.getByText("accountFileWarning")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "accountDownloadPdf" }));
    expect(postMemberAccounts).toHaveBeenCalledTimes(1);
    expect(URL.createObjectURL).toHaveBeenCalledTimes(2);
  });

  it("links an email match in one confirm and shows that login", async () => {
    previewMemberAccounts.mockResolvedValue({
      results: [
        {
          member_id: 4,
          name: "MATCH Ada",
          account_state: "none",
          proposed_username: "ada-existing",
          reason: "needs_link",
          match: { user_id: 9, username: "ada-existing" },
          can_create: false,
          can_link: true,
          can_copy: false,
        },
      ],
    });
    postMemberAccounts.mockResolvedValue({
      created_count: 0,
      linked_count: 1,
      skipped: [],
      needs_link: [],
      csv: "",
      pdf_base64: "",
      copy_link: "",
    });
    render(
      <MemberAccountPanel
        open
        namespace="LtfAdmin"
        memberIds={[4]}
        intent="create"
        onClose={() => undefined}
        onDone={() => undefined}
      />,
    );
    expect(await screen.findByRole("dialog", { name: "linkExistingLogin" })).toBeInTheDocument();
    expect(screen.getByText("accountLinkedPrompt:ada-existing")).toBeInTheDocument();
    expect(screen.queryByText("accountFileWarning")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "accountConfirm" }));
    await waitFor(() =>
      expect(postMemberAccounts).toHaveBeenCalledWith({
        action: "link",
        member_ids: [4],
        locale: "en",
      }),
    );
    expect(screen.queryByText("accountFileWarning")).not.toBeInTheDocument();
  });
});
