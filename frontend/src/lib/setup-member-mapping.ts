import { GENERATED_MEMBER_ID_FIELD_KEYS, normalizeHeader } from "@/lib/import-mapping";

/** Column targets on the setup member step. The app member id is not one of them. */
export const SETUP_MEMBER_TARGET_FIELDS = [
  { key: "wt_licenseid", required: false },
  { key: "ltf_licenseid", required: false },
  { key: "first_name", required: true },
  { key: "last_name", required: true },
  { key: "club_name", required: true },
  { key: "sex", required: false },
  { key: "date_of_birth", required: false },
  { key: "primary_license_role", required: false },
  { key: "secondary_license_role", required: false },
  { key: "membership_end_date", required: false },
] as const;

/** Copy a SimplyCompete Member ID column onto the WT license field when it is empty. */
export function shareMemberIdColumn(mapping: Record<string, string>): Record<string, string> {
  const next = { ...mapping };
  for (const key of GENERATED_MEMBER_ID_FIELD_KEYS) {
    delete next[key];
  }
  if (next.wt_licenseid || !next.ltf_licenseid) {
    return next;
  }
  const compact = normalizeHeader(next.ltf_licenseid).replace(/ /g, "");
  if (compact !== "memberid") {
    return next;
  }
  return { ...next, wt_licenseid: next.ltf_licenseid };
}
