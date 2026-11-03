import { apiRequest } from "@/lib/api";
import type { ClothingSize } from "@/lib/clothing-api";

export const DAEDO_SOCK = ["XXXS", "XXS", "XS", "S", "M", "L", "XL", "XXL", "XXXL", "XXXXL"] as const;
export const DAEDO_HOGU = ["XXS", "XS", "S", "M", "L", "XL"] as const;
export const DAEDO_HEAD = ["XS", "S", "M", "L", "XL"] as const;
export const KPNP_SOCK = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10"] as const;
export const KPNP_GLOVE = ["XS", "S", "M", "L", "XL", "2XL"] as const;
export const KPNP_HOGU = ["0", "1", "2", "3", "4", "5"] as const;
export const KPNP_HEAD = ["XS", "S", "M", "L"] as const;
export const GENERIC_SIZE = ["XS", "S", "M", "L", "XL"] as const;
export const REGULAR_SIZE = ["XXS", "XS", "S", "M", "L", "XL", "XXL"] as const;
export const MOUTHGUARD = ["youth", "adult"] as const;

export type ClothingChoice = {
  item: number | null;
  value: number | null;
  name: string;
  note: string;
  label: string;
  offered: boolean;
  retired: boolean;
  sizes: ClothingSize[];
};

export type EgearBrands = {
  daedo: boolean;
  kpnp: boolean;
};

export type MemberGear = {
  member: number;
  egear_daedo?: boolean;
  egear_kpnp?: boolean;
  daedo_sock: string;
  daedo_glove: string;
  daedo_hogu: string;
  daedo_head: string;
  kpnp_sock: string;
  kpnp_glove: string;
  kpnp_hogu: string;
  kpnp_head: string;
  chest: string;
  headgear: string;
  shin: string;
  forearm: string;
  groin: string;
  mouthguard: string;
  clothing: ClothingChoice[];
  updated_at: string | null;
};

export const GEAR_KEYS = [
  "daedo_sock",
  "daedo_glove",
  "daedo_hogu",
  "daedo_head",
  "kpnp_sock",
  "kpnp_glove",
  "kpnp_hogu",
  "kpnp_head",
  "chest",
  "headgear",
  "shin",
  "forearm",
  "groin",
  "mouthguard",
] as const;

export type GearKey = (typeof GEAR_KEYS)[number];

export type RosterGear = Omit<MemberGear, "member" | "clothing">;

export function egearBrandsFrom(source?: { egear_daedo?: boolean; egear_kpnp?: boolean } | null): EgearBrands {
  return {
    daedo: source?.egear_daedo !== false,
    kpnp: source?.egear_kpnp !== false,
  };
}

/** Blank team PSS shows the brands the club still uses. A named system that is off shows nothing. */
export function gearDisplaySystem(pss: string, brands?: Partial<EgearBrands> | null): "" | "daedo" | "kpnp" | "none" {
  const daedo = brands?.daedo !== false;
  const kpnp = brands?.kpnp !== false;
  if (pss === "daedo") return daedo ? "daedo" : "none";
  if (pss === "kpnp") return kpnp ? "kpnp" : "none";
  if (daedo && kpnp) return "";
  if (daedo) return "daedo";
  if (kpnp) return "kpnp";
  return "none";
}

export function gearSockSortRank(
  pss: string,
  gear: Partial<MemberGear> | null | undefined,
  role?: string,
  brands?: Partial<EgearBrands> | null,
): number | null {
  if (role === "coach" || !gear) return null;
  const system = gearDisplaySystem(pss, brands);
  if (system === "none") return null;
  const daedo = (DAEDO_SOCK as readonly string[]).indexOf(gear.daedo_sock || "");
  const kpnp = (KPNP_SOCK as readonly string[]).indexOf(gear.kpnp_sock || "");
  if (system === "kpnp") return kpnp < 0 ? null : kpnp;
  if (system === "daedo") return daedo < 0 ? null : daedo;
  if (daedo < 0 && kpnp < 0) return null;
  return (daedo < 0 ? DAEDO_SOCK.length : daedo) * 100 + (kpnp < 0 ? 99 : kpnp);
}

export function blankGear(memberId: number): MemberGear {
  const gear = { member: memberId, updated_at: null, clothing: [], egear_daedo: true, egear_kpnp: true } as MemberGear;
  for (const key of GEAR_KEYS) gear[key] = "";
  return gear;
}

export function getMemberGear(memberId: number) {
  return apiRequest<MemberGear>(`/api/club-management/gear/?member=${memberId}`);
}

export function saveMemberGear(gear: MemberGear) {
  return apiRequest<MemberGear>("/api/club-management/gear/", {
    method: "PUT",
    body: JSON.stringify(gear),
  });
}
