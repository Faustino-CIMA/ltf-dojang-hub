import { cardCheckPath } from "./member-verification";

describe("cardCheckPath", () => {
  it("puts only the code in the address, not the member", () => {
    const path = cardCheckPath("fr", "abc_DEF-123");
    expect(path).toBe("/fr/card-check/abc_DEF-123");
    expect(path).not.toContain("member");
    expect(path).not.toContain("members");
  });
});
