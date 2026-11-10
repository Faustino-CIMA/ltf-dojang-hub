import ClubAdminsPage from "@/app/[locale]/dashboard/club/admins/page";

jest.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));

describe("old club admins address", () => {
  it("opens the club profile section", async () => {
    await expect(ClubAdminsPage({ params: Promise.resolve({ locale: "fr" }) })).rejects.toThrow(
      "REDIRECT:/fr/dashboard/club/settings#club-admins",
    );
  });
});
