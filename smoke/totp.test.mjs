import assert from "node:assert/strict";
import test from "node:test";

import { totp } from "./totp.mjs";

test("the standard authenticator vector stays 287082", () => {
  const secret = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";
  assert.equal(totp(secret, new Date(59_000)), "287082");
});
