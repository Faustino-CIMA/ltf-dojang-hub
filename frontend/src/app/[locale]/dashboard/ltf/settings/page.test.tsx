import { render, screen } from "@testing-library/react";

import Page from "@/app/[locale]/dashboard/ltf/settings/page";
import {
  getFederationLogos,
  getFederationProfile,
  getLtfLicensePrefixRewritePreview,
} from "@/lib/ltf-admin-api";

jest.mock("next-intl", () => {
  const translate = (key: string) => key;
  return {
    useTranslations: () => translate,
    useLocale: () => "en",
  };
});

jest.mock("@/components/ltf-admin/ltf-admin-layout", () => ({
  LtfAdminLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

jest.mock("@/lib/ltf-admin-api", () => ({
  getFederationProfile: jest.fn(),
  updateFederationProfile: jest.fn(),
  getFederationLogos: jest.fn(),
  uploadFederationLogo: jest.fn(),
  updateFederationLogo: jest.fn(),
  deleteFederationLogo: jest.fn(),
  getLtfLicensePrefixRewritePreview: jest.fn(),
  applyLtfLicensePrefixRewrite: jest.fn(),
}));

const profile = getFederationProfile as jest.MockedFunction<typeof getFederationProfile>;
const logos = getFederationLogos as jest.MockedFunction<typeof getFederationLogos>;
const rewrite = getLtfLicensePrefixRewritePreview as jest.MockedFunction<
  typeof getLtfLicensePrefixRewritePreview
>;

describe("LTF federation settings", () => {
  beforeEach(() => {
    profile.mockResolvedValue({
      id: 1,
      name: "Luxembourg Taekwondo Federation",
      address_line1: "12 Rue de Test",
      address_line2: "Bureau 2",
      postal_code: "1234",
      locality: "Musterstadt",
      rcs_number: "B123456",
      iban: "",
      bank_name: "",
      rewrite_lux_prefix_on_member_import: false,
      club_tourist_transfer_threshold: 3,
      created_at: "",
      updated_at: "",
    });
    logos.mockResolvedValue({ logos: [] });
    rewrite.mockResolvedValue({
      source_prefix: "LUX",
      target_prefix: "LTF",
      candidate_count: 0,
      conflict_count: 0,
      rewritten: 0,
      conflicts: [],
    });
  });

  it("shows the RCS number and the Luxembourg address lookup fields", async () => {
    render(<Page />);

    expect(await screen.findByLabelText("rcsNumberLabel")).toHaveValue("B123456");
    expect(screen.getByRole("link", { name: "openLbrSearch" })).toHaveAttribute("href", "https://www.lbr.lu/");
    expect(screen.getByText("federationOfficeHint")).toBeInTheDocument();
    expect(screen.getByLabelText("postalCode")).toHaveValue("1234");
    expect(screen.getByLabelText("locality")).toHaveValue("Musterstadt");
    expect(screen.getByLabelText("houseNumber")).toHaveValue("12");
    expect(screen.getByLabelText("street")).toHaveValue("Rue de Test");
    expect(screen.getByLabelText("addressLine2")).toHaveValue("Bureau 2");
    expect(screen.queryByLabelText("country")).not.toBeInTheDocument();
  });
});
