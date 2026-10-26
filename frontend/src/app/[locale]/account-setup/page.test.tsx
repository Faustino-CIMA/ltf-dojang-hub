import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import AccountSetupPage from "./page";
import ResetPasswordPage from "../reset-password/page";
import { completeAccountSetup, loadAccountSetup } from "@/lib/setup-api";
import { resetPasswordConfirm } from "@/lib/auth-api";

jest.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, string>) =>
    values ? `${key}:${values.username ?? ""}:${values.email ?? ""}` : key,
  useLocale: () => "en",
}));

jest.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams((globalThis as { __search?: string }).__search || ""),
}));

jest.mock("@/lib/setup-api", () => ({
  loadAccountSetup: jest.fn(),
  completeAccountSetup: jest.fn(),
}));

jest.mock("@/lib/auth-api", () => ({
  resetPasswordConfirm: jest.fn(),
}));

const load = loadAccountSetup as jest.Mock;
const complete = completeAccountSetup as jest.Mock;
const confirmReset = resetPasswordConfirm as jest.Mock;

function reduceMotion() {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: () => ({ matches: true, addEventListener() {}, removeEventListener() {} }),
  });
}

describe("account setup outcome", () => {
  beforeEach(() => {
    reduceMotion();
    sessionStorage.clear();
    (globalThis as { __search?: string }).__search = "token=invite-token";
    load.mockReset();
    complete.mockReset();
  });

  it("shows a success card and a sign-in link after the account is saved", async () => {
    load.mockResolvedValue({
      status: "open",
      info: { username: "ang", first_name: "Ada", last_name: "Ng", assignments: [] },
    });
    complete.mockResolvedValue({ detail: "Account ready." });
    render(<AccountSetupPage />);
    fireEvent.change(await screen.findByLabelText(/^email/), { target: { value: "ada@example.com" } });
    fireEvent.change(screen.getByLabelText(/^password/), { target: { value: "A-long-password-1" } });
    fireEvent.change(screen.getByLabelText(/^confirmPassword/), { target: { value: "A-long-password-1" } });
    fireEvent.click(screen.getByRole("button", { name: "submit" }));
    expect(await screen.findByRole("heading", { name: "successTitle" })).toBeInTheDocument();
    expect(screen.getByText("successBody:ang:ada@example.com")).toBeInTheDocument();
    const signIn = screen.getByRole("link", { name: "signInNow" });
    expect(signIn).toHaveAttribute("href", "/en/login?username=ang");
    expect(signIn).toHaveFocus();
    expect(screen.queryByLabelText(/^email/)).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "title" })).not.toBeInTheDocument();
  });

  it("shows that a used invitation is already set up", async () => {
    load.mockResolvedValue({ status: "used" });
    render(<AccountSetupPage />);
    expect(await screen.findByRole("heading", { name: "usedTitle" })).toBeInTheDocument();
    expect(screen.getByText("usedBody")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "signInNow" })).toHaveAttribute("href", "/en/login");
    expect(screen.queryByLabelText(/^email/)).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "title" })).not.toBeInTheDocument();
  });

  it("asks for a new invitation when the link has expired", async () => {
    load.mockResolvedValue({ status: "expired" });
    render(<AccountSetupPage />);
    expect(await screen.findByRole("heading", { name: "expiredTitle" })).toBeInTheDocument();
    expect(screen.getByText("expiredBody")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "signInNow" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/^email/)).not.toBeInTheDocument();
  });
});

describe("password reset outcome", () => {
  beforeEach(() => {
    reduceMotion();
    sessionStorage.clear();
    (globalThis as { __search?: string }).__search = "uid=abc&token=reset-token&username=ang";
    confirmReset.mockReset();
  });

  it("replaces the form with a success card after the password is saved", async () => {
    confirmReset.mockResolvedValue({ detail: "Password reset successfully." });
    render(<ResetPasswordPage />);
    fireEvent.change(await screen.findByLabelText(/passwordLabel/), { target: { value: "A-long-password-1" } });
    fireEvent.change(screen.getByLabelText(/confirmPasswordLabel/), { target: { value: "A-long-password-1" } });
    fireEvent.click(screen.getByRole("button", { name: "submit" }));
    expect(await screen.findByRole("heading", { name: "successTitle" })).toBeInTheDocument();
    expect(screen.getByText("successBody:ang:")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "signInNow" })).toHaveAttribute("href", "/en/login?username=ang");
    expect(screen.queryByLabelText(/passwordLabel/)).not.toBeInTheDocument();
    await waitFor(() => expect(confirmReset).toHaveBeenCalled());
  });

  it("explains a dead reset link instead of leaving an empty form", async () => {
    confirmReset.mockRejectedValue(new Error("Invalid or expired reset link."));
    render(<ResetPasswordPage />);
    fireEvent.change(await screen.findByLabelText(/passwordLabel/), { target: { value: "A-long-password-1" } });
    fireEvent.change(screen.getByLabelText(/confirmPasswordLabel/), { target: { value: "A-long-password-1" } });
    fireEvent.click(screen.getByRole("button", { name: "submit" }));
    expect(await screen.findByRole("heading", { name: "invalidTitle" })).toBeInTheDocument();
    expect(screen.getByText("invalidBody")).toBeInTheDocument();
    expect(screen.queryByLabelText(/passwordLabel/)).not.toBeInTheDocument();
  });
});
