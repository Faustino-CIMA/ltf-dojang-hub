import { render, screen } from "@testing-library/react";

import { VerifiedBadge } from "./verified-badge";

describe("VerifiedBadge", () => {
  it("shows the shield with its text label", () => {
    render(<VerifiedBadge label="Verified" />);
    expect(screen.getByText("Verified")).toBeInTheDocument();
    expect(screen.getByText("Verified")).not.toHaveClass("sr-only");
    expect(document.querySelector("[data-verified='true']")).toHaveClass("text-success");
  });

  it("can keep only the shield and hide the label from view", () => {
    render(<VerifiedBadge iconOnly label="Verified on 29.11.2026" />);
    const label = screen.getByText("Verified on 29.11.2026");
    expect(label).toHaveClass("sr-only");
    expect(document.querySelector("[data-verified='true'] .text-xs")).toBeNull();
  });
});
