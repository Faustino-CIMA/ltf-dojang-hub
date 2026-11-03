import { showImportWizardPrevious } from "@/lib/import-wizard-nav";

describe("import wizard navigation", () => {
  it("hides Previous after the import result, because the import cannot be undone", () => {
    expect(showImportWizardPrevious("source")).toBe(false);
    expect(showImportWizardPrevious("mapping")).toBe(true);
    expect(showImportWizardPrevious("preview")).toBe(true);
    expect(showImportWizardPrevious("confirm")).toBe(true);
    expect(showImportWizardPrevious("result")).toBe(false);
  });
});
