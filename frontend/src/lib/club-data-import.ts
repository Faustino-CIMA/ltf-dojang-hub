import { API_URL } from "@/lib/api";
import { readActiveDeskHeader } from "@/lib/active-desk";
import { getToken } from "@/lib/auth";

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
  counts: { ok: number; warning: number; error: number; create: number; update: number; skip: number };
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
    throw new Error("template");
  }
  const blob = await response.blob();
  saveBlob(blob, fileFormat === "csv" ? "club-import-template.zip" : "club-import-template.xlsx");
}

export async function uploadImportFile(file: File): Promise<ImportUpload> {
  const body = new FormData();
  body.append("file", file);
  const response = await authorizedFetch("/api/club-data/import/", { method: "POST", body });
  if (!response.ok) {
    throw new Error("upload");
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
    throw new Error("mapping");
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
    throw new Error(path);
  }
  return (await response.json()) as ImportReport;
}
