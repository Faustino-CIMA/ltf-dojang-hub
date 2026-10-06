# Review of the previous manuals and what this edition changes

The previous editions (four 35-page PDFs, 7 screenshots and 4 ReportLab scripts, built with ReportLab) were removed from this folder when this edition replaced them.

## Weaknesses of the previous manuals
1. **Mostly description, few procedures.** Most screens were explained in prose. A reader could not easily
   see *what to click, in which order, and what happens next*.
2. **Gaps in coverage.** The following were missing, or were only mentioned with no procedure:
   - club-to-club transfers
   - the Coaches tab, and how a coach gets a login
   - the committee, and its link to payment permissions
   - the member record (club file)
   - the CSV import wizard in detail
   - quick print and print jobs
   - shop stock movements and QR/stickers
   - belt-test pass/fail
   - the calendar visibility rules
   - EQF 2 bis
   - Transfers in particular were named but never explained as a step-by-step flow.
3. **Wrong in places.** The promotion "minimum time" rules did not match the app's promotion rules. Some UI wording
   had changed since the manual was written.
4. **DE/FR did not match the screen.** The German and French manuals translated button names. The app has no German or
   French UI, so the user saw labels that were not in the manual.
5. **Screenshots.** There were only 7 figures. Some were cut off or hidden behind overlays, none had numbered call-outs, and LB used the
   same English screenshots.
6. **Navigation.** There was a basic TOC with no index, no glossary, no page cross-references and no FAQ.
7. **Tone and structure.** The tone was uneven. The manual was organised by screen, not by who the reader is or the job they need to do.
8. **Maintenance.** There were four near-identical ~77 KB Python scripts, one per language. The text was hard-coded
   in the code, and the scripts used Windows font paths (`C:\Windows\Fonts\segoeui.ttf`), so they did not build on Linux.
   A change had to be made four times, and nothing checked that the languages stayed in sync.

## What this edition does
- **Organised by role and task:**
  - coaches (only what works today; the role is still being built)
  - club admins (members & licences, money, training & promotion, shop, calendar, club profile)
  - LTF Admin
  - LTF Finance
  - Ops
- **A club-year checklist** that links to each procedure.
- **Numbered procedures** with an expected result, plus TIP / WARNING / NOTE boxes for traps (e.g. "Blocked" bills,
  payment recorded only for the full amount, coaches must be active adult members).
- **50 new annotated screenshots**, taken from a local copy of v0.12.0 with invented demo data. Each has red numbered
  call-outs and a legend. **The LB manual uses screenshots of the Luxembourgish UI.**
- **UI labels are pulled from the app's own message files at build time:**
  - each manual quotes the label the reader actually sees: English UI for EN/DE/FR, Luxembourgish UI for LB
  - the glossary shows the EN and LB label side by side
  - a renamed label breaks the build instead of silently leaving the manual out of date
- **Navigation:**
  - linked TOC
  - running chapter header and page numbers
  - automatic "p. N" on cross-references
  - two-column index
  - glossary of about 30 terms
  - FAQ
- **Built from one source:**
  - one Markdown file per language, with a shared template and CSS
  - `build.py --check` checks that headings, anchors, figure order and UI-key order are identical in all languages
  - the screenshots can be reproduced from the specs in `tools/figures.py`
- **Facts checked against the code**, not against the old text. Examples: there is no self-signup and no
  forgot-password link; the calendar badge counts upcoming events. Anything unclear is listed as an open question
  instead of being guessed (see "Open questions" in README.md).
- **Written for the people who actually use the app.** Members and parents do not get a login, so the old
  member-facing pages are gone. Getting started and the FAQ say this plainly. Online payment is described as test mode.
