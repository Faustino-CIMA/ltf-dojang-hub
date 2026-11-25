import { readFileSync } from "node:fs";
import path from "node:path";

import { fireEvent, render, screen } from "@testing-library/react";

import { HelpPanel } from "@/components/help/help-panel";

jest.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn() }),
}));

describe("HelpPanel", () => {
  it("searches the manual for this desk and leaves other desks out", () => {
    const club = render(
      <HelpPanel locale="en" desk="club_admin" pathname="/en/dashboard/club/members" onClose={() => undefined} onStartGuide={() => undefined} />,
    );
    fireEvent.change(screen.getByRole("textbox", { name: "helpSearchLabel" }), { target: { value: "Membership fees" } });
    expect(screen.getByRole("button", { name: "Membership fees" })).toBeInTheDocument();
    club.unmount();

    render(
      <HelpPanel locale="en" desk="coach" pathname="/en/dashboard/club/training" onClose={() => undefined} onStartGuide={() => undefined} />,
    );
    fireEvent.change(screen.getByRole("textbox", { name: "helpSearchLabel" }), { target: { value: "Membership fees" } });
    expect(screen.queryByRole("button", { name: "Membership fees" })).not.toBeInTheDocument();
    fireEvent.change(screen.getByRole("textbox", { name: "helpSearchLabel" }), { target: { value: "Taking the roll" } });
    expect(screen.getByRole("button", { name: "Taking the roll" })).toBeInTheDocument();
  });

  it("does not call a page with no chapter a failed search", () => {
    render(<HelpPanel locale="en" desk="member" pathname="/en/dashboard/member" onClose={() => undefined} onStartGuide={() => undefined} />);
    expect(screen.getByText("helpOnThisPage")).toBeInTheDocument();
    expect(screen.queryByText("helpEmpty")).not.toBeInTheDocument();
  });

  it("offers the page only after the section is open", () => {
    const onClose = jest.fn();
    render(
      <HelpPanel locale="en" desk="club_admin" pathname="/en/dashboard/club/members" onClose={onClose} onStartGuide={() => undefined} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Club overview" }));
    expect(screen.getByRole("button", { name: "helpOpenPage" })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "modalClose" })).toHaveLength(1);
  });

  it("starts the order guide from its manual section", () => {
    const onStartGuide = jest.fn();
    render(
      <HelpPanel locale="en" desk="club_admin" pathname="/en/dashboard/club/members" onClose={() => undefined} onStartGuide={onStartGuide} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Ordering licenses" }));
    fireEvent.click(screen.getByRole("button", { name: "guideShowMe" }));
    expect(onStartGuide).toHaveBeenCalledWith("order-license");
    expect(screen.queryByRole("button", { name: "helpOpenPage" })).not.toBeInTheDocument();
  });
});

describe("help stays out of the shell until it is opened", () => {
  it("loads the panel with a dynamic import", () => {
    const shell = readFileSync(path.join(process.cwd(), "src/components/app-shell.tsx"), "utf8");
    expect(shell).not.toContain('from "@/components/help/help-panel"');
    expect(shell).toContain('import("@/components/help/help-panel")');
  });
});
