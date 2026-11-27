# Guard rails for coding agents

Status: spec only. No code in this pull request. Nothing here is implemented until Faustino approves this document and a later pull request does one piece of it.

These rails are for this repository. They do not replace a review. They make a class of mistake fail in CI, or fail a test, before it is merged. Every example below uses fake people. No real member, no real card, and no live Stripe event.

Today's required checks, measured on recent pull requests, are about:

| Check | About |
| --- | --- |
| Check and apply migrations | 1 to 2 minutes |
| Frontend - lint/build | 2 to 3 minutes |
| Backend - migrate/check/test | about 19 minutes, of which the Django suite itself is about 13 minutes |

A rail that adds seconds inside an existing job is cheap. A rail that adds a new browser job is not, and it gets its own pull request.

## 1. Every reported bug gets a regression test

AGENTS.md already says a bug fix comes with a regression test that fails before the fix and passes after. That sentence is not enough. Agents still open a fix whose only proof is "I looked at the screen."

The rule, to be written into AGENTS.md in the first implementation pull request:

- A reported bug is not fixed until a regression test, or a lint rule, fails on the old behaviour and passes on the new one.
- The test names the state, not the patch. "No social security number does not create a phone code" is a test. "The heading is wrapped in a condition" is not.
- If the bug is a forbidden edit (a file that must not change, a call that must stay), the regression is a lint rule or a snapshot, not a comment.
- A pull request that fixes a bug and does not add that test is not ready. The PR body names the test.
- Do not delete, skip, or loosen an existing test to make a new one pass. That rule is already in AGENTS.md and stays.

What it would have caught: the card-check page still showed "Scan this code with the phone…" when no number was stored and when the member was already verified. The API already refused a compare with no number. The page had no test for those states, so the heading stayed. The preferred-name label change was safe only because the import ignore-list was left alone; a test that the alias `usual_name` still maps to ignore is the same kind of rail.

Cost: no extra CI job. One small test is seconds inside Jest or Django.

What stays manual: whether the test actually describes the bug. A test that only checks a CSS class does not count.

## 2. Snapshots for outputs that must not change

A snapshot here means a checked-in expected value. The test fails if the output moves. Updating the snapshot is a deliberate commit, not a side effect of another change.

### Licence card PDF

`licenses/card_rendering.py` `format_ltf_date` is already locked to English `29 Nov 2026` for 29 November 2026, in `licenses/test_card_date_lock.py`. That lock is the date line only. The page layout can still move.

The golden is one rendered card PDF from fake data (name EXAMPLE Ada, a synthetic Luxembourg number already used in Django tests, dates 29 Nov 2026). The test compares:

- extracted text, including `29 Nov 2026` and not `29.11.2026`
- page count and page size
- that the renderer did not call the shared `29.11.2026` formatter

A pixel hash of the whole PDF is a later, optional tightening. Fonts in CI are already DejaVu. A pixel hash is sensitive to a library bump and is not the first golden.

What it would have caught: the screen-date change was about to format the card as `29.11.2026`. The owner stopped that by a separate lock. A golden of the card text would have failed the same day, without a second instruction.

Cost: one WeasyPrint render, a few seconds inside the existing backend job.

### Screen dates

Screens, invoices, letters, and emails show `29.11.2026` and `29.11.2026 14:05` in Europe/Luxembourg. Storage and machine files stay ISO. `frontend/src/lib/date-display.ts` and `backend/clubs/display_dates.py` already have tests. The snapshot is a fixed table, not a fresh format call that the test recomputes the same way as the code:

| Input | Screen |
| --- | --- |
| `2026-11-29` | `29.11.2026` |
| `2026-11-29T13:05:00Z` | `29.11.2026 14:05` |
| `2026-07-29T12:05:00Z` | `29.07.2026 14:05` |

What it would have caught: after the screen format changed, Jest still expected `31 Dec 2026`, `20 Oct 2026`, `01 Mar 2026`, and `01 Feb 2026`. Those tests were the right idea and were updated in the same change. A single table makes the next format change show every broken expectation in one place.

Cost: milliseconds. Already inside Jest and Django.

### Import parsers

Display dates and import dates are different. Import must keep today's parsing. The golden is input to output, using the real functions, not a copy of them.

| Parser | File | Example that must stay |
| --- | --- | --- |
| Member import (legacy) | `backend/imports/views.py` `parse_date` | `MM/DD/YYYY` and `03/14/2016` is 14 March 2016. `DD/MM/YYYY` and `31/12/2026` is 31 December 2026 |
| Setup import | `backend/setup/dates.py` `parse_with_format` | `03/04/2010` with `DD/MM/YYYY` is 3 April 2010, not 4 March |
| Setup wizard guess | `frontend/src/lib/import-date-format.ts` | The same candidate list, including `MM/DD/YYYY`. Ambiguous values stay ambiguous |
| Club data import | `backend/members/club_data_import.py` `_parse_date` | ISO `2026-11-29` stays. `21/11/2026` and `21.11.2026` are 21 November 2026 (day first). `01/02/2026` is stored as 1 February 2026 and keeps the `ambiguous_date` warning. It is not rewritten as 2 January |
| Bank lines | `backend/licenses/bank_recon.py` `parse_date` | `2026-11-29`, `29.11.2026`, and `29/11/2026` stay the dates they are today. A value that returns `None` today still returns `None` |

What it would have caught: the readable-date work was scoped to screens, PDFs, and emails. The same change would have rewritten these parsers if they had not been named as out of scope. A golden fails that pull request even if the instruction is forgotten.

Cost: milliseconds inside the existing suites.

### Stripe webhook signature

`licenses/stripe_adapter.py` `construct_webhook_event` calls `stripe.Webhook.construct_event`. It does not call `construct_event_without_verification`. `licenses/test_stripe_adapter.py` already patches `construct_event`. The rail is stronger than a patch:

- The test reads the adapter source and asserts the call is `Webhook.construct_event`.
- The test asserts `construct_event_without_verification` does not appear in `backend/licenses`.
- The webhook view uses the adapter. It does not construct an event itself.

What it would have caught: an agent "simplifying" the webhook by trusting the JSON body. That is a signature bypass. The existing patch test fails if the function is no longer called. The source assertion fails if a second call site skips it.

Cost: milliseconds.

## 3. Protected paths

Some files are correct on purpose. A drive-by edit should not merge because the tests still pass.

The check is a required GitHub status, `Protected paths`. It diffs the pull request against `develop`. If a protected path changes and the pull request does not carry the label `faustino-ok`, the check fails. The label counts only when the GitHub user who added it is `Faustino-CIMA`. Another account adding the same label does not pass. Removing the label fails the check again.

Protected paths for the first list:

- `backend/licenses/card_rendering.py`
- `backend/licenses/stripe_adapter.py`
- `backend/licenses/views.py` only if the webhook view moves; until then the stripe adapter and its test are the signature boundary. The webhook view file is large. Do not protect all of `views.py`. Protect `backend/licenses/stripe_adapter.py` and add the source assertion in section 2.
- `backend/clubs/display_dates.py`
- `frontend/src/lib/date-display.ts`
- `backend/imports/views.py`
- `backend/setup/dates.py`
- `frontend/src/lib/import-date-format.ts`
- `backend/members/club_data_import.py` for `_parse_date` only. The whole import file will keep changing (families and contacts just landed). A path rule cannot see one function. Until a later split, the golden in section 2 covers `_parse_date`, and this file is not on the path list.
- `backend/licenses/bank_recon.py` `parse_date` is the same problem: the file does more than dates. The golden covers `parse_date`. The file is not on the path list.
- `AGENTS.md` is not protected. The rule in section 1 must be editable without the label.

A pull request that only updates a golden or a parser, and says so, still needs `faustino-ok`. That is the point.

What it would have caught: a date-format pull request touching `imports/views.py` or `setup/dates.py` while changing screen dates. A card-layout pull request touching `card_rendering.py` while fixing a screen. Those need a conscious yes.

Cost: one `git diff` and one look at the label actor. Under a minute. It runs on every pull request.

What stays manual: Faustino adding the label. CI cannot decide that a card change is wanted.

## 4. Playwright smoke in CI

Jest does not open the real page. Django does not click the wizard. A short Playwright job does, with fake data only.

Job name: `Smoke - Playwright`. Chromium only. It runs on pull requests to `develop` when `frontend/`, `backend/`, or the smoke folder changes. A docs-only pull request skips it. It does not run inside the backend job.

The app uses the same fake club the Django tests use. The signed-in user is a club admin test account with a second factor the suite can complete (a fixed TOTP secret in CI secrets, not a personal phone). No real member row.

Flows, in order:

1. Sign in, complete the test second factor, land on the club desk.
2. Card check for a fake member who has a number and is not verified: the desktop page shows the QR (or the copy-link fallback) and does not show the no-number warning.
3. Card check for a fake member with no number: the warning and **Enter the social security number** are visible, and the scan heading is not.
4. Card check for a verified fake member: the page shows the verified date and the unlock reason, and it does not show the scan heading.
5. Data import of a tiny fake file: dry run, commit, undo. The result counts change, and undo removes the created row.
6. Download the member-data PDF and the statement PDF for that fake club. Each response is a PDF. The statement and the member-data PDF contain the club name. This smoke does not compare the licence card PDF. That stays the golden in section 2.
7. **Download my data** as the fake member. The response is a file. The suite does not open a real person's file.

What it would have caught: the card-check heading shown in the wrong state (#268). A dry run that started writing rows. A PDF download that returned HTML or a 403 for the club admin who should succeed.

Cost: about 10 minutes for this list, once Chromium is cached, plus the time to boot the app. Budget 15 minutes so a cold cache still finishes. If it grows past that, cut a flow. Do not add a second browser.

What stays manual: Brave on an iPhone, a printed licence card, a real camera reading a card, and any flow that needs a human looking at alignment.

## 5. Card check as a state machine

The card-check page has grown by screens (phone camera, desktop QR, unlock, no number). Illegal combinations shipped because each screen rendered a heading outside the state. Write the states down and test the transitions. Do this before the Playwright job. Unit tests are the cheap net. Playwright is the click-through.

On `develop` today, `create_challenge` still inserts a code whenever it is called. The refusals below (400 with no number, 409 while verified) are the behaviour the open card-check fix is adding. The state-machine tests lock that behaviour. They do not invent a second set of rules.

States:

| State | What the person sees | Code created? |
| --- | --- | --- |
| `loading` | A short wait | No |
| `no_number` | The existing warning and **Enter the social security number** | No |
| `waiting` | Desktop: scan heading, QR, expiry | Yes, one open code |
| `qr_fallback` | Desktop: the link, when the QR cannot be drawn | Yes, the same code |
| `camera` | Phone: the camera and **Read the card** | No, the phone uses the code it opened |
| `reading` | Phone: reading | No |
| `local_failure` | Wrong card, unreadable, or a health card | No |
| `mismatch` | The fields that differ | No |
| `confirm_names` | Use the card names, or keep the stored names | No |
| `verified` | **Verified on DD.MM.YYYY** and, for a club admin, the unlock reason | No |
| `expired` | The code expired. **Start again** | The old code is dead |
| `failed` | The request failed. **Start again** | No new code until start |

Transitions that are allowed:

- `loading` to `no_number` when `has_number` is false. No call to create a code.
- `loading` to `verified` when `verified` is true. No call to create a code.
- `loading` to `waiting` or `qr_fallback` only when there is a number and the member is not verified.
- `waiting` to `verified` when the phone finishes.
- `waiting` to `expired` when the code is no longer open.
- `verified` plus a non-empty reason to `waiting` after the unlock API returns not verified. The new code is a new token.
- Phone: `camera` to `reading` to `confirm_names` or `mismatch` or `local_failure` or `verified`.
- `local_failure` and `mismatch` back to `camera`.
- `expired` and `failed` to `loading` on **Start again**.

Transitions that are illegal:

- `no_number` to `waiting`. The API returns 400 and creates no `VerificationChallenge`.
- `verified` to `waiting` without a successful unlock. The API returns 409.
- Unlock with an empty reason. The button stays disabled. The API returns 400.
- A coach creating a code or unlocking. The API returns 403.
- Showing the scan heading in `no_number` or `verified`.
- Storing a card image. The compare endpoints already return 400 when an image field is sent.

Invariants, true in every state:

- The social security number is not in the HTML and not in the challenge JSON.
- The licence card PDF is not part of this flow.
- Unlock writes an audit event with the reason and does not write the number.
- After unlock, `verified` is false and `verified_at` is null. A new check is required before the fields lock again.

What it would have caught: the desktop component always rendered the scan heading, then the state underneath. `no_number` and `verified` are not scan states. A transition test fails if `createMemberChallenge` is called from those states, which is the bug #268 fixes.

Cost: Jest and a few Django tests. Seconds.

What stays manual: whether the words on the button are the ones Faustino asked for, in all four languages. The tests can lock the keys. A person still reads the French.

## 6. Root cause, not a bandaid

Write this into the same AGENTS.md section as the regression rule.

- Fix the state that is wrong, not the pixel in front of it. If the scan heading shows with no number, the page is rendering a heading that does not belong to that state. Hiding the heading with a special case in one browser is a bandaid.
- Do not add a second formatter, a second date parser, or a second Stripe check to avoid touching the shared one. Extend the shared one, or leave it and protect it.
- Do not "fix" a red suite by skipping the test, loosening the assertion, or pinning a transitive package without saying why. The charset-normalizer lock moving to 3.5.3 was a real lock refresh because CI recompiles the lock. Pinning 3.5.2 to go green would have been a bandaid.
- A UI change that the API does not enforce is not done. The card-check rules (no code without a number, no code while verified, unlock needs a reason) are enforced in `create_challenge` and `unlock_member`, not only in the button.

What it would have caught: a desktop-only `if` that hid the heading while the phone still showed the scan introduction, or a client that never called create while the API still issued a code.

Cost: none in CI. It is a review rule. The tests in sections 1 and 5 are what make it stick.

## Rollout

Each step is one pull request off the latest `develop`, after this spec is approved. Do not start the next step in the same pull request.

1. AGENTS.md: the regression sentence from section 1, and the root-cause paragraph from section 6. No workflow change.
2. Protected-paths check and the label `faustino-ok`, with the path list in section 3. No product code.
3. Golden tables: screen dates, the four import parsers, bank `parse_date`, and the Stripe source assertion. Extend the tests that already exist.
4. Licence card PDF text golden. One fake card.
5. Card-check state-machine tests, desktop and phone, plus the API refusals. This can land with or just after the card-check fix, and must match the states in section 5.
6. Playwright smoke job, last. It depends on a stable card-check page and a fake login.

## What stays manual after all of that

- Brave on an iPhone, including the camera and the QR scan from a real phone.
- Looking at a printed licence card.
- Live Stripe, live email, and a real bank file.
- Adding `faustino-ok`.
- Merging. Agents do not merge.
- Judging alignment, theme tokens, and whether a label is the right words. Tests lock keys and a few strings. They do not replace reading the screen.
