import { API_URL } from "@/lib/api";
import { readActiveDeskHeader } from "@/lib/active-desk";
import { getToken } from "@/lib/auth";
import { ImportApiError } from "@/lib/import-failure";

export type ImportSheet = {
  key: string;
  headers: string[];
  fields: string[];
  suggested: Record<string, string>;
  saved: { id: number; name: string; mapping: Record<string, string> } | null;
};

export type ImportUpload = {
  id: number;
  warnings: { code: string; sheet?: string }[];
  numbers_included: boolean;
  sheets: ImportSheet[];
};

export type ImportRow = {
  sheet: string;
  line: number;
  status: "ok" | "warning" | "error";
  action: "create" | "update" | "skip";
  codes: string[];
  stored_date: string;
  preview: Record<string, string>;
};

export type ImportReport = {
  counts: { ok: number; warning: number; error: number; create: number; update: number; skip: number; remove?: number };
  rows: ImportRow[];
  truncated: boolean;
  saved: boolean;
  dry_run: boolean;
};

async function authorizedFetch(path: string, init: RequestInit = {}) {
  const token = getToken();
  const desk = readActiveDeskHeader();
  return fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      ...(token ? { Authorization: `Token ${token}` } : {}),
      ...(desk ? { "X-Desk": desk } : {}),
      ...init.headers,
    },
  });
}

async function rejectUnlessOk(response: Response) {
  if (response.ok) {
    return;
  }
  let detail = "";
  let sheets: string[] = [];
  try {
    const body = (await response.json()) as { detail?: unknown; sheets?: unknown };
    if (typeof body.detail === "string") {
      detail = body.detail;
    }
    if (Array.isArray(body.sheets)) {
      sheets = body.sheets.filter((item): item is string => typeof item === "string" && item.length > 0);
    }
  } catch {
    detail = "";
  }
  throw new ImportApiError(detail, sheets);
}

function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export async function downloadImportTemplate(fileFormat: "csv" | "xlsx", locale: string) {
  const response = await authorizedFetch(
    `/api/club-data/import/template/?file_format=${fileFormat}&locale=${encodeURIComponent(locale)}`,
  );
  if (!response.ok) {
    await rejectUnlessOk(response);
  }
  const blob = await response.blob();
  saveBlob(blob, fileFormat === "csv" ? "club-import-template.zip" : "club-import-template.xlsx");
}

export async function uploadImportFile(file: File): Promise<ImportUpload> {
  const body = new FormData();
  body.append("file", file);
  const response = await authorizedFetch("/api/club-data/import/", { method: "POST", body });
  if (!response.ok) {
    await rejectUnlessOk(response);
  }
  return (await response.json()) as ImportUpload;
}

export async function saveImportMapping(payload: {
  name: string;
  sheet: string;
  headers: string[];
  mapping: Record<string, string>;
}) {
  const response = await authorizedFetch("/api/club-data/import/mappings/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    await rejectUnlessOk(response);
  }
}

export async function checkImport(
  uploadId: number,
  mapping: Record<string, Record<string, string>>,
  actions: Record<string, string>,
  dryRun: boolean,
): Promise<ImportReport> {
  const path = dryRun ? "dry-run" : "check";
  const response = await authorizedFetch(`/api/club-data/import/${uploadId}/${path}/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mapping, actions }),
  });
  if (!response.ok) {
    await rejectUnlessOk(response);
  }
  return (await response.json()) as ImportReport;
}

export type ImportBatch = {
  id: number;
  status: "queued" | "running" | "succeeded" | "failed";
  rows_done: number;
  rows_total: number;
  counts: { created?: number; updated?: number; skipped?: number; errors?: number };
  late_errors: { sheet: string; line: number; code: string }[];
  grades_included: boolean;
  grades_not_undone: boolean;
  undone: boolean;
  undo_open: boolean;
  grades_kept?: number;
  members_kept?: number;
};

export async function commitImport(
  uploadId: number,
  mapping: Record<string, Record<string, string>>,
  actions: Record<string, string>,
): Promise<ImportBatch> {
  const response = await authorizedFetch(`/api/club-data/import/${uploadId}/commit/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mapping, actions }),
  });
  if (!response.ok) {
    await rejectUnlessOk(response);
  }
  return (await response.json()) as ImportBatch;
}

export async function readImportBatch(batchId: number): Promise<ImportBatch> {
  const response = await authorizedFetch(`/api/club-data/import/batches/${batchId}/`);
  if (!response.ok) {
    await rejectUnlessOk(response);
  }
  return (await response.json()) as ImportBatch;
}

export async function downloadImportResult(batchId: number, fileFormat: "csv" | "json") {
  const response = await authorizedFetch(
    `/api/club-data/import/batches/${batchId}/result/?file_format=${fileFormat}`,
  );
  if (!response.ok) {
    await rejectUnlessOk(response);
  }
  const blob = await response.blob();
  saveBlob(blob, `import-result-${batchId}.${fileFormat}`);
}

export async function undoImport(batchId: number, typed: string): Promise<ImportBatch> {
  const response = await authorizedFetch(`/api/club-data/import/batches/${batchId}/undo/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ batch_id: typed }),
  });
  if (!response.ok) {
    await rejectUnlessOk(response);
  }
  return (await response.json()) as ImportBatch;
}
