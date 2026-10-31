import { presentAuthError } from "./auth-errors";

describe("auth error copy", () => {
  it("turns enrolment required into a sentence and keeps it informational", () => {
    const shown = presentAuthError("mfa_enrol_required", "en");
    expect(shown.text).toBe("This desk opens once two-step sign-in is set up.");
    expect(shown.text).not.toContain("mfa_enrol_required");
    expect(shown.tone).toBe("info");
  });

  it("does not treat the shorter code as the enrolment code", () => {
    expect(presentAuthError("mfa_enrol_required", "fr").code).toBe("mfa_enrol_required");
    expect(presentAuthError("mfa_required", "de").code).toBe("mfa_required");
  });

  it("translates the other auth codes", () => {
    expect(presentAuthError("desk_not_granted", "lb").text).not.toContain("desk_not_granted");
    expect(presentAuthError("token_sunset", "en").tone).toBe("danger");
    expect(presentAuthError("desk_read_only", "en").tone).toBe("info");
  });
});
