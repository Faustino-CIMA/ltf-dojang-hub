import { apiRequest } from "@/lib/api";
import { LICENSE_PHOTO_BACKGROUND_DEFAULT } from "@/lib/photo-background";

const COLOR = /^#[0-9A-Fa-f]{6}$/;

export async function getLicensePhotoBackgroundColor(): Promise<string> {
  const payload = await apiRequest<{ license_photo_background_color?: string }>(
    "/api/federation-profile/license-photo-background/",
  );
  const color = (payload.license_photo_background_color ?? "").trim();
  if (!COLOR.test(color)) {
    return LICENSE_PHOTO_BACKGROUND_DEFAULT;
  }
  return color.toUpperCase();
}
