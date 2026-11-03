import {
  DEFAULT_MEMBER_UPDATE_MODE,
  MEMBER_UPDATE_MODES,
  defaultMemberRowAction,
  isMemberUpdateMode,
  memberPreviewOutcome,
  memberPreviewTotals,
  visibleChangedFields,
  type MemberPreviewRow,
} from "@/lib/import-update";

const rows: MemberPreviewRow[] = [
  { row_index: 1, disposition: "create", errors: [], changed_fields: [] },
  {
    row_index: 2,
    disposition: "update",
    errors: [],
    changed_fields: ["email", "belt_rank"],
  },
  { row_index: 3, disposition: "skip", errors: [], changed_fields: [] },
  { row_index: 4, disposition: "update", errors: ["sex must be Male or Female"], changed_fields: ["email"] },
];

describe("member import update option", () => {
  it("defaults to create new only and offers both choices", () => {
    expect(DEFAULT_MEMBER_UPDATE_MODE).toBe("create_only");
    expect(MEMBER_UPDATE_MODES).toEqual(["create_only", "create_and_update"]);
    expect(isMemberUpdateMode("create_only")).toBe(true);
    expect(isMemberUpdateMode("create_and_update")).toBe(true);
    expect(isMemberUpdateMode("replace")).toBe(false);
  });

  it("picks update or skip from the preview disposition", () => {
    expect(defaultMemberRowAction(rows[0])).toBe("create");
    expect(defaultMemberRowAction(rows[1])).toBe("update");
    expect(defaultMemberRowAction(rows[2])).toBe("skip");
    expect(defaultMemberRowAction(rows[3])).toBe("create");
  });
});

describe("member import preview", () => {
  it("counts created, updated, and skipped rows", () => {
    const actions = {
      1: defaultMemberRowAction(rows[0]),
      2: defaultMemberRowAction(rows[1]),
      3: defaultMemberRowAction(rows[2]),
      4: defaultMemberRowAction(rows[3]),
    } as const;
    expect(memberPreviewTotals(rows, actions)).toEqual({
      create: 1,
      update: 1,
      skip: 1,
      invalid: 1,
    });
    expect(memberPreviewOutcome(rows[1], "update")).toBe("update");
    expect(visibleChangedFields(rows[1], "update")).toEqual(["email", "belt_rank"]);
  });

  it("hides changed fields when an update row is skipped", () => {
    expect(memberPreviewOutcome(rows[1], "skip")).toBe("skip");
    expect(visibleChangedFields(rows[1], "skip")).toEqual([]);
    expect(memberPreviewOutcome(rows[2], "create")).toBe("skip");
  });
});
