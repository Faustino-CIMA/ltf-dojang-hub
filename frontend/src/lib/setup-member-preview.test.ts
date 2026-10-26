import {
  setupIssueMessage,
  setupPreviewSummary,
  setupRowIssues,
  setupRowStatus,
  withLocalPark,
} from "@/lib/setup-member-preview";
import type { SetupMemberPreview, SetupMemberRow } from "@/lib/setup-api";

function row(patch: Partial<SetupMemberRow> = {}): SetupMemberRow {
  return {
    row_index: 1,
    member_id: "LUX-1001",
    first_name: "Erika",
    last_name: "MUSTERFRAU",
    club_name: "Silver Crane Academy",
    resolution: { kind: "club", club_id: 1, club_name: "Silver Crane Academy" },
    sex: "F",
    sex_raw: "Female",
    sex_blocking: false,
    skipped: false,
    date_of_birth: "2002-04-15",
    dob_flag: "",
    primary_license_role: "Athlete",
    secondary_license_role: "",
    primary_raw: "Athlete",
    secondary_raw: "",
    role_note: "",
    is_active: true,
    end_unparseable: false,
    staff_function: "",
    ...patch,
  };
}

describe("setup member preview labels", () => {
  it("explains blocking rows separately from staff and ready rows", () => {
    const gender = row({ row_index: 2, sex: "", sex_blocking: true, sex_raw: "" });
    const staff = row({
      row_index: 3,
      resolution: { kind: "staff", club_id: null, club_name: "LTF" },
      staff_function: "coach",
    });
    const preview: SetupMemberPreview = {
      rows: [row(), gender, staff, row({ row_index: 4, skipped: true })],
      blank_rows_ignored: 1,
      gender_summary: [],
      role_summary: [
        { value: "Trainer", count: 12, mapped: null },
        { value: "Athlete", count: 4, mapped: "Athlete" },
        { value: "MNA President", count: 1, mapped: null },
      ],
      unknown_clubs: [],
      date_of_birth_format: { format: "DD/MM/YYYY", ambiguous: false, example: "" },
      can_confirm: false,
      email_ignored: true,
      clubs: [],
    };
    expect(setupRowStatus(gender)).toBe("choice");
    expect(setupRowIssues(gender)).toEqual(["sex"]);
    expect(setupRowStatus(staff)).toBe("staff");
    const summary = setupPreviewSummary(preview);
    expect(summary.willImport).toBe(2);
    expect(summary.gender).toBe(1);
    expect(summary.trainer).toBe(12);
    expect(summary.otherRoles).toBe(1);
    expect(summary.staff).toBe(1);
    expect(summary.issueKinds).toEqual(["sex"]);
  });

  it("names the real reason and does not flag a resolved club", () => {
    const ready = row({
      club_name: "Luxembourg Taekwondo Club Esch",
      resolution: { kind: "club", club_id: 4, club_name: "Luxembourg Taekwondo Club Esch" },
    });
    expect(setupRowStatus(ready)).toBe("ready");
    expect(setupRowIssues(ready)).toEqual([]);
    const gender = row({
      sex: "",
      sex_blocking: true,
      sex_raw: "Robot",
      resolution: { kind: "club", club_id: 2, club_name: "Taekwon-Do Beispielhausen" },
      club_name: "Taekwon-Do Beispielhausen",
    });
    expect(setupRowStatus(gender)).toBe("choice");
    expect(setupRowIssues(gender)).toEqual(["sex"]);
    expect(setupIssueMessage((key, values) => `${key}:${values?.value ?? ""}`, gender, "sex")).toBe("issue_gender:Robot");
    const blank = row({ sex: "", sex_blocking: true, sex_raw: "  " });
    expect(setupIssueMessage((key) => key, blank, "sex")).toBe("issue_gender_blank");
    const missing = row({
      resolution: { kind: "unknown", club_id: null, club_name: "Nowhere Dojang" },
      club_name: "Nowhere Dojang",
    });
    expect(setupIssueMessage((key, values) => `${key}:${values?.club ?? ""}`, missing, "club")).toBe(
      "issue_club_not_found:Nowhere Dojang"
    );
    const ambiguous = row({
      resolution: { kind: "ambiguous", club_id: null, club_name: "Dualtown Dojang" },
      club_name: "Dualtown Dojang",
      club_matches: "Dualtown Dojang (WT), Dualtown Dojang a.s.b.l. (ITF)",
    });
    expect(setupRowStatus(ambiguous)).toBe("choice");
    expect(setupRowIssues(ambiguous)).toEqual(["ambiguous"]);
    const emptyClub = row({
      resolution: { kind: "no_club", club_id: null, club_name: "" },
      club_name: "",
    });
    expect(setupRowIssues(emptyClub)).toEqual(["no_club"]);
    expect(setupIssueMessage((key) => key, emptyClub, "no_club")).toBe("issue_no_club");
    expect(setupRowStatus({ ...emptyClub, parked: true })).toBe("parked");
    const summary = setupPreviewSummary({
      rows: [emptyClub, { ...emptyClub, row_index: 2, parked: true }],
      blank_rows_ignored: 0,
      gender_summary: [],
      role_summary: [],
      unknown_clubs: [],
      date_of_birth_format: { format: "DD/MM/YYYY", ambiguous: false, example: "" },
      can_confirm: true,
      email_ignored: true,
      clubs: [],
    });
    expect(summary.parked).toBe(1);
    expect(summary.choice).toBe(1);
    expect(summary.willImport).toBe(1);
    expect(summary.issueKinds).toEqual(["no_club"]);
  });

  it("clears the empty-club block when the row is parked, including a local park", () => {
    const emptyClub = row({
      resolution: { kind: "no_club", club_id: null, club_name: "" },
      club_name: "",
      parkable: true,
      dob_flag: "unparseable",
      dob_raw: "not-a-date",
    });
    const parked = { ...emptyClub, parked: true };
    expect(setupRowStatus(parked)).toBe("parked");
    expect(setupRowIssues(parked)).toEqual(["dob"]);
    const local = withLocalPark(emptyClub, { 1: true });
    expect(local.parked).toBe(true);
    expect(setupRowStatus(local)).toBe("parked");
    expect(setupRowIssues(local)).toEqual(["dob"]);
    expect(withLocalPark(parked, { 1: false }).parked).toBe(false);
    expect(withLocalPark(emptyClub, {}).parked).toBeUndefined();
    const preview: SetupMemberPreview = {
      rows: [local, row({ row_index: 2, parkable: true, resolution: { kind: "no_club", club_id: null, club_name: "" }, club_name: "" })],
      blank_rows_ignored: 0,
      gender_summary: [],
      role_summary: [],
      unknown_clubs: [
        { name: "", count: 2, row_indexes: [1, 2] },
        { name: "Nowhere", count: 3, row_indexes: [] },
      ],
      date_of_birth_format: { format: "DD/MM/YYYY", ambiguous: false, example: "" },
      can_confirm: false,
      email_ignored: true,
      clubs: [],
    };
    const summary = setupPreviewSummary(preview);
    expect(summary.parked).toBe(1);
    expect(summary.choice).toBe(1);
    expect(summary.willImport).toBe(1);
    expect(summary.issueKinds).toEqual(["no_club"]);
    expect(summary.unknownClubRows).toBe(4);
    const bothParked = setupPreviewSummary({
      ...preview,
      rows: preview.rows.map((item) => ({ ...item, parked: true, parkable: true })),
    });
    expect(bothParked.choice).toBe(0);
    expect(bothParked.parked).toBe(2);
    expect(bothParked.willImport).toBe(2);
    expect(bothParked.issueKinds).toEqual([]);
    expect(bothParked.unknownClubRows).toBe(3);
  });
});
