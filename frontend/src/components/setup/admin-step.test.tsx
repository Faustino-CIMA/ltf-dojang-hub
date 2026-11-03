import { fireEvent, render, screen } from "@testing-library/react";

import { AdminStep } from "./admin-step";

jest.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => "en",
}));

jest.mock("@/lib/setup-api", () => ({
  getSetupAdmins: jest.fn().mockResolvedValue({
    admins: [
      {
        user_id: 4,
        username: "emusterfra",
        first_name: "Erika",
        last_name: "MUSTERFRAU",
        clubs: [{ id: 1, name: "Silver Crane Academy" }],
        flags: [],
        link_status: "none",
      },
    ],
    not_imported: [],
  }),
  previewSetupAdmins: jest.fn(),
  confirmSetupAdmins: jest.fn(),
  issueSetupLink: jest.fn(),
  downloadSetupLinks: jest.fn().mockResolvedValue(undefined),
}));

describe("setup link download warning", () => {
  it("shows the confidential warning before downloading links", async () => {
    render(<AdminStep onFinish={() => undefined} />);
    expect(await screen.findByText("MUSTERFRAU Erika")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "downloadLinks" }));
    expect(screen.getByText("downloadWarning")).toBeInTheDocument();
    expect(screen.getByText("downloadRevokeNote")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "copyLink" })).toBeInTheDocument();
  });
});
