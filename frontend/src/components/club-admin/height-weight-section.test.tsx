import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";

import { EntityTable } from "@/components/club-admin/entity-table";
import { HeightWeightSection, latestMeasurementColumns } from "@/components/club-admin/height-weight-section";
import {
  deleteBodyMeasurement,
  getBodyMeasurements,
  saveBodyMeasurement,
  todayIsoDate,
  type MeasurementList,
} from "@/lib/body-measurements-api";

jest.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, string | number>) =>
    values ? `${key}:${JSON.stringify(values)}` : key,
}));

jest.mock("@/lib/body-measurements-api", () => {
  const actual = jest.requireActual("@/lib/body-measurements-api");
  return {
    ...actual,
    getBodyMeasurements: jest.fn(),
    saveBodyMeasurement: jest.fn(),
    deleteBodyMeasurement: jest.fn(),
  };
});

beforeAll(() => {
  global.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});

const emptyList: MeasurementList = { results: [], suggestion: null };

const history: MeasurementList = {
  suggestion: {
    age_class: "junior",
    category: "-63 kg",
    weight_kg: "62.4",
    measured_on: "2026-04-02",
  },
  results: [
    {
      id: 2,
      member: 9,
      measured_on: "2026-04-02",
      weight_kg: "62.4",
      height_cm: null,
      note: "After training",
      recorded_by: 1,
      created_at: "2026-04-02T10:00:00Z",
      updated_at: "2026-04-02T10:00:00Z",
    },
    {
      id: 1,
      member: 9,
      measured_on: "2026-01-15",
      weight_kg: "60.0",
      height_cm: 168,
      note: "",
      recorded_by: 1,
      created_at: "2026-01-15T10:00:00Z",
      updated_at: "2026-01-15T10:00:00Z",
    },
  ],
};

function openAddPanel() {
  fireEvent.click(screen.getByRole("button", { name: "heightWeightAdd" }));
  return screen.getByRole("dialog");
}

describe("Height and weight section", () => {
  beforeEach(() => {
    jest.mocked(getBodyMeasurements).mockResolvedValue(emptyList);
    jest.mocked(saveBodyMeasurement).mockResolvedValue(history.results[0]);
    jest.mocked(deleteBodyMeasurement).mockResolvedValue(null);
  });

  it("defaults the entry panel to weight and marks only that field required", async () => {
    render(<HeightWeightSection memberId={9} />);
    await screen.findByText("heightWeightEmptyTitle");
    const panel = openAddPanel();
    expect(within(panel).getByLabelText(/heightWeightDate/)).toHaveValue(todayIsoDate());
    expect(within(panel).getByLabelText(/heightWeightWeight/)).toBeInTheDocument();
    expect(within(panel).queryByLabelText(/heightWeightHeight/)).not.toBeInTheDocument();
    expect(within(panel).getByText("heightWeightWeight").closest("label")?.querySelector("[data-required='true']")).toBeTruthy();
    expect(within(panel).getByText("heightWeightNote").closest("label")?.querySelector("[data-required='true']")).toBeNull();
  });

  it("shows height or both after the kind choice", async () => {
    render(<HeightWeightSection memberId={9} />);
    await screen.findByText("heightWeightEmptyTitle");
    const panel = openAddPanel();
    fireEvent.click(within(panel).getByRole("button", { name: "heightWeightKind" }));
    fireEvent.click(screen.getByRole("option", { name: "heightWeightKindHeight" }));
    expect(within(panel).queryByLabelText(/heightWeightWeight/)).not.toBeInTheDocument();
    expect(within(panel).getByLabelText(/heightWeightHeight/)).toBeInTheDocument();

    fireEvent.click(within(panel).getByRole("button", { name: "heightWeightKind" }));
    fireEvent.click(screen.getByRole("option", { name: "heightWeightKindBoth" }));
    expect(within(panel).getByLabelText(/heightWeightWeight/)).toBeInTheDocument();
    expect(within(panel).getByLabelText(/heightWeightHeight/)).toBeInTheDocument();
    expect(within(panel).getByText("heightWeightHeight").closest("label")?.querySelector("[data-required='true']")).toBeTruthy();
  });

  it("saves only the chosen measurement and refuses a weight outside the range", async () => {
    render(<HeightWeightSection memberId={9} />);
    await screen.findByText("heightWeightEmptyTitle");
    const panel = openAddPanel();
    fireEvent.click(within(panel).getByRole("button", { name: "heightWeightSave" }));
    expect(screen.getByText("heightWeightRequired")).toBeInTheDocument();

    fireEvent.change(within(panel).getByLabelText(/heightWeightWeight/), { target: { value: "9" } });
    fireEvent.click(within(panel).getByRole("button", { name: "heightWeightSave" }));
    expect(screen.getByText("heightWeightRangeError")).toBeInTheDocument();
    expect(saveBodyMeasurement).not.toHaveBeenCalled();

    fireEvent.change(within(panel).getByLabelText(/heightWeightWeight/), { target: { value: "62.4" } });
    fireEvent.change(within(panel).getByLabelText(/heightWeightNote/), { target: { value: "Morning" } });
    fireEvent.click(within(panel).getByRole("button", { name: "heightWeightSave" }));
    await waitFor(() => expect(saveBodyMeasurement).toHaveBeenCalled());
    expect(saveBodyMeasurement).toHaveBeenCalledWith(null, {
      member: 9,
      measured_on: todayIsoDate(),
      weight_kg: "62.4",
      height_cm: null,
      note: "Morning",
    });
  });

  it("shows the history, both trend charts, and the suggested category", async () => {
    jest.mocked(getBodyMeasurements).mockResolvedValue(history);
    render(<HeightWeightSection memberId={9} />);
    expect(await screen.findByText("heightWeightSuggestion:{\"category\":\"-63 kg\",\"ageClass\":\"nationalTeamAgeJunior (15–17)\"}")).toBeInTheDocument();
    expect(screen.getByText("heightWeightKg:{\"value\":\"62.4\"}")).toBeInTheDocument();
    expect(screen.getByText("heightWeightCm:{\"value\":168}")).toBeInTheDocument();
    const charts = screen.getAllByRole("img");
    expect(charts).toHaveLength(2);
    expect(charts[0]).toHaveAttribute("aria-label", "heightWeightWeightChart");
    expect(charts[1]).toHaveAttribute("aria-label", "heightWeightHeightChart");
    expect(charts[0].querySelector("polyline")).toBeTruthy();
    expect(charts[1].querySelector("polyline")).toBeTruthy();
  });

  it("edits from the row menu and deletes as the last action", async () => {
    jest.mocked(getBodyMeasurements).mockResolvedValue(history);
    render(<HeightWeightSection memberId={9} />);
    await screen.findByText("After training");
    const menus = screen.getAllByRole("button", { name: "heightWeightActions" });
    fireEvent.click(menus[0]);
    const menu = screen.getByRole("menu", { name: "heightWeightActions" });
    const items = within(menu).getAllByRole("menuitem");
    expect(items.map((item) => item.textContent)).toEqual(["heightWeightEditAction", "heightWeightDeleteAction"]);
    fireEvent.click(items[0]);
    const panel = screen.getByRole("dialog");
    expect(within(panel).getByRole("heading", { name: "heightWeightEdit" })).toBeInTheDocument();
    expect(within(panel).getByLabelText(/heightWeightWeight/)).toHaveValue("62.4");
    expect(within(panel).queryByLabelText(/heightWeightHeight/)).not.toBeInTheDocument();

    fireEvent.click(within(panel).getByRole("button", { name: "heightWeightClose" }));
    fireEvent.click(screen.getAllByRole("button", { name: "heightWeightActions" })[0]);
    fireEvent.click(screen.getByRole("menuitem", { name: "heightWeightDeleteAction" }));
    await waitFor(() => expect(deleteBodyMeasurement).toHaveBeenCalledWith(2));
  });
});

describe("Latest measurement columns", () => {
  it("shows the value and the measured date", () => {
    render(
      <EntityTable
        rows={[
          {
            id: 1,
            latest_weight_kg: "62.4",
            latest_weight_on: "2026-03-01",
            latest_height_cm: 170,
            latest_height_on: "2026-02-01",
          },
          { id: 2 },
        ]}
        sort={null}
        onSortChange={() => undefined}
        columns={latestMeasurementColumns((key, values) => (values ? `${key}:${values.value}` : key))}
      />
    );
    expect(screen.getByRole("columnheader", { name: "heightWeightLatestWeight" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "heightWeightLatestHeight" })).toBeInTheDocument();
    expect(screen.getByText("heightWeightKg:62.4")).toBeInTheDocument();
    expect(screen.getByText("01 Mar 2026")).toBeInTheDocument();
    expect(screen.getByText("heightWeightCm:170")).toBeInTheDocument();
    expect(screen.getByText("01 Feb 2026")).toBeInTheDocument();
    expect(screen.getAllByText("—")).toHaveLength(2);
  });
});
