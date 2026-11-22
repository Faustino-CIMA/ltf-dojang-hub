import { API_URL } from "@/lib/api";
import { readActiveDeskHeader } from "@/lib/active-desk";
import { getToken } from "@/lib/auth";

export type ClubDataSummary = {
  club_name: string;
  member_count: number;
  license_count: number;
  prepare_above: number;
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

export async function downloadClubData(body: {
  sheets: Array<"members" | "licences">;
  format: "csv" | "xlsx";
  locale: string;
}): Promise<void> {
  const token = getToken();
  const desk = readActiveDeskHeader();
  const response = await fetch(`${API_URL}/api/club-data/export/`, {
    method: "POST",
    headers: {
      ...(token ? { Authorization: `Token ${token}` } : {}),
      ...(desk ? { "X-Desk": desk } : {}),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error("download");
  }
  const blob = await response.blob();
  const disposition = response.headers.get("Content-Disposition") || "";
  const match = /filename="([^"]+)"/.exec(disposition);
  const filename = match?.[1] || `club-members.${body.format === "csv" ? "zip" : "xlsx"}`;
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
