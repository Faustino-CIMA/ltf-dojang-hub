import type { ReactNode } from "react";
import { TextEncoder } from "node:util";
import { render, screen, waitFor } from "@testing-library/react";

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
  cardCheckPath: (locale: string, token: string) => `/${locale}/card-check/${token}`,
}));

const verification = jest.requireMock("@/lib/member-verification") as {
  getMemberVerification: jest.Mock;
  createMemberChallenge: jest.Mock;
  cancelMemberChallenge: jest.Mock;
};

const TOKEN = "handoff-token-test-value-0001";

describe("DesktopCardHandoff", () => {
  beforeEach(() => {
    verification.getMemberVerification.mockReset();
    verification.createMemberChallenge.mockReset();
    verification.cancelMemberChallenge.mockResolvedValue({});
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
