import type { ReactNode } from "react";
import { TextEncoder } from "node:util";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

if (!global.TextEncoder) {
  global.TextEncoder = TextEncoder as unknown as typeof global.TextEncoder;
}

import { DesktopCardHandoff } from "./desktop-card-handoff";
import { HANDOFF_PX_PER_MODULE, HANDOFF_QR_MAX_PX, handoffQrPixelSize } from "@/lib/handoff-qr";
import QRCode from "qrcode";

jest.mock("next/link", () => ({
  __esModule: true,
  default: ({ children, href }: { children: ReactNode; href: string }) => <a href={href}>{children}</a>,
}));

jest.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, string>) =>
    values?.time ? `${key} ${values.time}` : key,
}));

jest.mock("@/lib/member-verification", () => ({
  getMemberVerification: jest.fn(),
  createMemberChallenge: jest.fn(),
  cancelMemberChallenge: jest.fn(),
  unlockMemberCard: jest.fn(),
  cardCheckPath: (locale: string, token: string) => `/${locale}/card-check/${token}`,
}));

const verification = jest.requireMock("@/lib/member-verification") as {
  getMemberVerification: jest.Mock;
  createMemberChallenge: jest.Mock;
  cancelMemberChallenge: jest.Mock;
  unlockMemberCard: jest.Mock;
};

const TOKEN = "handoff-token-test-value-0001";

describe("DesktopCardHandoff", () => {
  beforeEach(() => {
    verification.getMemberVerification.mockReset();
    verification.createMemberChallenge.mockReset();
    verification.cancelMemberChallenge.mockResolvedValue({});
    verification.unlockMemberCard.mockResolvedValue({ verified: false, has_number: true, verified_at: null });
    verification.getMemberVerification.mockResolvedValue({
      verified: false,
      has_number: true,
      challenge_open: true,
      country: "LU",
    });
    verification.createMemberChallenge.mockResolvedValue({
      token: TOKEN,
      expires_at: "2026-11-18T12:10:00.000Z",
    });
  });

  it("renders a non-empty code for a valid hand-off", async () => {
    const { container } = render(
      <DesktopCardHandoff memberId={1} locale="en" backHref="/en/dashboard/club/members/1" />,
    );
    await waitFor(() => expect(container.querySelector("svg")).not.toBeNull());
    const svg = container.querySelector("svg");
    const span = Number(svg?.getAttribute("viewBox")?.split(" ")[2]);
    const px = Number(svg?.getAttribute("width"));
    expect(px).toBe(span * HANDOFF_PX_PER_MODULE);
    expect(px).toBeLessThanOrEqual(HANDOFF_QR_MAX_PX);
    expect(svg?.getAttribute("height")).toBe(String(px));
    expect(svg?.getAttribute("shape-rendering")).toBe("crispEdges");
    const drawing = svg?.querySelector("path")?.getAttribute("d") ?? "";
    expect(drawing.length).toBeGreaterThan(20);
    expect(svg?.outerHTML).not.toContain("members");
    expect(screen.getByText(/qrExpires/)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "qrTitle" })).toBeInTheDocument();
  });

  it("shows the number warning and does not create a code when none is stored", async () => {
    verification.getMemberVerification.mockResolvedValue({
      verified: false,
      has_number: false,
      verified_at: null,
      challenge_open: false,
      country: "",
    });
    render(<DesktopCardHandoff memberId={1} locale="en" backHref="/en/dashboard/club/members/1" />);
    expect(await screen.findByText("noNumber")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "qrTitle" })).not.toBeInTheDocument();
    expect(screen.queryByText("qrHint")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "enterNumber" })).toHaveAttribute(
      "href",
      "/en/dashboard/club/members/1?edit=1&focus=ssn",
    );
    expect(verification.createMemberChallenge).not.toHaveBeenCalled();
  });

  it("shows the verified date and unlocks into a fresh code", async () => {
    verification.getMemberVerification.mockResolvedValue({
      verified: true,
      has_number: true,
      verified_at: "2026-11-29T13:05:00.000Z",
      challenge_open: false,
      country: "LU",
    });
    render(<DesktopCardHandoff memberId={1} locale="en" backHref="/en/dashboard/club/members/1" />);
    expect(await screen.findByText(/verifiedOn/)).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "qrTitle" })).not.toBeInTheDocument();
    expect(verification.createMemberChallenge).not.toHaveBeenCalled();
    verification.getMemberVerification.mockResolvedValue({
      verified: false,
      has_number: true,
      verified_at: null,
      challenge_open: true,
      country: "LU",
    });
    fireEvent.change(screen.getByLabelText("unlockReason"), { target: { value: "Wrong member" } });
    fireEvent.click(screen.getByRole("button", { name: "unlockSubmit" }));
    await waitFor(() => expect(verification.unlockMemberCard).toHaveBeenCalledWith(1, "Wrong member"));
    await waitFor(() => expect(verification.createMemberChallenge).toHaveBeenCalled());
    expect(await screen.findByRole("heading", { name: "qrTitle" })).toBeInTheDocument();
  });
});

describe("handoff QR size", () => {
  it("uses four pixels per module for a production hand-off address", () => {
    const token = "a".repeat(43);
    const url = `https://app.ltkdf.org/en/card-check/${token}`;
    const symbol = QRCode.create(url, { errorCorrectionLevel: "M" });
    expect(symbol.version).toBe(5);
    expect(symbol.modules.size).toBe(37);
    expect(handoffQrPixelSize(symbol.modules.size)).toBe(180);
    expect(180).toBeLessThanOrEqual(HANDOFF_QR_MAX_PX);
  });
});
