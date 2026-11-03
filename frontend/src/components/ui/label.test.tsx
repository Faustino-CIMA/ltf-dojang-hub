import { render, screen } from "@testing-library/react";

import { Label, RequiredForm } from "@/components/ui/label";

jest.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

describe("Required field marker", () => {
  it("adds an accessible asterisk and the required legend when a field is required", () => {
    const { rerender } = render(
      <RequiredForm>
        <Label htmlFor="club-name">Club</Label>
      </RequiredForm>
    );
    expect(document.querySelector("[data-required]")).toBeNull();
    const legend = screen.getByText(/requiredLegend/).closest("p");
    expect(legend).toHaveClass("hidden");
    expect(legend).toHaveClass("group-has-data-required/required:block");

    rerender(
      <RequiredForm>
        <Label htmlFor="club-name" required>
          Club
        </Label>
        <input id="club-name" />
      </RequiredForm>
    );
    const mark = document.querySelector("[data-required='true']");
    expect(mark).toHaveTextContent("*");
    expect(mark).toHaveAttribute("aria-hidden", "true");
    expect(mark).toHaveClass("text-destructive");
    expect(screen.getByText(/requiredMark/)).toHaveClass("sr-only");
    expect(screen.getByLabelText(/Club/)).toBe(document.getElementById("club-name"));
    expect(legend).toHaveTextContent("*");
  });
});
