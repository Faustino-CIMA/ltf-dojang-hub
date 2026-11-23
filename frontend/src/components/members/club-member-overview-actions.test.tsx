import { fireEvent, render, screen } from "@testing-library/react";

import { DeskAccessContext } from "@/components/desk-access";
import { RowActionMenu } from "@/components/ui/row-action-menu";

import { clubMemberOverviewActions } from "./club-member-overview-actions";

const labels = {
  editLabel: "Edit",
  statementLabel: "Download statement",
  memberDataLabel: "Download member data",
  verifyLabel: "Verify",
  verifyHref: "/en/dashboard/club/members/12/verify",
};

function actions(overrides: Partial<Parameters<typeof clubMemberOverviewActions>[0]> = {}) {
  return clubMemberOverviewActions({
    canManage: true,
    statementAvailable: true,
    onEdit: jest.fn(),
    onStatement: jest.fn(),
    onMemberData: jest.fn(),
    accountActions: [],
    ...labels,
    ...overrides,
  });
}

function openMenu(items = actions()) {
  render(<RowActionMenu label="Row actions" actions={items} />);
  fireEvent.click(screen.getByRole("button", { name: "Row actions" }));
  return items;
}

describe("clubMemberOverviewActions", () => {
  it("puts Edit first, then the statement, the member file, and Verify, each with an icon", () => {
    const onStatement = jest.fn();
    const onMemberData = jest.fn();
    openMenu(actions({ onStatement, onMemberData }));
    const items = screen.getAllByRole("menuitem");
    expect(items.map((item) => item.textContent)).toEqual([
      "Edit",
      "Download statement",
      "Download member data",
      "Verify",
    ]);
    for (const item of items) {
      expect(item.querySelector("svg")).not.toBeNull();
    }
    expect(screen.getByRole("menuitem", { name: "Verify" })).toHaveAttribute(
      "href",
      "/en/dashboard/club/members/12/verify",
    );
    fireEvent.click(screen.getByRole("menuitem", { name: "Download statement" }));
    expect(onStatement).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Row actions" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Download member data" }));
    expect(onMemberData).toHaveBeenCalledTimes(1);
  });

  it("keeps the statement for a coach and hides the admin actions", () => {
    openMenu(actions({ canManage: false }));
    expect(screen.getAllByRole("menuitem").map((item) => item.textContent)).toEqual(["Download statement"]);
  });

  it("hides the statement when club management is off", () => {
    openMenu(actions({ statementAvailable: false }));
    expect(screen.getAllByRole("menuitem").map((item) => item.textContent)).toEqual([
      "Edit",
      "Download member data",
      "Verify",
    ]);
  });

  it("replaces Verify with Unlock for a verified member, and hides Unlock on a view-only desk", () => {
    const onUnlock = jest.fn();
    openMenu(actions({ verified: true, unlockLabel: "Unlock card check", onUnlock }));
    expect(screen.queryByRole("menuitem", { name: "Verify" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("menuitem", { name: "Unlock card check" }));
    expect(onUnlock).toHaveBeenCalledTimes(1);
    render(
      <DeskAccessContext.Provider value={{ readOnly: true, viewOnlyLabel: "View only" }}>
        <RowActionMenu
          label="View only actions"
          actions={actions({ verified: true, unlockLabel: "Unlock card check", onUnlock })}
        />
      </DeskAccessContext.Provider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "View only actions" }));
    expect(screen.queryByRole("menuitem", { name: "Unlock card check" })).not.toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Download statement" })).toBeInTheDocument();
  });

  it("keeps the downloads and Verify on a view-only desk, and hides Edit", () => {
    render(
      <DeskAccessContext.Provider value={{ readOnly: true, viewOnlyLabel: "View only" }}>
        <RowActionMenu
          label="Row actions"
          actions={actions({
            accountActions: [{ key: "create", label: "Create account", onSelect: () => undefined }],
          })}
        />
      </DeskAccessContext.Provider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Row actions" }));
    expect(screen.getAllByRole("menuitem").map((item) => item.textContent)).toEqual([
      "Download statement",
      "Download member data",
      "Verify",
    ]);
  });
});
