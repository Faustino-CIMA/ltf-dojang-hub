import { fireEvent, render, screen, within } from "@testing-library/react";

import { ClothingSizesDesk } from "@/components/club-admin/clothing-sizes-desk";
import { getClubClothing, type ClothingItem, type ClothingPreset } from "@/lib/clothing-api";

jest.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, string | number>) =>
    values ? `${key}:${JSON.stringify(values)}` : key,
}));

jest.mock("@/lib/api", () => ({
  apiRequest: jest.fn(async () => ({ role: "club_admin" })),
}));

jest.mock("@/lib/clothing-api", () => {
  const actual = jest.requireActual("@/lib/clothing-api");
  return {
    ...actual,
    getClubClothing: jest.fn(),
    createClubClothing: jest.fn(),
    updateClubClothing: jest.fn(),
    deleteClubClothing: jest.fn(),
    reorderClubClothing: jest.fn(),
  };
});

beforeAll(() => {
  global.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});

const presets: ClothingPreset[] = [
  {
    id: "jako_shirt",
    sizes: [
      { label: "128", age: "", chest_cm: null, length_cm: null, height_min_cm: 123, height_max_cm: 128 },
      { label: "S", age: "", chest_cm: null, length_cm: null, height_min_cm: null, height_max_cm: null },
    ],
  },
  {
    id: "hummel_jacket",
    sizes: [{ label: "116", age: "6", chest_cm: 61, length_cm: null, height_min_cm: 116, height_max_cm: 116 }],
  },
];

const items: ClothingItem[] = [
  {
    id: 1,
    club: 2,
    name: "Dobok",
    note: "",
    position: 0,
    member_count: 2,
    sizes: [{ label: "160", age: "", chest_cm: null, length_cm: null, height_min_cm: 160, height_max_cm: 160 }],
  },
  {
    id: 2,
    club: 2,
    name: "T-shirt",
    note: "",
    position: 1,
    member_count: 0,
    sizes: [{ label: "S", age: "", chest_cm: null, length_cm: null, height_min_cm: null, height_max_cm: null }],
  },
];

describe("Equipment sizes", () => {
  beforeEach(() => {
    jest.mocked(getClubClothing).mockResolvedValue({ items, presets });
  });

  it("lists club items and warns before deleting one that members use", async () => {
    render(<ClothingSizesDesk clubId={2} />);
    expect(await screen.findByRole("heading", { name: "clothingSizesTitle" })).toBeInTheDocument();
    expect(await screen.findByText("Dobok")).toBeInTheDocument();
    expect(screen.getByText("T-shirt")).toBeInTheDocument();
    fireEvent.click(await screen.findByRole("button", { name: 'clothingRowActions:{"name":"Dobok"}' }));
    const menu = screen.getByRole("menu", { name: 'clothingRowActions:{"name":"Dobok"}' });
    expect(within(menu).getAllByRole("menuitem").map((item) => item.textContent)).toEqual([
      "clothingMoveUp",
      "clothingMoveDown",
      "clothingDelete",
    ]);
    fireEvent.click(within(menu).getByRole("menuitem", { name: "clothingDelete" }));
    expect(screen.getByText(/clothingDeleteCount:\{"count":2\}/)).toBeInTheDocument();
  });

  it("fills a new item from the Jako shirt chart", async () => {
    render(<ClothingSizesDesk clubId={2} />);
    fireEvent.click(await screen.findByRole("button", { name: "clothingAdd" }));
    const panel = screen.getByRole("dialog", { name: "clothingNew" });
    const name = within(panel).getByRole("textbox", { name: /clothingName/ });
    expect(name).toBeRequired();
    fireEvent.click(within(panel).getByRole("button", { name: "clothingPreset" }));
    const list = screen.getByRole("listbox", { name: "clothingPreset" });
    fireEvent.click(within(list).getByRole("option", { name: "clothingPresetJakoShirt" }));
    expect(name).toHaveValue("clothingPresetJakoShirt");
    expect(within(panel).getByDisplayValue("123")).toBeInTheDocument();
    expect(within(panel).getByDisplayValue("S")).toBeInTheDocument();
  });
});
