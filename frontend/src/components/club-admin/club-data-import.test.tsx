import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import en from "@/messages/en.json";

import { ClubDataImport } from "./club-data-import";

jest.mock("@/lib/club-data-import", () => ({
  uploadImportFile: jest.fn(),
  checkImport: jest.fn(),
  commitImport: jest.fn(),
  downloadImportResult: jest.fn(),
  downloadImportTemplate: jest.fn(),
  readImportBatch: jest.fn(),
  saveImportMapping: jest.fn(),
  undoImport: jest.fn(),
}));

jest.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, string>) => {
    const catalog = en.ClubAdmin as Record<string, string>;
    let text = catalog[key] ?? key;
    if (values) {
      for (const [name, value] of Object.entries(values)) {
        text = text.replace(`{${name}}`, value);
      }
    }
    return text;
  },
}));

const api = jest.requireMock("@/lib/club-data-import") as {
  uploadImportFile: jest.Mock;
  checkImport: jest.Mock;
};

function addressRow(line: number, action: "create" | "update") {
  return {
    sheet: "addresses",
    line,
    status: "ok" as const,
    action,
    codes: [] as string[],
    stored_date: "",
    preview: { last_name: "EXAMPLE", first_name: "Ada" },
  };
}

function report(create: number, update: number, skip: number, error = 0) {
  const rows = [
    addressRow(2, "create"),
    addressRow(3, "create"),
    addressRow(4, "create"),
    addressRow(5, "update"),
  ];
  return {
    counts: { ok: 4 - error, warning: 0, error, create, update, skip },
    rows,
    truncated: false,
    saved: false,
    dry_run: false,
  };
}

async function openDuplicates() {
  api.uploadImportFile.mockResolvedValue({
    id: 7,
    warnings: [],
    numbers_included: false,
    sheets: [{ key: "addresses", headers: ["Street"], fields: ["line1"], suggested: {}, saved: null }],
  });
  api.checkImport.mockResolvedValueOnce(report(3, 1, 0));
  render(<ClubDataImport locale="en" />);
  const input = document.querySelector('input[type="file"]') as HTMLInputElement;
  fireEvent.change(input, { target: { files: [new File(["x"], "addresses.xlsx")] } });
  fireEvent.click(screen.getByRole("button", { name: "Upload" }));
  fireEvent.click(await screen.findByRole("button", { name: "Check the rows" }));
  fireEvent.click(await screen.findByRole("button", { name: "Continue" }));
  expect(await screen.findByRole("button", { name: "Apply skip to all" })).toBeInTheDocument();
}

describe("ClubDataImport errors", () => {
  it("shows the skipped sheet names instead of the generic failure", async () => {
    const { ImportApiError } = await import("@/lib/import-failure");
    api.uploadImportFile.mockRejectedValue(new ImportApiError("empty_file", ["Example Club", "Other Club"]));
    render(<ClubDataImport locale="en" />);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File(["x"], "clubs.xlsx")] } });
    fireEvent.click(screen.getByRole("button", { name: "Upload" }));
    expect(await screen.findByText(/These sheets were skipped: Example Club, Other Club/)).toBeInTheDocument();
    expect(screen.getByText(/members, licences, grades, emails, phones, addresses/)).toBeInTheDocument();
    expect(screen.queryByText("The file could not be checked.")).not.toBeInTheDocument();
  });

  it("keeps the generic line when the server sends an unknown reason", async () => {
    const { ImportApiError } = await import("@/lib/import-failure");
    api.uploadImportFile.mockRejectedValue(new ImportApiError("not_a_known_code"));
    render(<ClubDataImport locale="en" />);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File(["x"], "clubs.xlsx")] } });
    fireEvent.click(screen.getByRole("button", { name: "Upload" }));
    await waitFor(() => {
      expect(screen.getByText("The file could not be checked.")).toBeInTheDocument();
    });
  });

  it("does not skip a new address when Apply skip to all is used", async () => {
    await openDuplicates();
    api.checkImport.mockResolvedValueOnce(report(3, 0, 1));
    fireEvent.click(screen.getByRole("button", { name: "Apply skip to all" }));
    fireEvent.click(screen.getByRole("button", { name: "Check without saving" }));
    await waitFor(() => expect(api.checkImport).toHaveBeenCalledTimes(2));
    const actions = api.checkImport.mock.calls[1][2] as Record<string, string>;
    expect(actions).toEqual({ "addresses:5": "skip" });
  });

  it("says why Import is off when every row is skipped, and shows the dry-run counts", async () => {
    await openDuplicates();
    api.checkImport.mockResolvedValueOnce({ ...report(0, 0, 4), dry_run: true });
    fireEvent.click(screen.getByRole("button", { name: "Check without saving" }));
    fireEvent.click(await screen.findByRole("button", { name: "Continue" }));
    expect(await screen.findByText("0 to add, 0 to update, 4 to skip")).toBeInTheDocument();
    expect(screen.getByText("Every row is set to Skip, so there is nothing to import.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Import" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Back to duplicates" }));
    expect(screen.getByRole("button", { name: "Apply skip to all" })).toBeInTheDocument();
  });

  it("says to fix the errors when Import is off for that reason", async () => {
    await openDuplicates();
    api.checkImport.mockResolvedValueOnce({ ...report(0, 0, 0, 2), dry_run: true });
    fireEvent.click(screen.getByRole("button", { name: "Check without saving" }));
    fireEvent.click(await screen.findByRole("button", { name: "Continue" }));
    expect(await screen.findByText("Fix the errors before importing.")).toBeInTheDocument();
    expect(screen.queryByText("Every row is set to Skip, so there is nothing to import.")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Import" })).toBeDisabled();
  });
});
