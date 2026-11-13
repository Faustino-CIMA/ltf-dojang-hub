# LTF Dojang Hub: rules for coding agents

These rules are mandatory for every change to this repo. If a rule blocks you, stop and ask; never work around it.

## 1. Dependencies and builds (lesson from the 12 Nov 2026 login outage)
- Pin every runtime dependency to an exact version (`==`) in the backend requirements, and commit the frontend lockfile. No `>=`, `~=`, or unpinned names.
- Prefer a lock file with hashes (pip-tools `pip-compile --generate-hashes`), and install from it in the Docker image. Two builds of the same commit must install identical versions.
- Upgrade dependencies only in their own PR, one library (or one tightly coupled group) at a time. Read the library's changelog for breaking changes and list them in the PR body.
- Anything security- or auth-related (django-allauth, DRF, Django, Stripe, cryptography, MFA libs) gets an upgrade PR that also includes tests exercising the real login path.
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
- Every bug fix comes with a regression test that fails before the fix and passes after.
- Run the full backend and frontend (Jest) suites, lint, and type checks before opening a PR. Report the test counts in the PR body.
- Don't delete, skip, or loosen tests to make them pass.
- Test against the exact pinned dependency versions that production installs.

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

## 9. PR description checklist
- What changed and why, in plain words.
- What existing code you reused, and anything you made shared.
- Risks, and what you checked so nothing existing breaks.
- Dependency changes (with versions and changelog notes), migrations, new settings or env vars.
- Test counts (backend, Jest) and any manual check steps.

## 10. PR and merge workflow
- Keep at most one or two pull requests open at a time. Cut the next branch only after the previous pull request has merged.
- Always branch from the latest `develop`. The pull request base is always `develop`. Never stack a pull request on another pull request.
- Keep each pull request to one small topic.
- Before reporting a pull request ready: merge the latest `develop` into the branch (a merge commit, not a rebase), rerun the tests, and confirm GitHub shows the pull request mergeable and clean.
- Right before merge, check shared files against `develop`: locale JSON files (`en`, `fr`, `de`, `lb`) and migration files. If two pull requests both add migrations, the later one renumbers or regenerates its migration after the first has merged, so the numbers and dependencies do not clash. Schema and data migrations stay in separate files.
- Never force-push. Never reset a published branch. Never move `develop` or `main` backwards.
- Do not merge your own pull requests. The maintainer merges. CI on the pull request must be green first.
