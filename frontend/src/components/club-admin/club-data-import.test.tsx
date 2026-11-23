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
};

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
});
