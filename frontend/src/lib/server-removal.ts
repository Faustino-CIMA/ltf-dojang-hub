import { readActiveDeskHeader } from "./active-desk";
import { API_URL } from "./api";
import { getToken } from "./auth";

export const SERVER_CUTOUT_TIMEOUT_MS = 50000;

/** Full-resolution crop. The server does not keep the file. */
export async function requestServerCutout(image: Blob): Promise<Blob> {
  const body = new FormData();
  body.append("image", image, "portrait.png");
  const token = getToken();
  const desk = readActiveDeskHeader();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SERVER_CUTOUT_TIMEOUT_MS);
  try {
    const response = await fetch(`${API_URL}/api/photos/cutout/`, {
      method: "POST",
      body,
      signal: controller.signal,
      headers: {
        ...(token ? { Authorization: `Token ${token}` } : {}),
        ...(desk ? { "X-Desk": desk } : {}),
      },
    });
    if (!response.ok) {
      throw new Error("server cutout failed");
    }
    return await response.blob();
  } finally {
    clearTimeout(timer);
  }
}
