import { fireEvent, render, screen, within } from "@testing-library/react";

import { MemberGearCard } from "@/components/club-admin/member-gear-card";
import { saveMemberGear, type MemberGear } from "@/lib/member-gear-api";

jest.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, string | number>) =>
    values ? `${key}:${JSON.stringify(values)}` : key,
}));

jest.mock("@/lib/member-gear-api", () => {
  const actual = jest.requireActual("@/lib/member-gear-api");
  return { ...actual, getMemberGear: jest.fn(), saveMemberGear: jest.fn() };
});

beforeAll(() => {
  global.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});

const recorded: MemberGear = {
  member: 9,
  daedo_sock: "M",
  daedo_glove: "S",
  daedo_hogu: "",
  daedo_head: "",
  kpnp_sock: "6",
  kpnp_glove: "",
  kpnp_hogu: "",
  kpnp_head: "",
  chest: "M",
  headgear: "",
  shin: "L",
  forearm: "",
  groin: "",
  mouthguard: "youth",
  dobok: "160",
  tshirt: "104",
  updated_at: "2026-10-21",
};

describe("Member gear card", () => {
  it("shows equipment tabs and only the active section", () => {
    render(<MemberGearCard memberId={9} preview={recorded} />);
    const card = screen.getByRole("region", { name: "gearTitle" });
    expect(card.className).toContain("app-panel");
    expect(within(card).getByRole("tab", { name: "gearProtectors 3", selected: true })).toBeInTheDocument();
    expect(within(card).getByRole("tab", { name: "gearEgear 3" })).toBeInTheDocument();
    expect(within(card).getByRole("tab", { name: "gearClothingOther 2" })).toBeInTheDocument();
    expect(within(card).getByText("gearMouthYouth")).toBeInTheDocument();
    expect(within(card).getByText("L")).toBeInTheDocument();
    expect(within(card).queryByRole("heading", { name: "gearDaedo" })).not.toBeInTheDocument();
    expect(within(card).queryByText('gearDobokCm:{"size":"160"}')).not.toBeInTheDocument();

    fireEvent.click(within(card).getByRole("tab", { name: "gearEgear 3" }));
    expect(within(card).getByRole("heading", { name: "gearDaedo" })).toBeInTheDocument();
    expect(within(card).getByRole("heading", { name: "gearKpnp" })).toBeInTheDocument();
    expect(within(card).getByText("6")).toBeInTheDocument();
    expect(within(card).queryByText("gearMouthYouth")).not.toBeInTheDocument();

    fireEvent.click(within(card).getByRole("tab", { name: "gearClothingOther 2" }));
    expect(within(card).getByText('gearDobokCm:{"size":"160"}')).toBeInTheDocument();
    expect(within(card).getByText("104")).toBeInTheDocument();
    expect(within(card).getByText('gearUpdated:{"date":"21 Oct 2026"}')).toBeInTheDocument();
  });

  it("opens the editor on the active tab and saves every tab", async () => {
    jest.mocked(saveMemberGear).mockResolvedValue({ ...recorded, daedo_sock: "L", tshirt: "XS" });
    render(<MemberGearCard memberId={9} preview={recorded} />);
    fireEvent.click(screen.getByRole("tab", { name: "gearEgear 3" }));
    fireEvent.click(screen.getByRole("button", { name: "gearEdit" }));
    const panel = screen.getByRole("dialog", { name: "gearEdit" });
    expect(within(panel).getByRole("tab", { name: "gearEgear 3", selected: true })).toBeInTheDocument();
    expect(within(panel).getByRole("heading", { name: "gearDaedo" })).toBeInTheDocument();
    expect(within(panel).getByText("gearSockHint")).toBeInTheDocument();
    expect(within(panel).queryByText("gearDobok")).not.toBeInTheDocument();
    const sock = within(panel).getByRole("button", { name: "gearDaedo gearSock" });
    expect(sock).toBeTruthy();

    fireEvent.click(within(panel).getByRole("tab", { name: "gearClothingOther 2" }));
    const dobok = within(panel).getByText("gearDobok").closest("label");
    expect(dobok?.querySelector("[data-required='true']")).toBeNull();
    const chestTab = within(panel).getByRole("tab", { name: "gearProtectors 3" });
    fireEvent.click(chestTab);
    const chest = within(panel).getByText("gearHogu").closest("label");
    expect(chest?.querySelector("[data-required='true']")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "gearSave" }));
    expect(saveMemberGear).toHaveBeenCalledWith(
      expect.objectContaining({ daedo_sock: "M", dobok: "160", tshirt: "104", chest: "M", headgear: "" }),
    );
  });
});
