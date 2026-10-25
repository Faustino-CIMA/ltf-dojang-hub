import type { SetupMemberPreview, SetupMemberRow } from "@/lib/setup-api";

export type SetupRowStatus = "ready" | "staff" | "choice" | "skipped";

export type SetupRowIssue = "sex" | "club" | "near_ltf" | "group" | "end" | "missing_id" | "dob";

const BLOCKING: ReadonlySet<SetupRowIssue> = new Set(["sex", "club", "near_ltf", "group", "end", "missing_id"]);

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
  } else if (row.resolution.kind === "near_ltf") {
    issues.push("near_ltf");
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
  return issues;
}

export function setupRowStatus(row: SetupMemberRow): SetupRowStatus {
  if (row.skipped || row.resolution.kind === "skip") {
    return "skipped";
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
    if (status === "skipped") skipped += 1;
    if (row.sex_blocking) gender += 1;
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
    skipped,
    willImport: ready + staff,
    gender,
    trainer,
    otherRoles,
    otherLabels,
    active,
    inactive,
    blank: preview.blank_rows_ignored,
    unknownClubRows: preview.unknown_clubs.reduce((sum, club) => sum + club.count, 0),
    issueKinds: [...issueKinds],
  };
}
