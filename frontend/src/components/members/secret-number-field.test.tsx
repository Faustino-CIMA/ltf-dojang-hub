import { act, fireEvent, render, screen } from "@testing-library/react";

jest.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => "en",
}));

import { SecretNumberField } from "./secret-number-field";

jest.mock("@/lib/member-verification", () => ({
  revealSocialSecurityNumber: jest.fn(() => Promise.resolve()),
}));

const labels = {
  lockedLabel: "Locked",
  openLabel: "Can be edited",
  showLabel: "Show number",
  hideLabel: "Hide number",
};

describe("SecretNumberField", () => {
  it("masks the number until Show number is pressed, then hides it again", async () => {
    jest.useFakeTimers();
    const { revealSocialSecurityNumber } = await import("@/lib/member-verification");
    render(
      <SecretNumberField
        id="ssn"
        label="Social security number"
        value="1971100213046"
        onChange={() => undefined}
        locked={false}
        canReveal
        memberId={7}
        {...labels}
      />
    );
    const input = screen.getByLabelText("Social security number") as HTMLInputElement;
    expect(input.value).toBe("•••••••••3046");
    expect(input).toHaveAttribute("readonly");
    expect(screen.queryByRole("button", { name: "Show number" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Show number" }));
    expect(revealSocialSecurityNumber).toHaveBeenCalledWith(7);
    expect(input.value).toBe("1971100213046");
    expect(screen.getByRole("button", { name: "Hide number" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "Hide number" }));
    expect(input.value).toBe("•••••••••3046");
    fireEvent.click(screen.getByRole("button", { name: "Show number" }));
    act(() => {
      jest.advanceTimersByTime(30_000);
    });
    expect(input.value).toBe("•••••••••3046");
    jest.useRealTimers();
  });

  it("does not offer the eye when the role cannot reveal", () => {
    render(
      <SecretNumberField
        id="ssn"
        label="Social security number"
        value="1971100213046"
        onChange={() => undefined}
        locked
        canReveal={false}
        {...labels}
      />
    );
    expect(screen.queryByRole("button", { name: "Show number" })).not.toBeInTheDocument();
    expect(screen.getByText("Locked")).toBeInTheDocument();
    expect(screen.getByLabelText("Social security number")).toHaveAttribute("readonly");
  });
});
