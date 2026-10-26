import { API_URL, apiRequest } from "@/lib/api";
import { getToken } from "@/lib/auth";

export type AccessLinkResult = {
  kind: "setup" | "reset";
  expires_at: string | null;
  email_sent: boolean;
  email_error: string | null;
  link: string;
};

export function sendClubAdminAccessLink(
  userId: number,
  body: { delivery: "email" | "copy" | "both"; email?: string; locale: string },
) {
  return apiRequest<AccessLinkResult>(`/api/clubs/admins/${userId}/access-link/`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function downloadClubAdminAccessLinks(userIds: number[], locale: string) {
  const token = getToken();
  const response = await fetch(`${API_URL}/api/clubs/admins/access-links/`, {
    method: "POST",
    headers: {
      ...(token ? { Authorization: `Token ${token}` } : {}),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ user_ids: userIds, locale }),
  });
  if (!response.ok) {
    let detail = "Download failed";
    try {
      const parsed = (await response.json()) as { detail?: string };
      if (parsed.detail) detail = parsed.detail;
    } catch {
      detail = "Download failed";
    }
    throw new Error(detail);
  }
  const blob = await response.blob();
  const disposition = response.headers.get("Content-Disposition") || "";
  const match = /filename="([^"]+)"/.exec(disposition);
  const filename = match?.[1] || `club-admin-links-CONFIDENTIAL-${new Date().toISOString().slice(0, 10)}.csv`;
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
  return { skipped: Number(response.headers.get("X-Access-Links-Skipped") || "0") };
}
