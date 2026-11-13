import { render, screen } from "@testing-library/react";

import { PublishedLicenseCardPreview } from "@/components/member/published-license-card-preview";
import { getMemberLicenseCardImage, getMemberLicenseCardPreview } from "@/lib/license-card-api";

jest.mock("@/lib/license-card-api", () => ({
  getMemberLicenseCardPreview: jest.fn(),
  getMemberLicenseCardImage: jest.fn(),
}));

const preview = getMemberLicenseCardPreview as jest.Mock;
const image = getMemberLicenseCardImage as jest.Mock;

describe("published license card preview", () => {
  beforeEach(() => {
    preview.mockReset();
    image.mockReset();
    URL.createObjectURL = jest.fn(() => "blob:card");
    URL.revokeObjectURL = jest.fn();
  });

  it("shows the printed card as an image and does not scale an iframe", async () => {
    preview.mockResolvedValue({
      template_name: "Standard 3C Card",
      license_id: 9,
      active_side: "front",
      available_sides: ["front"],
      side_summary: { front: { has_content: true } },
      card_format: { width_mm: "85.00", height_mm: "55.00", code: "3c" },
    });
    image.mockResolvedValue(new Blob(["png"], { type: "image/png" }));

    render(
      <PublishedLicenseCardPreview
        memberId={4}
        licenseId={9}
        title="License card"
        frontLabel="Front"
        backLabel="Back"
        unavailableLabel="No published license card template is available."
      />,
    );

    expect(screen.getByText("License card")).toBeInTheDocument();
    const picture = await screen.findByRole("img", { name: "Front" });
    expect(picture).toHaveAttribute("src", "blob:card");
    expect(picture.getAttribute("style") || "").not.toContain("transform");
    expect(document.querySelector("iframe")).toBeNull();
    expect(image).toHaveBeenCalledWith(4, expect.objectContaining({ side: "front", licenseId: 9 }));
  });
});
