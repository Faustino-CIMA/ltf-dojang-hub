// Protected paths from docs/specs/guard-rails.md, section 3.
// A pull request that changes one of these fails unless the GitHub user
// Faustino-CIMA added the label faustino-ok, and that label is still present.
// Another account adding the same label does not pass.

const LABEL = "faustino-ok";
const OWNER = "Faustino-CIMA";

const PROTECTED = [
  "backend/licenses/card_rendering.py",
  "backend/licenses/stripe_adapter.py",
  "backend/clubs/display_dates.py",
  "frontend/src/lib/date-display.ts",
  "backend/imports/views.py",
  "backend/setup/dates.py",
  "frontend/src/lib/import-date-format.ts",
];

function touches(files, protectedPaths = PROTECTED) {
  const hit = new Set();
  for (const file of files || []) {
    const names = [file.filename, file.previous_filename].filter(Boolean);
    for (const name of names) {
      if (protectedPaths.includes(name)) {
        hit.add(name);
      }
    }
  }
  return [...hit].sort();
}

function currentLabelEvent(payload, label = LABEL) {
  const action = payload && payload.action;
  const name = payload && payload.label && payload.label.name;
  if ((action !== "labeled" && action !== "unlabeled") || name !== label) {
    return null;
  }
  const login = (payload.sender && payload.sender.login) || "";
  return {
    event: action,
    label: { name },
    actor: { login },
    created_at: "9999-12-31T23:59:59Z",
  };
}

function decision({
  changedProtected,
  hasLabel,
  events,
  current,
  label = LABEL,
  owner = OWNER,
}) {
  const changed = changedProtected || [];
  if (changed.length === 0) {
    return { ok: true, reason: "No protected path changed." };
  }
  const all = (events || []).filter(
    (event) =>
      (event.event === "labeled" || event.event === "unlabeled") &&
      event.label &&
      event.label.name === label,
  );
  all.sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
  if (current && current.label && current.label.name === label) {
    all.push(current);
  }
  const last = all[all.length - 1];
  const actor = (last && last.actor && last.actor.login) || "";
  const files = changed.join(", ");
  if (
    hasLabel &&
    last &&
    last.event === "labeled" &&
    actor.toLowerCase() === owner.toLowerCase()
  ) {
    return {
      ok: true,
      reason: `${owner} added ${label}. Protected paths in this pull request: ${files}.`,
    };
  }
  const who = actor
    ? ` The last change to that label was by ${actor}.`
    : " There is no record of who added it.";
  const present = hasLabel
    ? `The label ${label} is on the pull request, but it does not count.`
    : `The label ${label} is not on the pull request.`;
  return {
    ok: false,
    reason:
      `Protected paths changed: ${files}. ${present}${who} ` +
      `Only the GitHub user ${owner} adding the label ${label} passes this check. ` +
      "Another account adding the same label does not pass. Removing the label fails the check again.",
  };
}

module.exports = {
  LABEL,
  OWNER,
  PROTECTED,
  touches,
  currentLabelEvent,
  decision,
};
