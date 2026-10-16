export type ImportWizardStep = "source" | "mapping" | "preview" | "confirm" | "result";

export function showImportWizardPrevious(step: ImportWizardStep): boolean {
  return step !== "source" && step !== "result";
}
