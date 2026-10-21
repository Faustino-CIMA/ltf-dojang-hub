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

export type ClubTshirtSize = {
  label: string;
  group: "youth" | "adult";
  age?: string;
  chestIn: number;
  lengthIn: number;
};

export const CLUB_TSHIRT: readonly ClubTshirtSize[] = [
  { label: "YXS", group: "youth", age: "1-2", chestIn: 11, lengthIn: 15 },
  { label: "YS", group: "youth", age: "3-4", chestIn: 12, lengthIn: 16 },
  { label: "YM", group: "youth", age: "5-6", chestIn: 13, lengthIn: 17 },
  { label: "YL", group: "youth", age: "7-8", chestIn: 14, lengthIn: 18 },
  { label: "YXL", group: "youth", age: "9-10", chestIn: 15, lengthIn: 19 },
  { label: "Y2XL", group: "youth", age: "11-12", chestIn: 16, lengthIn: 20 },
  { label: "Y3XL", group: "youth", age: "13-14", chestIn: 17, lengthIn: 21 },
  { label: "XXS", group: "adult", chestIn: 17, lengthIn: 23.5 },
  { label: "XS", group: "adult", chestIn: 18, lengthIn: 24.5 },
  { label: "S", group: "adult", chestIn: 19, lengthIn: 25.5 },
  { label: "M", group: "adult", chestIn: 20, lengthIn: 26.5 },
  { label: "L", group: "adult", chestIn: 21, lengthIn: 27.5 },
  { label: "XL", group: "adult", chestIn: 22, lengthIn: 28.5 },
  { label: "2XL", group: "adult", chestIn: 23, lengthIn: 29.5 },
  { label: "3XL", group: "adult", chestIn: 24, lengthIn: 32.5 },
  { label: "4XL", group: "adult", chestIn: 25, lengthIn: 33.5 },
  { label: "5XL", group: "adult", chestIn: 26, lengthIn: 33.5 },
  { label: "6XL", group: "adult", chestIn: 27, lengthIn: 33.5 },
  { label: "7XL", group: "adult", chestIn: 28, lengthIn: 33.5 },
  { label: "8XL", group: "adult", chestIn: 29, lengthIn: 34.5 },
  { label: "9XL", group: "adult", chestIn: 30, lengthIn: 35.5 },
  { label: "10XL", group: "adult", chestIn: 31, lengthIn: 37.5 },
];

export function inchesToCm(inches: number) {
  return Math.round(inches * 2.54);
}

export function clubTshirtSize(label: string) {
  return CLUB_TSHIRT.find((size) => size.label === label);
}

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
  club_tshirt: string;
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
  "club_tshirt",
] as const;

export type GearKey = (typeof GEAR_KEYS)[number];

export type RosterGear = Omit<MemberGear, "member">;

export function gearSockSortRank(pss: string, gear: Partial<MemberGear> | null | undefined, role?: string): number | null {
  if (role === "coach" || !gear) return null;
  const daedo = (DAEDO_SOCK as readonly string[]).indexOf(gear.daedo_sock || "");
  const kpnp = (KPNP_SOCK as readonly string[]).indexOf(gear.kpnp_sock || "");
  if (pss === "kpnp") return kpnp < 0 ? null : kpnp;
  if (pss === "daedo") return daedo < 0 ? null : daedo;
  if (daedo < 0 && kpnp < 0) return null;
  return (daedo < 0 ? DAEDO_SOCK.length : daedo) * 100 + (kpnp < 0 ? 99 : kpnp);
}

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
