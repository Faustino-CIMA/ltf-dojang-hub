# LTF Dojang Hub – user manual (EN · DE · FR · LB)

One source tree builds four print-ready PDFs:

| Language | PDF | UI labels quoted | Screenshots |
|---|---|---|---|
| English | `LTF-Dojang-Hub-User-Manual-EN.pdf` | English UI | `figures/en/` |
| Deutsch | `LTF-Dojang-Hub-Benutzerhandbuch-DE.pdf` | English UI (the app has no German UI) | `figures/en/` |
| Français | `LTF-Dojang-Hub-Manuel-utilisateur-FR.pdf` | English UI (the app has no French UI) | `figures/en/` |
| Lëtzebuergesch | `LTF-Dojang-Hub-Benotzerhandbuch-LB.pdf` | Luxembourgish UI | `figures/lb/` |

The manual describes app version **0.12.0** (repo commit `e6c68c8`). All people, clubs and numbers in the
screenshots come from an invented demo data set. There is no real personal data.

## Layout

```
build.py              single-source builder (Markdown → HTML → PDF with WeasyPrint)
content/en.md …lb.md  manual text, one file per language, same structure
content/glossary.yaml shared glossary (UI key + term/explanation per language)
template/manual.html  Jinja2 template: cover, imprint, TOC, body, glossary, index
template/manual.css   print stylesheet: A4, running header/footer, page numbers, figure/callout styles
assets/ltf-logo.png   logo (taken from repo/frontend/public/ltf-logo.svg)
figures/en, figures/lb  annotated screenshots + _report.json (capture log)
tools/                screenshot capture and demo-data seed scripts (see below)
build/                intermediate HTML (regenerated on every build, safe to delete)
requirements.txt      Python dependencies
CRITIQUE.md           review of the previous manuals and what changed
```

## Rebuild the PDFs (text or layout changes only)

```bash
python3 -m venv .venv && . .venv/bin/activate
pip install -r requirements.txt
# system packages: WeasyPrint needs Pango; fonts: fonts-inter, fonts-dejavu-core
python build.py              # all four languages
python build.py lb           # one language
python build.py --check      # structure and label checks only, no PDF
```

`build.py` reads the app's UI strings from `../repo/frontend/src/messages/{en,lb}.json`.
To use another checkout, set `LTF_MESSAGES=/path/to/frontend/src/messages`.

The build stops with **exit code 2** if:
- a `[[key]]` does not exist in the UI catalogue. That usually means the UI changed, so the text must be checked.
- the languages are out of sync: different headings or anchors, figure order, or UI-key order compared with EN.

The index takes two passes. Pass 1 lays out the document and finds the page of every index mark. Pass 2 keeps
one reference per page and at most `index_max_refs` (default 6) per term.

## Writing markup (on top of Markdown)

| Markup | Effect |
|---|---|
| `[[key]]`, `[[Namespace.key]]` | the exact on-screen label in the manual's UI language (`ui:` in front matter), shown as a UI chip |
| `[[key\|year=2026]]` | the same, with ICU placeholders filled in |
| `![Caption](fig:id)` / `![Caption {small}](fig:id)` | numbered figure from `figures/<ui>/<id>.png` (small = narrower) |
| `> [!TIP]`, `> [!WARNING]`, `> [!NOTE]` | call-out boxes (titles come from `labels:` in front matter) |
| `{{Term}}`, `{{Term\|shown}}` | manual index entry |
| `index_terms:` in front matter (`Entry = regex`) | automatic index: first match in every section |
| `{: .proc}` before a list, `{: .lead}`, `{: .result}` | procedure, lead paragraph, expected-result styling |
| `<div class="legend" markdown="1">` + numbered list | legend for the red numbers on a screenshot |
| `## Heading {#anchor}` | stable anchors. **Use the same anchors in every language**, because links and the sync check depend on them |
| `[text](#anchor)` | cross-reference; the page number is added automatically ("p. N" / "S. N" / "p. N" / "S. N") |

**To change the text:** edit `en.md` first, make the same change in `de.md`, `fr.md` and `lb.md`,
then run `python build.py --check`.

**To add a language:** copy `de.md` to `xx.md` and translate it. Keep the anchors, figure ids and `[[keys]]` in the same order.
Set `ui: en` (or `lb`) and set `pdf_name`, `html_lang` and `labels`. Add an `xx:` block to every glossary entry and add `xx` to `LANGS` in `build.py`.

## Recreate the screenshots (needs the app running locally)

Screenshots are taken from a **local** copy of the app, filled with demo data. Never use production data.

1. **Stack:** start PostgreSQL 17 and Redis on localhost. Set up the backend `.env` for a local DB
   (`DJANGO_DEBUG=1`, a console email backend, no payment keys). Then:
   ```bash
   cd ../repo/backend && python manage.py migrate && DJANGO_DB_CONN_MAX_AGE=0 python manage.py runserver 0.0.0.0:8000
   cd ../repo/frontend && npm ci && NEXT_PUBLIC_API_URL=http://localhost:8000 npm run build \
     && NEXT_PUBLIC_API_URL=http://localhost:8000 npx next start -p 3000
   ```
2. **Demo data:** run the seed scripts in this order on a freshly migrated, empty database. All data is invented. The scripts skip most rows that already exist, but they are meant to run once.
   - ORM scripts run inside the backend: `python manage.py shell < /path/to/tools/seed_N_….py`
   - API scripts run with the manual venv from `tools/`: `python seed_N_….py`. They go through the app's own business rules.

   | # | Script | Kind | Creates |
   |---|---|---|---|
   | 1 | `seed_1_base_orm.py` | ORM | federation profile, demo clubs, members, demo logins, licence types/prices, licences, grade history |
   | 2 | `seed_2_training_api.py` | API | training series, membership and licence fees, calendar events |
   | 3 | `seed_3_committee_shop_orm.py` | ORM | committee mandates, shop items/variants and opening stock |
   | 4 | `seed_4_activity_api.py` | API | families, held training sessions, promotion rules and belt tests |
   | 5 | `seed_5_billing_api.py` | API | yearly club billing, licence orders and LTF invoices |
   | 6 | `seed_6_club3_history_orm.py` | ORM | second club admin (`paul.musel`), licence history |
   | 7 | `seed_7_cardtemplate_api.py` | API | licence-card template version, set as default |
| 8 | `seed_8_contacts_orm.py` | ORM | contact data for Tom SCHMIT's club record, grade history for Sandra WEIS |
| 9 | `seed_9_figure_fill_api.py` | API | today's club event, a demo bank statement, a credit note on LTF invoice 14, completed transfers (Felix THILL, who ends back in his own club) |

   Demo logins (password `Demo-Manual-2026!`):
   - `ops.demo` (Ops)
   - `ltf.admin`, `ltf.finance`
   - `anne.reding` (club admin, TKD Club Uelzecht (Demo))
   - `jeff.lorang` (coach)
   - `sandra.weis` (member; has a login in the demo data only. In real use members and parents do not sign in, so the manual does not use this account)
   - `paul.musel` (club admin, Dojang Musel (Demo))
3. **Capture:** run from `tools/` with the manual venv (`python -m playwright install chromium` once):
   ```bash
   python checkkeys.py             # every annotation key still exists in the UI (silent = OK)
   python capture.py en            # all figures, English UI  -> figures/en/
   python capture.py lb            # all figures, Luxembourgish UI -> figures/lb/
   python capture.py en billing    # re-capture single figures by id
   python contact.py ../figures/en /tmp/sheets   # contact sheets for checking by eye
   ```
   `figures.py` holds the figure specs: route, login, viewport, clicks, and the annotated elements.
   Elements are found by **UI key** (resolved from the app's message catalogues), by ARIA role/label or by CSS, so
   the same spec works for both UI languages. The red numbered boxes are drawn with Pillow.
   Check `_report.json` for annotations that could not be found.

   `capture.py` checks every page before it takes the screenshot:
   - It waits for loading states to finish.
   - It reports `BAD:` when the page shows a permission error ("Action not allowed"), a 404, a 500, or a "Server error" message.
   - It trims empty background off the bottom of each capture.
   - `crop_sel` in a spec cuts the capture to one element (used for the privacy page, which is a single card).

   Run the backend with `DJANGO_DB_CONN_MAX_AGE=0`. With the default value, the development server keeps database connections open. A full capture run then exhausts PostgreSQL ("too many clients"), and pages come up with errors or empty data.

### tools/ in brief
- `capture.py`, `figures.py`, `checkkeys.py`, `contact.py`: the screenshot pipeline (described above).
- `api.py`: a small authenticated API client used by the API seed scripts.
- `seed_*.py`: demo data (table above).
- `dev/`: helpers used while writing the manual. They are not needed for a rebuild.
  - `shot.py`: one-off screenshot of any route as any demo user.
  - `crawl.py`: screenshots of every route for one role.
  - `keys.py`: lists the EN | LB strings used by a frontend source file. Useful for checking wording.

## Quality checks done for this edition
- All 50 figures were checked by eye in both sets (EN and LB). None shows an error, a loading state, an empty list where content is expected, the wrong role or the wrong language.
- `python build.py --check`: all languages in sync (72 headings, 50 figures, same UI-key sequence), and no unknown UI keys.
- Every page of all four PDFs was rendered to PNG (`pdftoppm`) and checked by eye: cover, TOC page numbers, figures and legends, call-outs, glossary, index (no duplicate page numbers) and cross-reference page numbers.

## Open questions

Status after Faustino's answers (6 October 2026):

| # | Question | Status |
|---|---|---|
| 1 | Coach member list is empty (coaches only see members of clubs they administer) | **Resolved.** Coach features are not finished. The manual describes only what works (training week, roll, calendar) and says more is planned. The empty list is not documented as a feature. |
| 2 | Do members and parents get a login? | **Resolved.** No. The app is a staff tool for clubs and the federation. Stated in Getting started, Roles and the FAQ; the member chapter was removed. One line says member access may come later. |
| 3 | Expense form wording "federation accounts" | **Resolved.** Club expense pages use `LtfFinance.clubExpensesSubtitle` / `clubExpenseFormSubtitle` ("this club's accounts"); LTF Finance keeps the federation wording. Shipped with this docs commit. The manual quotes the new subtitles in "Other income and expenses". |
| 4 | Licence fee: "first bill" vs. "billing chosen for that year" | **Resolved.** The season runs September to September. New section "When the licence fee is charged", with an example and a note that reconciles the two wordings. |
| 5 | Privacy page `/settings/privacy` | **Resolved.** Own section in Getting started, checked against the code. The page is reached by URL only, its text is English only, and it is marked as being reviewed. |
| 6 | Subsidies hint says "Trainers" while the tab is "Coaches" | Open |
| 7 | Inconsistent LB UI strings | Open |
| 8 | Pay now | **Resolved.** Test payments only, and the provider is not decided. The manual says so and names no provider. |
| 9 | Date inputs follow the browser locale | For information; covered in the FAQ |
| 10 | Printer profiles can only be edited by LTF Admin | Open |
| 11 | Federation inventory and tournaments are not shipped | Open (not documented) |

