import { render, screen } from "@testing-library/react";

import { AccountSetupGrant } from "./account-setup-grant";

jest.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, string>) => {
    if (key === "roleGrant") return `You're being set up as ${values?.role} for ${values?.organisation}.`;
    if (key === "roleOnly") return `You're being set up as ${values?.role}.`;
    if (key === "role_club_admin") return "Club Admin";
    if (key === "role_ltf_admin") return "LTF Admin";
    return key;
  },
  useLocale: () => "en",
}));

describe("account setup grant", () => {
  it("names the club admin role and the organisation", () => {
    render(
      <AccountSetupGrant
        assignments={[
          { role: "club_admin", organisation: "Silver Crane Academy" },
          { role: "ltf_admin", organisation: "Luxembourg Taekwondo Federation" },
        ]}
      />
    );
    expect(screen.getByText("You're being set up as Club Admin for Silver Crane Academy.")).toBeInTheDocument();
    expect(screen.getByText("You're being set up as LTF Admin for Luxembourg Taekwondo Federation.")).toBeInTheDocument();
  });
});
