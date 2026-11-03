import type { SetupMemberPreview, SetupMemberRow } from "@/lib/setup-api";
import { formatFullName } from "@/lib/person-name";

export type SetupRowStatus = "ready" | "staff" | "choice" | "parked" | "skipped";

export type SetupRowIssue = "sex" | "club" | "no_club" | "near_ltf" | "ambiguous" | "group" | "end" | "missing_id" | "dob";

const BLOCKING: ReadonlySet<SetupRowIssue> = new Set(["sex", "club", "no_club", "near_ltf", "ambiguous", "group", "end", "missing_id"]);

type IssueTranslator = (key: string, values?: Record<string, string>) => string;

export function setupIssueMessage(t: IssueTranslator, row: SetupMemberRow, issue: SetupRowIssue): string {
  if (issue === "sex") {
    const value = row.sex_raw.trim();
    return value ? t("issue_gender", { value }) : t("issue_gender_blank");
  }
  if (issue === "club") {
    return t("issue_club_not_found", { club: row.club_name || "—" });
  }
  if (issue === "no_club") {
    return t("issue_no_club");
  }
  if (issue === "near_ltf") {
    return t("issue_near_ltf", { club: row.club_name || "—" });
  }
  if (issue === "ambiguous") {
    return t("issue_ambiguous_club", { club: row.club_name || "—", matches: row.club_matches || "—" });
  }
  if (issue === "group") {
    return t("issue_duplicate_clubs", { name: formatFullName(row), clubs: row.conflict_clubs || "—" });
  }
  if (issue === "end") {
    return t("issue_end", { value: row.end_raw || "—" });
  }
  if (issue === "missing_id") {
    return t("issue_missing_id");
  }
  return t("issue_dob", { value: row.dob_raw || "—" });
}

export function setupRowIssues(row: SetupMemberRow): SetupRowIssue[] {
  if (row.skipped || row.resolution.kind === "skip") {
    return [];
  }
  const issues: SetupRowIssue[] = [];
  if (row.sex_blocking) {
    issues.push("sex");
  }
  if (row.group_conflict) {
    issues.push("group");
  } else if (row.resolution.kind === "no_club") {
    issues.push("no_club");
  } else if (row.resolution.kind === "near_ltf") {
    issues.push("near_ltf");
  } else if (row.resolution.kind === "ambiguous") {
    issues.push("ambiguous");
  } else if (row.resolution.kind === "unknown") {
    issues.push("club");
  }
  if (row.end_unparseable) {
    issues.push("end");
  }
  if (!row.member_id && !row.allow_missing_id) {
    issues.push("missing_id");
  }
  if (row.dob_flag === "unparseable" || row.dob_flag === "implausible") {
    issues.push("dob");
  }
  if (row.parked) {
    return issues.filter((issue) => !BLOCKING.has(issue));
  }
  return issues;
}

export function withLocalPark(row: SetupMemberRow, parkedRows: Record<number, boolean>): SetupMemberRow {
  const choice = parkedRows[row.row_index];
  if (choice === true && row.parkable) {
    return { ...row, parked: true };
  }
  if (choice === false) {
    return { ...row, parked: false };
  }
  return row;
}

export function setupRowStatus(row: SetupMemberRow): SetupRowStatus {
  if (row.skipped || row.resolution.kind === "skip") {
    return "skipped";
  }
  if (row.parked) {
    return "parked";
  }
  if (setupRowIssues(row).some((issue) => BLOCKING.has(issue))) {
    return "choice";
  }
  if (row.resolution.kind === "staff" || row.also_staff) {
    return "staff";
  }
  return "ready";
}

export function setupPreviewSummary(preview: SetupMemberPreview) {
  let ready = 0;
  let staff = 0;
  let choice = 0;
  let parked = 0;
  let skipped = 0;
  let gender = 0;
  let active = 0;
  let inactive = 0;
  const issueKinds = new Set<SetupRowIssue>();
  for (const row of preview.rows) {
    const status = setupRowStatus(row);
    if (status === "ready") ready += 1;
    if (status === "staff") staff += 1;
    if (status === "choice") choice += 1;
    if (status === "parked") parked += 1;
    if (status === "skipped") skipped += 1;
    if (status === "choice" && row.sex_blocking) gender += 1;
    if (status === "ready" || status === "staff") {
      if (row.is_active === false) inactive += 1;
      if (row.is_active === true) active += 1;
    }
    for (const issue of setupRowIssues(row)) {
      if (BLOCKING.has(issue)) issueKinds.add(issue);
    }
  }
  let trainer = 0;
  let otherRoles = 0;
  const otherLabels: string[] = [];
  for (const item of preview.role_summary) {
    if (item.mapped) continue;
    if (item.value.trim().toLowerCase() === "trainer") {
      trainer += item.count;
    } else {
      otherRoles += item.count;
      otherLabels.push(item.value);
    }
  }
  return {
    ready,
    staff,
    choice,
    parked,
    skipped,
    willImport: ready + staff + parked,
    gender,
    trainer,
    otherRoles,
    otherLabels,
    active,
    inactive,
    blank: preview.blank_rows_ignored,
    unknownClubRows: unresolvedUnknownClubRows(preview),
    issueKinds: [...issueKinds],
  };
}

function unresolvedUnknownClubRows(preview: SetupMemberPreview): number {
  const parked = new Set(
    preview.rows.filter((row) => setupRowStatus(row) === "parked").map((row) => row.row_index),
  );
  return preview.unknown_clubs.reduce((sum, club) => {
    const indexes = club.row_indexes ?? [];
    if (indexes.length === 0) {
      return sum + club.count;
    }
    return sum + indexes.filter((index) => !parked.has(index)).length;
  }, 0);
}
