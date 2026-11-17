import { render, screen } from "@testing-library/react";

import { VerifiedBadge } from "./verified-badge";

describe("VerifiedBadge", () => {
  it("shows the shield with its text label", () => {
    render(<VerifiedBadge label="Verified" />);
    expect(screen.getByText("Verified")).toBeInTheDocument();
    expect(document.querySelector("[data-verified='true']")).toHaveClass("text-success");
  });
});
