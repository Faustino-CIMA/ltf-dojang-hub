import { fireEvent, render, screen } from "@testing-library/react";

import { RowActionMenu } from "@/components/ui/row-action-menu";

import { memberVerifyPath, verifyMemberMenuAction } from "./verify-member-action";

describe("verifyMemberMenuAction", () => {
  it("opens the existing club or LTF verify page", () => {
    expect(memberVerifyPath("en", "club", 12)).toBe("/en/dashboard/club/members/12/verify");
    expect(memberVerifyPath("fr", "ltf", 4)).toBe("/fr/dashboard/ltf/members/4/verify");
  });

  it("shows a shield and label, and keeps delete last", () => {
    const onSelect = jest.fn();
    render(
      <RowActionMenu
        label="Row actions"
        actions={[
          { key: "edit", label: "Edit", onSelect: () => undefined },
          ...verifyMemberMenuAction({ verified: false, label: "Verify member", onSelect }),
          { key: "delete", label: "Delete", destructive: true, onSelect: () => undefined },
        ]}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Row actions" }));
    const items = screen.getAllByRole("menuitem").map((item) => item.textContent);
    expect(items).toEqual(["Edit", "Verify member", "Delete"]);
    const verify = screen.getByRole("menuitem", { name: "Verify member" });
    expect(verify.querySelector("svg")).not.toBeNull();
    expect(verify).not.toHaveClass("text-destructive");
    fireEvent.click(verify);
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it("hides the action when the member is already verified", () => {
    const onSelect = jest.fn();
    render(
      <RowActionMenu
        label="Row actions"
        actions={[
          { key: "edit", label: "Edit", onSelect: () => undefined },
          ...verifyMemberMenuAction({ verified: true, label: "Verify member", onSelect }),
          { key: "delete", label: "Delete", destructive: true, onSelect: () => undefined },
        ]}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Row actions" }));
    expect(screen.queryByRole("menuitem", { name: "Verify member" })).not.toBeInTheDocument();
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("offers Unlock to a club admin and keeps Verify for everyone else", () => {
    const onUnlock = jest.fn();
    const onSelect = jest.fn();
    render(
      <RowActionMenu
        label="Admin actions"
        actions={[
          ...verifyMemberMenuAction({
            verified: true,
            label: "Verify member",
            onSelect,
            canUnlock: true,
            unlockLabel: "Unlock card check",
            onUnlock,
          }),
        ]}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Admin actions" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Unlock card check" }));
    expect(onUnlock).toHaveBeenCalledTimes(1);
    expect(onSelect).not.toHaveBeenCalled();

    render(
      <RowActionMenu
        label="Coach actions"
        actions={verifyMemberMenuAction({
          verified: false,
          label: "Verify member",
          onSelect,
          canUnlock: false,
        })}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Coach actions" }));
    expect(screen.getByRole("menuitem", { name: "Verify member" })).toBeInTheDocument();
  });
});
