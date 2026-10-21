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
  shin: "L",
  forearm: "",
  groin: "",
  mouthguard: "youth",
  dobok: "160",
  tshirt: "104",
  updated_at: "2026-10-21",
};

describe("Member gear card", () => {
  it("shows Daedo, KPNP, other protectors, and clothing", () => {
    render(<MemberGearCard memberId={9} preview={recorded} />);
    const card = screen.getByRole("region", { name: "gearTitle" });
    expect(card.className).toContain("app-panel");
    expect(within(card).getByRole("heading", { name: "gearDaedo" })).toBeInTheDocument();
    expect(within(card).getByRole("heading", { name: "gearKpnp" })).toBeInTheDocument();
    expect(within(card).getByRole("heading", { name: "gearOther" })).toBeInTheDocument();
    expect(within(card).getByRole("heading", { name: "gearClothing" })).toBeInTheDocument();
    expect(within(card).getByText("M")).toBeInTheDocument();
    expect(within(card).getByText("6")).toBeInTheDocument();
    expect(within(card).getByText("gearMouthYouth")).toBeInTheDocument();
    expect(within(card).getByText('gearDobokCm:{"size":"160"}')).toBeInTheDocument();
    expect(within(card).getByText("104")).toBeInTheDocument();
    expect(within(card).getByText('gearUpdated:{"date":"21 Oct 2026"}')).toBeInTheDocument();
  });

  it("edits sizes from a side panel and does not mark them required", async () => {
    jest.mocked(saveMemberGear).mockResolvedValue({ ...recorded, daedo_sock: "L", tshirt: "XS" });
    render(<MemberGearCard memberId={9} preview={recorded} />);
    fireEvent.click(screen.getByRole("button", { name: "gearEdit" }));
    const panel = screen.getByRole("dialog", { name: "gearEdit" });
    expect(within(panel).getByRole("heading", { name: "gearClothing" })).toBeInTheDocument();
    expect(within(panel).getByText("gearSockHint")).toBeInTheDocument();
    const dobok = within(panel).getByText("gearDobok").closest("label");
    expect(dobok?.querySelector("[data-required='true']")).toBeNull();
    const sock = within(panel).getByRole("button", { name: "gearDaedo gearSock" });
    expect(sock).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "gearSave" }));
    expect(saveMemberGear).toHaveBeenCalledWith(expect.objectContaining({ daedo_sock: "M", dobok: "160", tshirt: "104" }));
  });
});
