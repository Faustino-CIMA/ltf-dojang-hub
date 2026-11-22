import { API_URL } from "@/lib/api";
import { readActiveDeskHeader } from "@/lib/active-desk";
import { getToken } from "@/lib/auth";

export type ClubDataSummary = {
  club_name: string;
  member_count: number;
  license_count: number;
  grade_count: number;
  prepare_above: number;
};

export type ClubDataJob = {
  id: number;
  status: "queued" | "running" | "succeeded" | "failed";
  progress: number;
  error_detail: string;
};

export async function fetchClubDataSummary(): Promise<ClubDataSummary> {
  const token = getToken();
  const desk = readActiveDeskHeader();
  const response = await fetch(`${API_URL}/api/club-data/export/`, {
    headers: {
      ...(token ? { Authorization: `Token ${token}` } : {}),
      ...(desk ? { "X-Desk": desk } : {}),
    },
  });
  if (!response.ok) {
    throw new Error("summary");
  }
  return (await response.json()) as ClubDataSummary;
}

export type ClubDataSheet = "members" | "licences" | "grades";

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

export async function readClubDataJob(jobId: number): Promise<ClubDataJob> {
  const response = await authorizedFetch(`/api/club-data/export/jobs/${jobId}/`);
  if (!response.ok) {
    throw new Error("job");
  }
  return (await response.json()) as ClubDataJob;
}

export async function downloadClubDataFile(jobId: number): Promise<void> {
  const response = await authorizedFetch(`/api/club-data/export/jobs/${jobId}/file/`);
  if (!response.ok) {
    throw new Error("file");
  }
  const blob = await response.blob();
  const disposition = response.headers.get("Content-Disposition") || "";
  const match = /filename="([^"]+)"/.exec(disposition);
  saveBlob(blob, match?.[1] || "club-data.pdf");
}

export async function downloadClubData(body: {
  sheets: ClubDataSheet[];
  format: "csv" | "xlsx" | "json" | "pdf";
  locale: string;
}): Promise<{ jobId: number | null }> {
  const response = await authorizedFetch("/api/club-data/export/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (response.status === 202) {
    const job = (await response.json()) as { id: number };
    return { jobId: job.id };
  }
  if (!response.ok) {
    throw new Error("download");
  }
  const blob = await response.blob();
  const disposition = response.headers.get("Content-Disposition") || "";
  const match = /filename="([^"]+)"/.exec(disposition);
  const extension = body.format === "csv" ? "zip" : body.format === "json" ? "json" : "xlsx";
  saveBlob(blob, match?.[1] || `club-members.${extension}`);
  return { jobId: null };
}
