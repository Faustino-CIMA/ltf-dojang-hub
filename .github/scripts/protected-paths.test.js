const assert = require("node:assert/strict");
const test = require("node:test");
const {
  LABEL,
  OWNER,
  decision,
  touches,
  currentLabelEvent,
} = require("./protected-paths");

const CARD = "backend/licenses/card_rendering.py";
const DATES = "frontend/src/lib/date-display.ts";

function labeled(login, at) {
  return {
    event: "labeled",
    label: { name: LABEL },
    actor: { login },
    created_at: at,
  };
}

function unlabeled(login, at) {
  return {
    event: "unlabeled",
    label: { name: LABEL },
    actor: { login },
    created_at: at,
  };
}

test("a pull request that leaves the protected paths alone passes", () => {
  const result = decision({
    changedProtected: touches([{ filename: "AGENTS.md" }]),
    hasLabel: false,
    events: [],
  });
  assert.equal(result.ok, true);
});

test("a rename into or out of a protected path counts", () => {
  assert.deepEqual(
    touches([{ filename: "notes.md", previous_filename: CARD }]),
    [CARD],
  );
  assert.deepEqual(
    touches([{ filename: DATES, previous_filename: "frontend/src/lib/old.ts" }]),
    [DATES],
  );
});

test("a protected change with no label fails", () => {
  const result = decision({
    changedProtected: [CARD],
    hasLabel: false,
    events: [],
  });
  assert.equal(result.ok, false);
  assert.match(result.reason, /card_rendering.py/);
  assert.match(result.reason, new RegExp(OWNER));
});

test("the label counts only when Faustino-CIMA added it and it is still there", () => {
  const result = decision({
    changedProtected: [CARD, DATES],
    hasLabel: true,
    events: [labeled(OWNER, "2026-11-23T12:00:00Z")],
  });
  assert.equal(result.ok, true);
});

test("another account adding the same label fails", () => {
  const result = decision({
    changedProtected: [CARD],
    hasLabel: true,
    events: [labeled("some-agent", "2026-11-23T12:00:00Z")],
  });
  assert.equal(result.ok, false);
  assert.match(result.reason, /some-agent/);
});

test("Faustino adding the label, then someone else adding it again, fails", () => {
  const result = decision({
    changedProtected: [CARD],
    hasLabel: true,
    events: [
      labeled(OWNER, "2026-11-23T12:00:00Z"),
      unlabeled("some-agent", "2026-11-23T12:05:00Z"),
      labeled("some-agent", "2026-11-23T12:06:00Z"),
    ],
  });
  assert.equal(result.ok, false);
});

test("removing the label fails again", () => {
  const result = decision({
    changedProtected: [CARD],
    hasLabel: false,
    events: [
      labeled(OWNER, "2026-11-23T12:00:00Z"),
      unlabeled(OWNER, "2026-11-23T12:05:00Z"),
    ],
  });
  assert.equal(result.ok, false);
});

test("Faustino adding the label again after a removal passes", () => {
  const result = decision({
    changedProtected: [CARD],
    hasLabel: true,
    events: [
      labeled("some-agent", "2026-11-23T12:00:00Z"),
      unlabeled("some-agent", "2026-11-23T12:05:00Z"),
      labeled(OWNER, "2026-11-23T12:06:00Z"),
    ],
  });
  assert.equal(result.ok, true);
});

test("a label with no recorded actor fails closed", () => {
  const result = decision({
    changedProtected: [CARD],
    hasLabel: true,
    events: [],
  });
  assert.equal(result.ok, false);
  assert.match(result.reason, /no record/);
});

test("the event that triggered this run wins over an older history", () => {
  const current = currentLabelEvent({
    action: "labeled",
    label: { name: LABEL },
    sender: { login: OWNER },
  });
  const result = decision({
    changedProtected: [CARD],
    hasLabel: true,
    events: [labeled("some-agent", "2026-11-23T12:00:00Z")],
    current,
  });
  assert.equal(result.ok, true);
});

test("an unrelated label event is ignored", () => {
  assert.equal(
    currentLabelEvent({
      action: "labeled",
      label: { name: "documentation" },
      sender: { login: OWNER },
    }),
    null,
  );
});
