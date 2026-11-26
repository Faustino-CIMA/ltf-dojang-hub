import type { ReactNode } from "react";
import { render, screen, waitFor } from "@testing-library/react";

import { MemberVerifyScreen } from "./member-verify-screen";

jest.mock("next/link", () => ({
  __esModule: true,
  default: ({ children, href }: { children: ReactNode; href: string }) => <a href={href}>{children}</a>,
}));

jest.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, string>) =>
    values?.date ? `${key} ${values.date}` : key,
}));

jest.mock("@/lib/member-verification", () => ({
  getMemberVerification: jest.fn(),
  getCardChallenge: jest.fn(),
  compareMemberCard: jest.fn(),
  compareCardChallenge: jest.fn(),
  unlockMemberCard: jest.fn(),
}));

jest.mock("@/lib/camera-capture", () => ({
  openCamera: jest.fn(() => Promise.resolve({ getTracks: () => [] })),
  attachCameraPreview: jest.fn(() => Promise.resolve()),
  stopMediaStream: jest.fn(),
  isCameraDenied: jest.fn(() => false),
}));

jest.mock("@/lib/card-ocr", () => ({
  readCardOnDevice: jest.fn(),
  releaseCardReader: jest.fn(),
}));

const verification = jest.requireMock("@/lib/member-verification") as {
  getMemberVerification: jest.Mock;
};

function phoneWidth() {
  window.matchMedia = jest.fn().mockImplementation(() => ({
    matches: true,
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
  }));
  window.requestAnimationFrame = (callback) => {
    callback(0);
    return 1;
  };
  window.cancelAnimationFrame = () => undefined;
}

describe("MemberVerifyScreen on a phone", () => {
  beforeEach(() => {
    phoneWidth();
    verification.getMemberVerification.mockReset();
  });

  it("asks for the number and does not introduce the scan", async () => {
    verification.getMemberVerification.mockResolvedValue({
      verified: false,
      has_number: false,
      verified_at: null,
      country: "",
    });
    render(<MemberVerifyScreen memberId={4} locale="en" backHref="/en/dashboard/club/members/4" />);
    expect(await screen.findByText("noNumber")).toBeInTheDocument();
    expect(screen.queryByText("intro")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "enterNumber" })).toHaveAttribute(
      "href",
      "/en/dashboard/club/members/4?edit=1&focus=ssn",
    );
  });

  it("shows the verified date and the unlock reason", async () => {
    verification.getMemberVerification.mockResolvedValue({
      verified: true,
      has_number: true,
      verified_at: "2026-11-29T13:05:00.000Z",
      country: "LU",
    });
    render(<MemberVerifyScreen memberId={4} locale="en" backHref="/en/dashboard/club/members/4" />);
    expect(await screen.findByText(/verifiedOn 29.11.2026/)).toBeInTheDocument();
    expect(screen.queryByText("intro")).not.toBeInTheDocument();
    expect(screen.getByLabelText("unlockReason")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "unlockSubmit" })).toBeDisabled();
  });

  it("shows the camera once the number is stored and the member is not verified", async () => {
    verification.getMemberVerification.mockResolvedValue({
      verified: false,
      has_number: true,
      verified_at: null,
      country: "LU",
    });
    render(<MemberVerifyScreen memberId={4} locale="en" backHref="/en/dashboard/club/members/4" />);
    await waitFor(() => expect(screen.getByText("intro")).toBeInTheDocument());
    expect(screen.getByRole("button", { name: "capture" })).toBeInTheDocument();
  });
});
