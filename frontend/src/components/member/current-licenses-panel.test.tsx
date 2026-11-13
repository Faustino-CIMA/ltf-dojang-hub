import { render, screen } from "@testing-library/react";

import { CurrentLicensesPanel } from "@/components/member/current-licenses-panel";

jest.mock("@/components/member/published-license-card-preview", () => ({
  PublishedLicenseCardPreview: () => <div>card preview</div>,
}));

const labels = {
  title: "Current license",
  subtitle: "Pending and active licenses for this member.",
  emptyLabel: "No pending or active licenses.",
  pendingHint: "A pending license means an order already exists.",
  yearLabel: "Year",
  typeLabel: "License type",
  statusLabel: "Status",
  pendingLabel: "Pending",
  activeLabel: "Active",
  expiredLabel: "Expired",
  revokedLabel: "Revoked",
  cardPreviewTitle: "License card",
  cardPreviewFrontLabel: "Front",
  cardPreviewBackLabel: "Back",
  cardPreviewUnavailable: "No published license card template is available.",
};

describe("current licenses panel", () => {
  it("keeps the club and federation card free of the photo note", () => {
    render(
      <CurrentLicensesPanel
        {...labels}
        memberId={4}
        licenses={[{ id: 9, year: 2026, status: "active", license_type: 1, license_type_name: "Annual" }]}
      />,
    );
    expect(screen.getByText("card preview")).toBeInTheDocument();
    expect(screen.queryByText(/still shows the current photo/)).not.toBeInTheDocument();
  });

  it("marks a waiting photo with a warning badge and an info note", () => {
    render(
      <CurrentLicensesPanel
        {...labels}
        memberId={4}
        licenses={[{ id: 9, year: 2026, status: "active", license_type: 1, license_type_name: "Annual" }]}
        photoWaitingLabel="Pending approval"
        photoWaitingNote="A new photo is waiting for the club. This card still shows the current photo."
        photoWaitingInfoLabel="About pending approval"
      />,
    );
    const badge = screen.getByText("Pending approval");
    expect(badge.className).toContain("badge-warning");
    expect(badge.className).not.toContain("badge-danger");
    expect(screen.getByText(/This card still shows the current photo/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "About pending approval" })).toBeInTheDocument();
  });

  it("reuses the empty license line when there is no card", () => {
    render(<CurrentLicensesPanel {...labels} memberId={4} licenses={[]} />);
    expect(screen.getByText("No pending or active licenses.")).toBeInTheDocument();
    expect(screen.queryByText("card preview")).not.toBeInTheDocument();
  });
});
