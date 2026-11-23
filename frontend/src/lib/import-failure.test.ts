import { ImportApiError, importFailureMessage } from "./import-failure";

const translate = (key: string, values?: Record<string, string>) =>
  values ? `${key} ${values.sheets ?? ""} ${values.accepted ?? ""}`.trim() : key;

describe("import failure messages", () => {
  it("names the skipped sheets and the sheet names the import accepts", () => {
    const message = importFailureMessage(
      translate,
      new ImportApiError("empty_file", ["Example Club", "Other Club"]),
      "dataImportFailed",
    );
    expect(message).toContain("dataImportError_empty_file_sheets");
    expect(message).toContain("Example Club, Other Club");
    expect(message).toContain("members, licences, grades, emails, phones, addresses");
    expect(message).toContain("rebate_rules");
  });

  it("uses a specific reason for each known code and keeps the generic line otherwise", () => {
    expect(importFailureMessage(translate, new ImportApiError("empty_file"), "dataImportFailed")).toBe(
      "dataImportError_empty_file",
    );
    expect(importFailureMessage(translate, new ImportApiError("too_many_rows"), "dataImportFailed")).toBe(
      "dataImportError_too_many_rows",
    );
    expect(importFailureMessage(translate, new ImportApiError("bad_workbook"), "dataImportFailed")).toBe(
      "dataImportError_bad_workbook",
    );
    expect(importFailureMessage(translate, new ImportApiError("A macro workbook is not accepted."), "dataImportFailed")).toBe(
      "dataImportError_macro",
    );
    expect(importFailureMessage(translate, new ImportApiError("Fix the errors before importing."), "dataImportFailed")).toBe(
      "dataImportError_fix_errors",
    );
    expect(importFailureMessage(translate, new ImportApiError("Type the batch number shown on this page."), "dataImportUndoFailed")).toBe(
      "dataImportError_undo_batch",
    );
    expect(importFailureMessage(translate, new ImportApiError("something new"), "dataImportFailed")).toBe("dataImportFailed");
    expect(importFailureMessage(translate, new Error("upload"), "dataImportFailed")).toBe("dataImportFailed");
  });
});
