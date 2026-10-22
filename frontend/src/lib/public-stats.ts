import { API_URL } from "@/lib/api";

export type PublicStats = {
  clubs: number;
  members: number;
  licences: number;
};

export async function getPublicStats(): Promise<PublicStats> {
  const response = await fetch(`${API_URL}/api/public/stats/`, {
    headers: { Accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error("stats");
  }
  const data: unknown = await response.json();
  if (!isPublicStats(data)) {
    throw new Error("stats");
  }
  return data;
}

function isPublicStats(value: unknown): value is PublicStats {
  if (!value || typeof value !== "object") {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    typeof record.clubs === "number" &&
    typeof record.members === "number" &&
    typeof record.licences === "number" &&
    Object.keys(record).length === 3
  );
}
