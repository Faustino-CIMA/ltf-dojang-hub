import { apiRequest } from "@/lib/api";

export type EgearBrandFlags = {
  club: number;
  egear_daedo: boolean;
  egear_kpnp: boolean;
};

export function getEgearBrands(clubId: number) {
  return apiRequest<EgearBrandFlags>(`/api/club-management/egear-brands/?club=${clubId}`);
}

export function saveEgearBrands(clubId: number, brands: { daedo?: boolean; kpnp?: boolean }) {
  return apiRequest<EgearBrandFlags>("/api/club-management/egear-brands/", {
    method: "PUT",
    body: JSON.stringify({ club: clubId, ...brands }),
  });
}
