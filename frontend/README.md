# Frontend (LTF Dojang Hub)

Next.js 16 App Router frontend for LTF Dojang Hub.

For complete project setup (Docker-first), environment variables, deployment notes, and troubleshooting, see the root `README.md`.

## Local frontend-only development

```bash
cd frontend
npm install
npm run dev
```

App URL: `http://localhost:3000`

Notes:
- Keep frontend and backend on the same host (`localhost` or `127.0.0.1`) to avoid CORS mismatch.
- CI validates this package with `npm run lint` and `npm run build`.

## License Card UI Runbook

LTF Admin pages:
- Template manager: `/{locale}/dashboard/ltf/license-cards`
- Designer: `/{locale}/dashboard/ltf/license-cards/{templateId}/designer`
- Print jobs: `/{locale}/dashboard/ltf/license-cards/print-jobs`

Club Admin pages:
- Print jobs history: `/{locale}/dashboard/club/print-jobs`
- Quick print: `/{locale}/dashboard/club/print-jobs/quick-print`
- Club admins (rubber-band): `/{locale}/dashboard/club/admins`
- Membership fees: `/{locale}/dashboard/club/fees`
  - Add a fee from the card at the top. Edit on a fee corrects its name and current amount. Delete removes it and returns assigned members to the club default. Save new amount schedules a later price. Issued invoices stay unchanged. A year can have several billings, and each one charges the membership amount again. License fee billing chooses which one adds the license fee. Until another is chosen, the fee stays on the first billing.
- Families: `/{locale}/dashboard/club/families`
  - Family cards start collapsed. They keep who is in the family and who receives the bill. Parents and guardians can be entered here and on a minor’s club record. Invoices are issued from Billing. Invoice preview opens the family invoice page.
- Billing: `/{locale}/dashboard/club/billing`
  - Review and issue sends the selected billing. A row opens that household’s invoice page. A family row shows an invoice number only when one invoice covers every current member, and the amount is that invoice’s total. A total of 0,00 is issued and marked paid.
- Coach pay: `/{locale}/dashboard/club/training/hours`
  - A club admin sets each coach to an hourly rate or one amount per held class. Tournament, fuel, and hotel rows use their date. Coaches see hours and units. Only a club admin sees the amounts.
- Club settings: `/{locale}/dashboard/club/settings`
  - Website is printed under the club email on invoices the club sends to its members. When club management is assigned, Publication consent lists active members. A column header ticks that channel for every active member. The PDF can list members by consent. CSV and Excel include every active member.

Ops console (Django `is_superuser` only):
- Overview: `/{locale}/dashboard/ops`
- Modules (product codes and club assignment): `/{locale}/dashboard/ops/modules`
  - The install id on that page is not a product code. With no `MODULE_CODE_*` keys, the server stores a signing key in the database. A superuser mints an `LTF1.…` code and then redeems it. Set `MODULE_CODE_PUBLIC_KEY` alone when another party signs the codes.

Preview prove-out (only when entitled / assigned):
- LTF Admin: `/{locale}/dashboard/ltf/preview`
- Club Admin: `/{locale}/dashboard/club/preview`

Event calendar (module `event_calendar`; federation when entitled, club when assigned):
- LTF Admin: `/{locale}/dashboard/ltf/calendar`
- Club Admin: `/{locale}/dashboard/club/calendar`
- Member (public dates): `/{locale}/dashboard/member/calendar`

Quick print entry points:
- Members page stores selected member IDs and opens quick print:
  - `/{locale}/dashboard/club/members`
- Licenses page stores selected license IDs and opens quick print:
  - `/{locale}/dashboard/club/licenses`

The quick print page creates and executes a print job in one flow using:
- `POST /api/print-jobs/`
- `POST /api/print-jobs/{id}/execute/`

Print jobs pages support:
- status filtering/search,
- execute/retry/cancel actions,
- PDF download when status is `succeeded`.

License Card v2 designer capabilities:
- Full-height design workspace (no LTF sidebar). Tools, canvas, and inspector stay on screen; preview/print opens from the top bar.
- Built-in embeddable print fonts (Inter, Source Sans 3, Source Serif 4, IBM Plex Mono, Barlow Condensed). Text style picks a font file, not a free-text family name.
- Dual-side editing (`front` / `back`) with side switch, flip side, and copy side actions.
- Side-aware preview requests (`preview-data`, card/sheet PDF, and live simulation HTML).
- Live print simulation toggle and manual refresh from the designer preview panel.
- Undo/redo history stack and precision layout tools (align, duplicate, nudge with keyboard shortcuts).
- LP798 geometry is aligned to card `85.00x55.00` with exact placement contract for preview/print parity.
- Publish flow protects unsaved changes by persisting draft payload before publish (v0.3.3 gate-confirmed).
- Asset upload flow supports reliable same-file reselect behavior and active-by-default uploads.
- Role merge fields (`primary_license_role`, `secondary_license_role`) print and store capitalized labels (`Athlete`, `Coach`, …). Locked date formatting is available in simulation/PDF.
- Club and LTF member Current licenses show the published Standard 3C card above the license table (`GET /api/members/{id}/license-card-preview/`).
- Simulation refresh path is deterministic and font-size parity with PDF preview is enforced (v2.1).

Relevant frontend API client helpers (`src/lib/license-card-api.ts`):
- `getCardTemplateVersionPreviewData()`
- `getCardTemplateVersionCardPreviewPdf()`
- `getCardTemplateVersionSheetPreviewPdf()`
- `getCardTemplateVersionCardPreviewHtml()`
- `getMemberLicenseCardPreview()`
- `createPrintJob()`, `executePrintJob()`, `retryPrintJob()`, `cancelPrintJob()`, `downloadPrintJobPdf()`
