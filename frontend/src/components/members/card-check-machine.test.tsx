import type { ReactNode } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import { DesktopCardHandoff } from "./desktop-card-handoff";
import { MemberVerifyScreen } from "./member-verify-screen";

jest.mock("next/link", () => ({
  __esModule: true,
  default: ({ children, href }: { children: ReactNode; href: string }) => <a href={href}>{children}</a>,
}));

jest.mock("next-intl", () => {
  const translate = (key: string, values?: Record<string, string>) =>
    values ? `${key} ${Object.values(values).join(" ")}` : key;
  return { useTranslations: () => translate };
});

jest.mock("@/lib/member-verification", () => ({
  getMemberVerification: jest.fn(),
  getCardChallenge: jest.fn(),
  createMemberChallenge: jest.fn(),
  cancelMemberChallenge: jest.fn(),
  compareMemberCard: jest.fn(),
  compareCardChallenge: jest.fn(),
  unlockMemberCard: jest.fn(),
  cardCheckPath: (locale: string, token: string) => `/${locale}/card-check/${token}`,
}));

jest.mock("@/lib/camera-capture", () => ({
  openCamera: jest.fn(() => Promise.resolve({ getTracks: () => [] })),
  stopMediaStream: jest.fn(),
  isCameraDenied: jest.fn(() => false),
}));

jest.mock("@/lib/card-ocr", () => ({
  readCardImage: jest.fn(),
}));

jest.mock("@/lib/card-read", () => ({
  readCardText: jest.fn(),
}));

const verification = jest.requireMock("@/lib/member-verification") as {
  getMemberVerification: jest.Mock;
  createMemberChallenge: jest.Mock;
  cancelMemberChallenge: jest.Mock;
  compareMemberCard: jest.Mock;
  unlockMemberCard: jest.Mock;
};
const ocr = jest.requireMock("@/lib/card-ocr") as { readCardImage: jest.Mock };
const cardRead = jest.requireMock("@/lib/card-read") as { readCardText: jest.Mock };

const open = {
  verified: false,
  has_number: true,
  verified_at: null,
  challenge_open: true,
  country: "LU",
};

function phoneWidth() {
  window.matchMedia = jest.fn().mockImplementation(() => ({
    matches: true,
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
  }));
  window.requestAnimationFrame = (callback: FrameRequestCallback) => {
    callback(0);
    return 1;
  };
  window.cancelAnimationFrame = () => undefined;
  Object.defineProperty(HTMLMediaElement.prototype, "play", {
    configurable: true,
    value: () => Promise.resolve(),
  });
}

function cardVideo() {
  const video = document.querySelector("video") as HTMLVideoElement;
  Object.defineProperty(video, "videoWidth", { configurable: true, value: 40 });
  Object.defineProperty(video, "videoHeight", { configurable: true, value: 30 });
}

describe("desktop card check states", () => {
  beforeEach(() => {
    verification.getMemberVerification.mockReset();
    verification.createMemberChallenge.mockReset();
    verification.cancelMemberChallenge.mockReset();
    verification.cancelMemberChallenge.mockResolvedValue({});
    verification.getMemberVerification.mockResolvedValue(open);
  });

  it("offers start again when the code request fails, then a retry opens the scan", async () => {
    verification.createMemberChallenge.mockRejectedValueOnce(new Error("down"));
    render(<DesktopCardHandoff memberId={1} locale="en" backHref="/en/dashboard/club/members/1" />);
    expect(await screen.findByRole("button", { name: "startAgain" })).toBeInTheDocument();
    expect(verification.createMemberChallenge).toHaveBeenCalledTimes(1);
    verification.createMemberChallenge.mockResolvedValue({
      token: "handoff-token-test-value-0001",
      expires_at: "2026-11-29T14:00:00.000Z",
    });
    fireEvent.click(screen.getByRole("button", { name: "startAgain" }));
    expect(await screen.findByRole("heading", { name: "qrTitle" })).toBeInTheDocument();
    expect(verification.createMemberChallenge).toHaveBeenCalledTimes(2);
  });

  it("does not unlock a verified member until a reason is entered", async () => {
    verification.getMemberVerification.mockResolvedValue({
      verified: true,
      has_number: true,
      verified_at: "2026-11-29T13:05:00.000Z",
      challenge_open: false,
      country: "LU",
    });
    render(<DesktopCardHandoff memberId={1} locale="en" backHref="/en/dashboard/club/members/1" />);
    expect(await screen.findByText(/verifiedOn/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "unlockSubmit" })).toBeDisabled();
    expect(verification.createMemberChallenge).not.toHaveBeenCalled();
  });
});

describe("phone card check states", () => {
  beforeEach(() => {
    phoneWidth();
    HTMLCanvasElement.prototype.getContext = jest.fn(() => ({
      drawImage: jest.fn(),
    })) as unknown as typeof HTMLCanvasElement.prototype.getContext;
    verification.getMemberVerification.mockReset();
    verification.compareMemberCard.mockReset();
    verification.unlockMemberCard.mockReset();
    ocr.readCardImage.mockReset();
    cardRead.readCardText.mockReset();
    verification.getMemberVerification.mockResolvedValue(open);
    ocr.readCardImage.mockResolvedValue("EXAMPLE ADA");
    cardRead.readCardText.mockReturnValue({
      ok: true,
      firstNames: "Ada",
      lastNames: "EXAMPLE",
      number: "1971100213012",
      dateOfBirth: "2026-11-29",
      sex: "F",
    });
  });

  it("goes from an unreadable card back to the camera", async () => {
    render(<MemberVerifyScreen memberId={4} locale="en" backHref="/en/dashboard/club/members/4" />);
    fireEvent.click(await screen.findByRole("button", { name: "capture" }));
    expect(await screen.findByText("unreadable")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "tryAgain" }));
    expect(await screen.findByRole("button", { name: "capture" })).toBeInTheDocument();
  });

  it("asks to confirm the card names, then locks the member", async () => {
    verification.compareMemberCard
      .mockResolvedValueOnce({
        needs_confirmation: true,
        card_first_name: "Ada",
        card_last_name: "EXAMPLE",
      })
      .mockResolvedValueOnce({ verified: true });
    render(<MemberVerifyScreen memberId={4} locale="en" backHref="/en/dashboard/club/members/4" />);
    expect(await screen.findByRole("button", { name: "capture" })).toBeInTheDocument();
    cardVideo();
    fireEvent.click(screen.getByRole("button", { name: "capture" }));
    expect(await screen.findByRole("heading", { name: "confirmTitle" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "useCardNames" }));
    expect(await screen.findByText("verifiedDone")).toBeInTheDocument();
    expect(screen.queryByText("intro")).not.toBeInTheDocument();
  });

  it("names a mismatch and returns to the camera", async () => {
    verification.compareMemberCard.mockResolvedValue({ verified: false, fields: ["number"] });
    render(<MemberVerifyScreen memberId={4} locale="en" backHref="/en/dashboard/club/members/4" />);
    expect(await screen.findByRole("button", { name: "capture" })).toBeInTheDocument();
    cardVideo();
    fireEvent.click(screen.getByRole("button", { name: "capture" }));
    expect(await screen.findByText(/mismatch/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "tryAgain" }));
    expect(await screen.findByRole("button", { name: "capture" })).toBeInTheDocument();
  });

  it("unlocks a verified member and opens the camera again", async () => {
    verification.getMemberVerification.mockResolvedValue({
      verified: true,
      has_number: true,
      verified_at: "2026-11-29T13:05:00.000Z",
      country: "LU",
    });
    verification.unlockMemberCard.mockResolvedValue({ verified: false });
    render(<MemberVerifyScreen memberId={4} locale="en" backHref="/en/dashboard/club/members/4" />);
    expect(await screen.findByText(/verifiedOn/)).toBeInTheDocument();
    expect(screen.queryByText("intro")).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("unlockReason"), { target: { value: "Wrong member" } });
    fireEvent.click(screen.getByRole("button", { name: "unlockSubmit" }));
    expect(await screen.findByText("unlocked", { exact: true })).toBeInTheDocument();
    await waitFor(() => expect(verification.unlockMemberCard).toHaveBeenCalledWith(4, "Wrong member"));
    fireEvent.click(screen.getByRole("button", { name: "verify" }));
    expect(await screen.findByRole("button", { name: "capture" })).toBeInTheDocument();
  });
});
