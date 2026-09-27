import { apiRequest } from "./api";

export const PREVIEW_MODULE_ID = "preview";
export const EVENT_CALENDAR_MODULE_ID = "event_calendar";
export const CLUB_MANAGEMENT_MODULE_ID = "club_management";

export type ModuleScope = "install" | "club";
export type ModuleEntitlementStatus = "active" | "expired" | "not_entitled";

export type CatalogModule = {
  id: string;
  label: string;
  scope: ModuleScope;
  description: string;
  shipped: boolean;
  entitled?: boolean;
  expires_at?: string | null;
  status?: ModuleEntitlementStatus;
};

export type ModuleClubRow = {
  id: number;
  name: string;
  modules: string[];
  is_active?: boolean;
};

export type ModuleAssignment = {
  club_id: number;
  module_id: string;
  enabled: boolean;
};

export type ProductCodeRedemption = {
  jti: string;
  fingerprint_suffix: string;
  modules: string[];
  status: string;
  expires_at: string | null;
  redeemed_at: string | null;
  redeemed_by: number | null;
};

export type ModuleStatus = {
  entitled: string[];
  modules: CatalogModule[];
  clubs: ModuleClubRow[];
};

export type OpsModules = ModuleStatus & {
  install_id: string;
  has_verify_key: boolean;
  can_mint_locally: boolean;
  catalog: CatalogModule[];
  redemptions: ProductCodeRedemption[];
  assignments: ModuleAssignment[];
};

export function getModuleStatus() {
  return apiRequest<ModuleStatus>("/api/modules/");
}

export function getPreviewModule(clubId?: number | null) {
  const query = clubId ? `?club=${clubId}` : "";
  return apiRequest<{
    module: string;
    scope: string;
    status: string;
    club_id?: number;
    club_name?: string;
  }>(`/api/modules/preview/${query}`);
}

export function getOpsModules() {
  return apiRequest<OpsModules>("/api/ops/modules/");
}

export function redeemProductCode(code: string) {
  return apiRequest<{
    jti: string;
    modules: string[];
    expires_at: string | null;
    fingerprint_suffix: string;
  }>("/api/ops/modules/codes/", {
    method: "POST",
    body: JSON.stringify({ code }),
  });
}

export function mintProductCode(modules: string[]) {
  return apiRequest<{ code: string; jti: string; modules: string[] }>("/api/ops/modules/codes/mint/", {
    method: "POST",
    body: JSON.stringify({ modules }),
  });
}

export function setClubModuleAssignment(clubId: number, moduleId: string, enabled: boolean) {
  return apiRequest<ModuleAssignment>("/api/ops/modules/assignments/", {
    method: "PUT",
    body: JSON.stringify({ club_id: clubId, module_id: moduleId, enabled }),
  });
}

export function isInstallEntitled(status: ModuleStatus | null | undefined, moduleId: string): boolean {
  return Boolean(status?.entitled.includes(moduleId));
}

export function isClubModuleAssigned(
  status: ModuleStatus | null | undefined,
  moduleId: string,
  clubId: number | null,
): boolean {
  if (!status || clubId == null) {
    return false;
  }
  if (!status.entitled.includes(moduleId)) {
    return false;
  }
  const club = status.clubs.find((row) => row.id === clubId);
  return Boolean(club?.modules.includes(moduleId));
}
