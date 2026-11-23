export const IMPORT_SHEET_NAMES = [
  "members",
  "licences",
  "grades",
  "emails",
  "phones",
  "addresses",
  "people",
  "contacts",
  "person_emails",
  "person_phones",
  "person_addresses",
  "families",
  "family_members",
  "rebate_rules",
] as const;

const DETAIL_KEYS: Record<string, string> = {
  empty_file: "dataImportError_empty_file",
  too_many_rows: "dataImportError_too_many_rows",
  too_large: "dataImportError_too_large",
  bad_workbook: "dataImportError_bad_workbook",
  bad_zip: "dataImportError_bad_zip",
  bad_json: "dataImportError_bad_json",
  bad_type: "dataImportError_bad_type",
  bad_encoding: "dataImportError_bad_encoding",
  macro: "dataImportError_macro",
  "Choose a file.": "dataImportError_choose_file",
  "A macro workbook is not accepted.": "dataImportError_macro",
  "Use a CSV, Excel, JSON, or zip file.": "dataImportError_bad_type",
  "The file is larger than 5 MB.": "dataImportError_too_large",
  "This file is no longer available.": "dataImportError_file_gone",
  "The column mapping is not valid.": "dataImportError_bad_mapping",
  "Name this mapping.": "dataImportError_name_mapping",
  "Fix the errors before importing.": "dataImportError_fix_errors",
  "Choose CSV or XLSX.": "dataImportError_template_format",
  "This import is for a club admin.": "dataImportError_club_admin",
  "Open a club desk first.": "dataImportError_open_desk",
  "The result is not ready.": "dataImportError_result_not_ready",
  "This import is no longer available.": "dataImportError_import_gone",
  "Type the batch number shown on this page.": "dataImportError_undo_batch",
};

export class ImportApiError extends Error {
  readonly detail: string;
  readonly sheets: string[];

  constructor(detail: string, sheets: string[] = []) {
    super(detail || "import");
    this.detail = detail;
    this.sheets = sheets;
  }
}

type Translator = (key: string, values?: Record<string, string>) => string;

export function importFailureMessage(translate: Translator, error: unknown, fallbackKey: string): string {
  if (!(error instanceof ImportApiError) || !error.detail) {
    return translate(fallbackKey);
  }
  if (error.detail === "empty_file" && error.sheets.length > 0) {
    return translate("dataImportError_empty_file_sheets", {
      sheets: error.sheets.join(", "),
      accepted: IMPORT_SHEET_NAMES.join(", "),
    });
  }
  const key = DETAIL_KEYS[error.detail];
  if (!key) {
    return translate(fallbackKey);
  }
  return translate(key);
}
