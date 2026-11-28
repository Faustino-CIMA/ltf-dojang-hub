import { render, screen } from "@testing-library/react";

import { ClubJoinOverview } from "./club-join-overview";

const getJoinOverview = jest.fn();

jest.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, string | number>) =>
    values ? `${key} ${Object.values(values).join(" ")}` : key,
  useLocale: () => "en",
}));

jest.mock("next/navigation", () => ({
  usePathname: () => "/en/join/4",
  useRouter: () => ({ push: jest.fn() }),
}));

jest.mock("@/lib/clubmgmt-api", () => ({
  getJoinOverview: (...args: unknown[]) => getJoinOverview(...args),
}));

const overview = {
  name: "Example Dojang",
  city: "Exampleville",
  logo_url: "",
  email: "club@example.test",
  website: "https://example.test",
  iban: "LU00EXAMPLE",
  bank_name: "",
  equipment_note: "Bring a white dobok.",
  fees: [{ name: "Adult", amount: "180.00" }],
  license_fee: { name: "License fee", amount: "25.00" },
  timetable: [
    {
      name: "Kids class",
      audience: "kids",
      weekday: 0,
      start_time: "18:00",
      end_time: "19:00",
      place: "Example Hall",
    },
  ],
  rules: {
    version: 2,
    effective_on: "2026-12-01",
    kind: "url",
    url: "https://example.test/rules",
    filename: "",
  },
  committee: [{ role: "president", title: "", name: "KELLER Lea" }],
  coaches: ["Silva Noa"],
};

describe("ClubJoinOverview", () => {
  beforeEach(() => {
    getJoinOverview.mockReset();
    getJoinOverview.mockResolvedValue(overview);
  });

  it("shows the public club facts and not a member list", async () => {
    render(<ClubJoinOverview clubId={4} />);
    expect(await screen.findByRole("heading", { name: "Example Dojang" })).toBeInTheDocument();
    expect(screen.getByText("Exampleville")).toBeInTheDocument();
    expect(screen.getByText("Adult · 180.00 EUR")).toBeInTheDocument();
    expect(screen.getByText("licenseFee · 25.00 EUR")).toBeInTheDocument();
    expect(screen.getByText("weekday0 · 18:00–19:00")).toBeInTheDocument();
    expect(screen.getByText("Kids class · audience_kids · Example Hall")).toBeInTheDocument();
    expect(screen.getByText("01.12.2026")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "rulesLink" })).toHaveAttribute("href", "https://example.test/rules");
    expect(screen.getByText("Bring a white dobok.")).toBeInTheDocument();
    expect(screen.getByText("club@example.test")).toBeInTheDocument();
    expect(screen.getByText("LU00EXAMPLE")).toBeInTheDocument();
    expect(screen.getByText("role_president · KELLER Lea")).toBeInTheDocument();
    expect(screen.getByText("Silva Noa")).toBeInTheDocument();
    expect(screen.queryByText(/HIDDENPERSON/)).not.toBeInTheDocument();
  });
});
