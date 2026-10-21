import { apiRequest } from "@/lib/api";

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
export const DOBOK = ["100", "110", "120", "130", "140", "150", "160", "170", "180", "190", "200", "210"] as const;
export const TSHIRT = ["98", "104", "110", "116", "128", "140", "152", "164", "XS", "S", "M", "L", "XL", "2XL", "3XL"] as const;

export type MemberGear = {
  member: number;
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
  dobok: string;
  tshirt: string;
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
  "dobok",
  "tshirt",
] as const;

export type GearKey = (typeof GEAR_KEYS)[number];

export function blankGear(memberId: number): MemberGear {
  const gear = { member: memberId, updated_at: null } as MemberGear;
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
