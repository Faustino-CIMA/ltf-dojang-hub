import { useState } from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";

jest.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => "en",
}));

import { MASKED_SECRET_NUMBER } from "@/lib/mask-secret";

import { SecretNumberField } from "./secret-number-field";

jest.mock("@/lib/member-verification", () => ({
  revealSocialSecurityNumber: jest.fn(() => Promise.resolve({ social_security_number: "1971100213046" })),
}));

const labels = {
  lockedLabel: "Locked",
  openLabel: "Can be edited",
  showLabel: "Show number",
  hideLabel: "Hide number",
};

function Harness() {
  const [value, setValue] = useState(MASKED_SECRET_NUMBER);
  return (
    <SecretNumberField
      id="ssn"
      label="Social security number"
      value={value}
      onChange={setValue}
      locked={false}
      canReveal
      memberId={7}
      {...labels}
    />
  );
}

describe("SecretNumberField", () => {
  it("masks the number until Show number is pressed, then hides it again", async () => {
    jest.useFakeTimers({ advanceTimers: true });
    const { revealSocialSecurityNumber } = await import("@/lib/member-verification");
    render(<Harness />);
    const input = screen.getByLabelText("Social security number") as HTMLInputElement;
    expect(input.value).toBe(MASKED_SECRET_NUMBER);
    expect(input.value).not.toMatch(/\d/);
    expect(input).toHaveAttribute("readonly");
    expect(screen.queryByRole("button", { name: "Show number" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Show number" }));
    expect(revealSocialSecurityNumber).toHaveBeenCalledWith(7);
    expect(await screen.findByDisplayValue("1971100213046")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Hide number" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "Hide number" }));
    expect(input.value).toBe(MASKED_SECRET_NUMBER);
    expect(input.value).not.toMatch(/\d/);
    fireEvent.click(screen.getByRole("button", { name: "Show number" }));
    expect(await screen.findByDisplayValue("1971100213046")).toBeInTheDocument();
    act(() => {
      jest.advanceTimersByTime(30_000);
    });
    expect(input.value).toBe(MASKED_SECRET_NUMBER);
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
    const input = screen.getByLabelText("Social security number") as HTMLInputElement;
    expect(input).toHaveAttribute("readonly");
    expect(input.value).toBe(MASKED_SECRET_NUMBER);
    expect(input.value).not.toMatch(/\d/);
  });
});
