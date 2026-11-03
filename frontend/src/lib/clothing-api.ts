import { apiRequest } from "@/lib/api";

export type ClothingSize = {
  label: string;
  age: string;
  chest_cm: number | null;
  length_cm: number | null;
  height_min_cm: number | null;
  height_max_cm: number | null;
};

export type ClothingItem = {
  id: number;
  club: number;
  name: string;
  note: string;
  position: number;
  member_count: number;
  sizes: ClothingSize[];
};

export type ClothingPreset = {
  id: string;
  sizes: ClothingSize[];
};

export type ClothingDraft = {
  name: string;
  note: string;
  sizes: ClothingSize[];
};

export function getClubClothing(clubId: number) {
  return apiRequest<{ items: ClothingItem[]; presets: ClothingPreset[] }>(
    `/api/club-management/clothing/?club=${clubId}`,
  );
}

export function createClubClothing(clubId: number, draft: ClothingDraft) {
  return apiRequest<ClothingItem>("/api/club-management/clothing/", {
    method: "POST",
    body: JSON.stringify({ club: clubId, ...draft }),
  });
}

export function updateClubClothing(itemId: number, draft: ClothingDraft) {
  return apiRequest<ClothingItem>(`/api/club-management/clothing/${itemId}/`, {
    method: "PATCH",
    body: JSON.stringify(draft),
  });
}

export function deleteClubClothing(itemId: number) {
  return apiRequest<null>(`/api/club-management/clothing/${itemId}/`, { method: "DELETE" });
}

export function reorderClubClothing(clubId: number, order: number[]) {
  return apiRequest<{ items: ClothingItem[] }>("/api/club-management/clothing/reorder/", {
    method: "POST",
    body: JSON.stringify({ club: clubId, order }),
  });
}
