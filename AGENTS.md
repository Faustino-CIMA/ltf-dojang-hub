# LTF Dojang Hub: rules for coding agents

These rules are mandatory for every change to this repo. If a rule blocks you, stop and ask; never work around it.

## 1. Dependencies and builds (lesson from the 12 Nov 2026 login outage, and the 26 Nov 2026 card-reader regression)
- Pin every runtime dependency to an exact version (`==`) in the backend requirements, and commit the frontend lockfile. No `>=`, `~=`, or unpinned names.
- Prefer a lock file with hashes (pip-tools `pip-compile --generate-hashes`), and install from it in the Docker image. Two builds of the same commit must install identical versions.
- Do not update, upgrade, or swap a Python package, an npm package, a WASM or OCR asset, a Docker base image, the Node or Python runtime, or a lockfile on your own. Do not put a library bump inside a feature or a bug-fix PR. When an upgrade is needed, for a security fix or a feature that cannot ship without it, propose it first: the reason, the breaking changes, and the risk. Wait for the maintainer's explicit go-ahead.
- An approved upgrade is its own small PR off the latest `develop`. One library per PR. A tightly coupled pair that must move together, such as torch and torchvision, is still one PR, and nothing else rides along. Read the library's changelog and list the breaking changes in plain words in the PR body.
- A pin held below the latest stable stays there. Write the reason next to the pin or in this file. Do not bump it unless the maintainer explicitly asks, and the original failure is shown to be fixed. `tesseract.js` and `tesseract.js-core` stay on 5.1.1. Version 7.0.0 shipped relaxed-SIMD WebAssembly cores, and the phone card check stopped reading cards on iOS and WebKit.
- Before any approved version choice, follow section 11. Check the live registries and whether the packages work together on our Python and Node. Do not trust a remembered version.
- Anything security- or auth-related (django-allauth, DRF, Django, Stripe, cryptography, MFA libs) gets an upgrade PR that also includes tests exercising the real login path.
- A green build, lint, or mocked unit test does not prove an upgrade is safe. Follow the real-path checks in section 11.
- At a library boundary (OCR, PDF, Stripe, email, auth), a runtime or startup failure must reach the user as its own clear message. Do not fold it into a generic message.
- CI must fail if the requirements and the lock file disagree, and should run `pip check`.
- Never rely on private or undocumented library internals. When you must call library APIs whose return shape can change, wrap them in one small adapter module with its own tests, so there's a single place to fix.

## 2. Authentication and security
- Never weaken authentication, permissions, desk (X-Desk) checks, MFA, CSRF, or Stripe webhook signature checks. Permission checks must follow the desk on the request.
- Any change touching auth, sessions, tokens, or permissions must include tests that go through the real request path (real `Authorization: Token <session key>` header, real middleware). `force_login` alone is not enough, since it skips the authenticator.
- Keep a smoke test suite covering: login, MFA confirm, `/api/auth/me/`, one list endpoint per desk, and logout. It must pass before any merge.
- Never log, print, or return secrets: passwords, session keys, tokens, API keys, Stripe secrets. Commands written for the maintainer must not print secrets either.
- No real member data (especially minors) in the repo, PRs, tests, fixtures, or screenshots. Use fake data only.

## 3. Observability
- Production must keep a `LOGGING` config that sends `django.request` errors and unhandled exceptions to stdout/stderr (so they show in Coolify), without secrets or personal data.
- Unexpected errors are logged with a traceback, never swallowed silently.
- Add a lightweight health endpoint check that includes an authenticated request in the post-deploy check.

## 4. Safety of changes
- Nothing that works today may break, and users must see the same behaviour unless the change is the explicit goal. Performance must not regress (watch for N+1 queries; use `select_related`/`prefetch_related`).
- One piece of work per PR, on a fresh branch off the latest `develop`, targeting `develop`. Follow section 10 for the merge workflow.
- Features: write a spec first, no code until the maintainer approves. Fixes and small asks go straight to a PR.
- Never merge your own PRs. Never force-push, reset, rebase published branches, or move `develop` or `main` backwards. To resolve conflicts, merge `develop` into your branch.
- Never change the live Coolify app or deploy. The maintainer deploys.
- Migrations: schema and data migrations are separate files. Migrations must be reversible where possible and safe on a live database (no long locks on big tables).
- Commands for the Coolify web terminal must be a single line (no heredocs).

## 5. Tests and CI
- A reported bug is not fixed until a regression test, or a lint rule, fails on the old behaviour and passes on the new one.
- The test names the state, not the patch. "No social security number does not create a phone code" is a test. "The heading is wrapped in a condition" is not.
- If the bug is a forbidden edit (a file that must not change, a call that must stay), the regression is a lint rule or a snapshot, not a comment.
- A pull request that fixes a bug and does not add that test is not ready. The PR body names the test.
- Don't delete, skip, or loosen tests to make them pass. Do not pin a transitive package, or skip a check, just to make a red suite green. Say why a lockfile change is required.
- Run the full backend and frontend (Jest) suites, lint, and type checks before opening a PR. Report the test counts in the PR body.
- Test against the exact pinned dependency versions that production installs.
- Fix the state that is wrong, not the symptom in front of it. If a heading shows in a state where it does not belong, the page is rendering the wrong state. Hiding that heading in one browser is not a fix.
- Do not add a second formatter, a second date parser, or a second Stripe signature check to avoid the shared one. Extend the shared one, or leave it alone.
- A UI change that the API does not enforce is not done. The server must refuse the illegal action. The button is not the rule.

## 6. Code quality
- Keep functions small and named for what they do. Prefer clear code over clever code.
- Handle errors explicitly at boundaries (external APIs, libraries, user input). Validate input on the backend even when the frontend validates it too.
- No dead code, commented-out blocks, or stray debug prints in PRs.
- Type hints in new Python code; strict TypeScript, no `any` without a reason in a comment.
- Update the CHANGELOG for user-visible changes.

## 7. Reusable code
- Before writing anything new, search the codebase for an existing component, hook, util, serializer, service, or permission helper that already does it (or nearly does), and use or extend it.
- Never copy-paste logic between pages or desks (for example LTF and club versions of the same list). Extract it into a shared module and use it from both places.
- Abstract on the second or third real use, not on speculation. A shared piece must have a clear, single purpose and a name that says what it does.
- Shared UI lives in the shared component library (side panels, three-dots menus, info badges, billing-style cards, sortable tables, selection logic) and follows the UI rules below. Pages compose these pieces instead of rebuilding them.
- Business rules (pricing, minimum and maximum caps, license numbering, desk permissions) live in one backend service per rule, never duplicated in views, serializers, Celery tasks, or the frontend.
- Wrap third-party libraries (allauth, Stripe, Resend, WeasyPrint) in a small adapter module, so the rest of the code never depends on their exact API shape.
- When you extend a shared piece, keep existing callers working unchanged and add tests for both the old and the new use.
- In the PR body, say what you reused and what you made shared.

## 8. UI/UX (exceptional UI/UX is mandatory)
- Side panels have one Close button, in the header.
- Three-dots menus use icon plus label, with Edit first and Delete last.
- Use billing-style cards, popovers, and sortable tables; show names as LastName FirstName.
- All copy is translated in en, fr, de, and lb. No hard-coded strings.
- Theme tokens only (no hard-coded colours). Mark required fields. Use info badges for explanatory text.
- Red is only for real errors, never for info or empty states.
- Every import and every export reuses the LTF member import preview: the same table layout, status badges, columns, filters, and alignment. Do not invent a second preview. Every row shows the related member's name, last name then first name.

## 9. PR description checklist
- What changed and why, in plain words.
- What existing code you reused, and anything you made shared.
- Risks, and what you checked so nothing existing breaks.
- Dependency changes (with versions and changelog notes), migrations, new settings or env vars. For an upgrade, include the section 11 table.
- Test counts (backend, Jest) and any manual check steps. For a bug fix, name the regression test or lint rule.

## 10. PR and merge workflow
- Keep at most one or two pull requests open at a time. Cut the next branch only after the previous pull request has merged.
- Always branch from the latest `develop`. The pull request base is always `develop`. Never stack a pull request on another pull request.
- Keep each pull request to one small topic.
- Before reporting a pull request ready: merge the latest `develop` into the branch (a merge commit, not a rebase), rerun the tests, and confirm GitHub shows the pull request mergeable and clean.
- Right before merge, check shared files against `develop`: locale JSON files (`en`, `fr`, `de`, `lb`) and migration files. If two pull requests both add migrations, the later one renumbers or regenerates its migration after the first has merged, so the numbers and dependencies do not clash. Schema and data migrations stay in separate files.
- Never force-push. Never reset a published branch. Never move `develop` or `main` backwards.
- Do not merge your own pull requests. The maintainer merges. CI on the pull request must be green first.

## 11. Upgrades
An upgrade starts only after the maintainer has said yes, as in section 1. The checks below are how you choose the version inside that approved pull request. They are not a reason to open one.

Before choosing the version, read the live package lists. A remembered version is not evidence.

- PyPI: `https://pypi.org/pypi/<name>/json`. The candidate is the latest non-yanked release, with its upload date, `requires_python`, and the wheel filenames.
- npm: `npm view <name> version`, `time`, and `dist-tags`. The stable version is the `latest` tag. Ignore `dev`, `next`, and `beta` unless the maintainer asked for one.
- Docker Hub tag API for base images (`python`, `node`, `postgres`, `redis`), including the tag's last update.
- Node: `https://nodejs.org/dist/index.json`. Prefer the newest entry whose `lts` field is set. An alpha, or a non-LTS current line, is not the default.
- Python: `https://www.python.org/api/v2/downloads/release/?is_published=true&pre_release=false`. The latest stable is the release with `is_latest` true and `pre_release` false.

Then check those versions against each other, including the Python version and the Node version we run:

- A wheel exists for our Python ABI (`cp313` today), and for a newer Python if one is current. CPU-only torch and torchvision come from the CPU index, not a wheel that bundles CUDA.
- `requires_python` and the published Python classifiers. A classifier that stops at an older Python is a reason to hold, even when a pure-Python package would still install.
- npm `peerDependencies` and `engines` for Node.
- The framework's own matrix (Django's Python classifiers, the torch and torchvision pair, a browser library's Node range).

In the pull request, show a table: our version, the latest stable version, that version's release date, and whether we are behind. For every version kept below the latest stable, write one reason. Do not move a held-back version unless the maintainer explicitly asks and the original failure is shown to be fixed. One library, or one tightly coupled group, per pull request, as in section 1.

A green build, lint, or mocked unit test is not enough. In the same pull request:

- List every user-facing feature that depends on the library.
- Run real end-to-end tests of those features. Where the runtime behaviour changed, call the real library. Backend libraries go through the real request and auth path. Frontend libraries run in a real browser.
- For a browser, camera, WASM, PDF, or media library, check the target platforms: iOS Safari and Brave on iPhone (WebKit), and desktop Chromium. Watch for WebAssembly features such as Relaxed SIMD, worker and blob limits, canvas memory limits, and a change in a cached model or asset format.
- When CI cannot run the real path (camera capture, reading a real ID card, physical printing), put a short step-by-step manual check in the pull request body, and say the pull request needs that check before release.
- Say how to revert cleanly. If an asset format changed, say how to clear the client or worker cache.
- At a boundary library (OCR, PDF, Stripe, email, auth), show that a runtime or startup failure has its own clear message.
