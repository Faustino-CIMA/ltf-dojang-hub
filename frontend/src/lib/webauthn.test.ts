import { passkeyCeremonyOutcome } from "./webauthn";

describe("passkey ceremony", () => {
  it("treats a cancelled prompt as not created", () => {
    expect(passkeyCeremonyOutcome(new Error("cancelled"))).toBe("cancelled");
    expect(passkeyCeremonyOutcome(new DOMException("The operation was aborted.", "NotAllowedError"))).toBe("cancelled");
    expect(passkeyCeremonyOutcome(new DOMException("aborted", "AbortError"))).toBe("cancelled");
  });

  it("names an unsupported browser without calling the visit stale", () => {
    expect(passkeyCeremonyOutcome(new Error("unsupported"))).toBe("unsupported");
    expect(passkeyCeremonyOutcome(new DOMException("missing", "NotSupportedError"))).toBe("unsupported");
  });

  it("keeps a prompt failure distinct from a server response", () => {
    expect(passkeyCeremonyOutcome(new DOMException("origin", "SecurityError"))).toBe("failed");
    const api = new Error("mfa_sign_in_again");
    api.name = "AuthApiError";
    expect(passkeyCeremonyOutcome(api)).toBeNull();
    expect(passkeyCeremonyOutcome(new Error("Request failed (302). Please try again."))).toBeNull();
  });
});
