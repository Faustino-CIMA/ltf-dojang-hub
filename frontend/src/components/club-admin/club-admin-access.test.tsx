import { fireEvent, render, screen } from "@testing-library/react";

import {
  AccessBadges,
  ClubAdminAccessMenu,
  ClubAdminAccessPanel,
  type AccessAdmin,
  type AccessCopy,
} from "@/components/club-admin/club-admin-access";

jest.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

const copy: AccessCopy = {
  addEmail: "Add email address",
  sendInvite: "Send invitation to set password",
  copyInvite: "Copy invitation link",
  sendReset: "Send password reset email",
  copyReset: "Copy password reset link",
  hintInvite: "They open the link and choose a password.",
  hintReset: "They open the link and choose a new password.",
  hintEmail: "Add their email address, then send the message or copy the link.",
  email: "Email address",
  emailHint: "Needed to send the email. You can still copy the link without one.",
  emailHintReady: "The message goes to this address.",
  emailHintLocked: "This address is already saved.",
  emailRequired: "Enter an email address to send this.",
  changeTitle: "Use this new email?",
  changeBody: "The message will go to {email} instead of {previous}.",
  changeConfirmSend: "Change email and send",
  changeConfirmCopy: "Change email and copy",
  locale: "Email language",
  localeName: (code) => code,
  kindSetup: "This person has not chosen a password yet.",
  kindReset: "This person already has a password. They will choose a new one.",
  remove: (club) => `Remove as club admin of ${club}`,
};

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
  it("shows an invitation was sent when the password is not chosen yet", () => {
    render(
      <AccessBadges
        admin={admin}
        labels={{
          noEmail: "No email address",
          linkSent: "Invitation sent",
          linkExpired: "Invitation expired",
          passwordSet: "Has a password",
          meta: "Sent {sent}. Expires {expires}.",
        }}
      />,
    );
    expect(screen.getByText("No email address")).toBeInTheDocument();
    expect(screen.getByText("Invitation sent")).toBeInTheDocument();
    expect(screen.queryByText("Has a password")).not.toBeInTheDocument();
  });

  it("asks for an email before sending, and keeps remove last", () => {
    const onOpen = jest.fn();
    render(
      <ClubAdminAccessMenu
        admin={{ ...admin, clubs: [{ id: 1, name: "Silver Crane" }, { id: 2, name: "Second Dojang" }] }}
        menuLabel="Actions for NG Ada"
        copy={copy}
        onOpen={onOpen}
        onCopy={() => undefined}
        onRemove={() => undefined}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Actions for NG Ada" }));
    const items = screen.getAllByRole("menuitem");
    expect(items.map((item) => item.textContent)).toEqual([
      "Add email address",
      "Copy invitation link",
      "Remove as club admin of Silver Crane",
      "Remove as club admin of Second Dojang",
    ]);
    expect(screen.queryByRole("menuitem", { name: "Send invitation to set password" })).not.toBeInTheDocument();
    expect(items[2]).toHaveClass("text-destructive");
    expect(items[3]).toHaveClass("text-destructive");
    fireEvent.click(screen.getByRole("menuitem", { name: "Add email address" }));
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it("offers an invitation when the person has an email and no password yet", () => {
    render(
      <ClubAdminAccessMenu
        admin={{ ...admin, email: "ada@example.com" }}
        menuLabel="Actions for NG Ada"
        copy={copy}
        onOpen={() => undefined}
        onCopy={() => undefined}
        onRemove={() => undefined}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Actions for NG Ada" }));
    expect(screen.getByRole("menuitem", { name: "Send invitation to set password" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Copy invitation link" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Remove as club admin of Silver Crane" })).toHaveClass("text-destructive");
  });

  it("offers a password reset when the person already has a password", () => {
    render(
      <ClubAdminAccessMenu
        admin={{ ...admin, email: "ada@example.com", password_set: true, access_kind: "reset" }}
        menuLabel="Actions for NG Ada"
        copy={copy}
        onOpen={() => undefined}
        onCopy={() => undefined}
        onRemove={() => undefined}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Actions for NG Ada" }));
    expect(screen.getByRole("menuitem", { name: "Send password reset email" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Copy password reset link" })).toBeInTheDocument();
  });

  it("keeps send disabled until an email address is entered", () => {
    render(
      <ClubAdminAccessPanel
        admin={admin}
        open
        allowEmailChange
        locale="en"
        busy={false}
        error={null}
        closeLabel="Close"
        copy={copy}
        onClose={() => undefined}
        onSubmit={() => undefined}
      />,
    );
    expect(screen.getByRole("dialog", { name: "Add email address" })).toBeInTheDocument();
    expect(screen.getByText("Add their email address, then send the message or copy the link.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Send invitation to set password" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Copy invitation link" })).toBeEnabled();
    fireEvent.change(screen.getByLabelText(/Email address/), { target: { value: "ada@example.com" } });
    expect(screen.getByRole("button", { name: "Send invitation to set password" })).toBeEnabled();
  });
});
