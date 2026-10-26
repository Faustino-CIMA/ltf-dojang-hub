import { fireEvent, render, screen } from "@testing-library/react";

import { AccessBadges, ClubAdminAccessMenu, type AccessAdmin } from "@/components/club-admin/club-admin-access";

jest.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

const admin: AccessAdmin = {
  id: 4,
  username: "ang",
  email: "",
  first_name: "Ada",
  last_name: "Ng",
  clubs: [{ id: 1, name: "Silver Crane" }],
  password_set: false,
  link_status: "active",
  link_sent_at: "2026-10-26T10:00:00Z",
  link_expires_at: "2026-11-02T10:00:00Z",
  access_kind: "setup",
};

describe("club admin access controls", () => {
  it("shows link sent for someone who has not set a password", () => {
    render(
      <AccessBadges
        admin={admin}
        labels={{
          noEmail: "No email",
          linkSent: "Link sent",
          linkExpired: "Link expired",
          passwordSet: "Password set",
          meta: "Sent {sent}. Expires {expires}.",
        }}
      />,
    );
    expect(screen.getByText("No email")).toBeInTheDocument();
    expect(screen.getByText("Link sent")).toBeInTheDocument();
    expect(screen.queryByText("Password set")).not.toBeInTheDocument();
  });

  it("puts remove last in the menu", () => {
    render(
      <ClubAdminAccessMenu
        admin={{ ...admin, email: "ada@example.com", clubs: [{ id: 1, name: "Silver Crane" }, { id: 2, name: "Second Dojang" }] }}
        menuLabel="Actions for NG Ada"
        sendLabel="Send set-password link"
        copyLabel="Copy set-password link"
        removeLabel={(club) => `Remove from ${club}`}
        onSend={() => undefined}
        onCopy={() => undefined}
        onRemove={() => undefined}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Actions for NG Ada" }));
    const items = screen.getAllByRole("menuitem").map((item) => item.textContent);
    expect(items.slice(-2)).toEqual(["Remove from Silver Crane", "Remove from Second Dojang"]);
  });
});
