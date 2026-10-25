import { setupPreviewSummary, setupRowIssues, setupRowStatus } from "@/lib/setup-member-preview";
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
});
