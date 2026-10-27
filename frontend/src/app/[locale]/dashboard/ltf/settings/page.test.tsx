import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import Page from "@/app/[locale]/dashboard/ltf/settings/page";
import { lookupLuAddress } from "@/lib/clubmgmt-api";
import {
  getFederationLogos,
  getFederationProfile,
  getLtfLicensePrefixRewritePreview,
  updateFederationProfile,
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

jest.mock("@/lib/clubmgmt-api", () => ({
  lookupLuAddress: jest.fn(),
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
const update = updateFederationProfile as jest.MockedFunction<typeof updateFederationProfile>;
const logos = getFederationLogos as jest.MockedFunction<typeof getFederationLogos>;
const rewrite = getLtfLicensePrefixRewritePreview as jest.MockedFunction<
  typeof getLtfLicensePrefixRewritePreview
>;
const lookup = lookupLuAddress as jest.MockedFunction<typeof lookupLuAddress>;

const baseProfile = {
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
};

describe("LTF federation settings", () => {
  beforeEach(() => {
    lookup.mockReset();
    profile.mockResolvedValue(baseProfile);
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

  it("reloads a saved whole address as street and number when postcode and locality are already stored", async () => {
    profile.mockResolvedValue({
      ...baseProfile,
      address_line1: "10, Boulevard Royal, L-2449 Luxembourg",
      postal_code: "2449",
      locality: "Luxembourg",
    });
    render(<Page />);

    expect(await screen.findByLabelText("street")).toHaveValue("Boulevard Royal");
    expect(screen.getByLabelText("houseNumber")).toHaveValue("10");
    expect(screen.getByLabelText("postalCode")).toHaveValue("2449");
    expect(screen.getByLabelText("locality")).toHaveValue("Luxembourg");
  });

  it("keeps a stored line in Street when it cannot be split without hiding the place", async () => {
    profile.mockResolvedValue({
      ...baseProfile,
      address_line1: "10, Boulevard Royal, L-2449 Luxembourg",
      address_line2: "",
      postal_code: "",
      locality: "",
    });
    render(<Page />);

    expect(await screen.findByLabelText("street")).toHaveValue("10, Boulevard Royal, L-2449 Luxembourg");
    expect(screen.getByLabelText("houseNumber")).toHaveValue("");
  });

  it("fills street, number, postcode, and locality from lookup without putting the whole address in Street", async () => {
    profile.mockResolvedValue({
      ...baseProfile,
      address_line1: "",
      address_line2: "",
      postal_code: "",
      locality: "",
    });
    lookup.mockResolvedValue({
      postal_code: "2449",
      localities: ["Luxembourg"],
      streets: ["Boulevard Royal"],
      houses: [
        {
          house_number: "10",
          street: "Boulevard Royal",
          locality: "Luxembourg",
          postal_code: "2449",
          label: "10, Boulevard Royal, L-2449 Luxembourg",
        },
      ],
    });
    update.mockImplementation(async (payload) => ({ ...baseProfile, ...payload }));
    render(<Page />);

    fireEvent.change(await screen.findByLabelText("postalCode"), { target: { value: "2449" } });
    fireEvent.focus(screen.getByLabelText("street"));
    expect(await screen.findByRole("button", { name: "Boulevard Royal" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Boulevard Royal, L-2449/ })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Boulevard Royal" }));
    fireEvent.change(screen.getByLabelText("houseNumber"), { target: { value: "10" } });
    fireEvent.click(screen.getByRole("button", { name: "saveFederationSettings" }));

    await waitFor(() => expect(update).toHaveBeenCalled());
    expect(update.mock.calls[0][0]).toEqual(
      expect.objectContaining({
        address_line1: "10 Boulevard Royal",
        postal_code: "2449",
        locality: "Luxembourg",
      }),
    );
    expect(screen.getByLabelText("street")).toHaveValue("Boulevard Royal");
    expect(String(screen.getByLabelText("street").getAttribute("value"))).not.toMatch(/L-2449|,/);
  });
});
