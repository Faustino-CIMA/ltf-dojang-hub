# Spacing consistency

Audit only, after the dense size scale on `cursor/theme-restyle-b3ce`. No component or theme code was changed. Counts are class hits in non-test `frontend/src` `.tsx` files.

## Summary

Page stacks are consistent. Everything inside them is not.

The size pass turned page roots from `space-y-6` (24px) into `space-y-3` (12px), and shared panels into `p-3`. The next step down was never given one gap. The same job — space between sibling controls, cards, or fields — uses three steps:

| Step | px | What uses it |
| --- | ---: | --- |
| Tight | 8 | `gap-2` (307), `space-y-2` (379). Button pairs, label-to-control, pagination. |
| Section | 12 | `gap-3` (225), `space-y-3` (151). Page stacks, `ListToolbarPanel`, many action rows. |
| Loose | 16 | `gap-4` (129), `space-y-4` (65), `p-4` (61), `mt-4` (184). Card grids, copied toolbars, header-to-table. |

A few stacks are still 20px (`space-y-5`, 25 hits) or 24px (`mt-6`, 31 hits). There is no spacing token. Tailwind's default scale is the only source, so similar regions drift by 4px.

`space-y-2` is not a leftover. It is the form rhythm (label, then control, then the next field) and it is the most common stack in the app. Do not fold it into the 12px section gap.

## Proposed spacing scale

Map these onto utilities first. Add the CSS variables only if a later pass should stop repeating the utilities.

| Role | px | Utility | Token |
| --- | ---: | --- | --- |
| Button group, pagination, icon plus label | 8 | `gap-2` | `--space-group: 0.5rem` |
| Label to control, and the next field | 8 | `space-y-2` | `--space-field: 0.5rem` |
| Heading to subtitle | 4 | `mt-1` | `--space-tight: 0.25rem` |
| Section stack, card grid, card-to-card | 12 | `space-y-3` / `gap-3` | `--space-section: 0.75rem` |
| Card padding, toolbar padding | 12 | `p-3` | `--panel-padding: 0.75rem` |
| Header to body inside a card, toolbar to table | 12 | `mt-3` or the parent `space-y-3` | `--space-section` |

Page padding stays `--page-padding-x` 1rem and `--page-padding-y` 0.75rem.

## Inconsistencies

Severity is how visible the mismatch is on a desk screen, not how many lines share it.

| File:line | Current classes | Expected role | Severity |
| --- | --- | --- | --- |
| `frontend/src/components/ui/list-page-chrome.tsx:46` | Toolbar `gap-3` `p-3`; filter rule `pt-4` at `:61` | Shared list toolbar. Filter top padding is 16px inside a 12px bar. | high |
| `frontend/src/components/ui/list-page-chrome.tsx:80` | Actions row `gap-4`; inner actions `gap-3` at `:81`; pagination `gap-2` at `:107` | One action bar uses 16px, 12px, and 8px. | high |
| `frontend/src/app/[locale]/dashboard/club/members/page.tsx:745` | Page `space-y-3`, then toolbar `gap-4` `p-4` at `:747`, then actions `gap-4` at `:822` wrapping inner `gap-3` | Same list chrome as `ListToolbarPanel`, one step looser, then a second step before the table. | high |
| `frontend/src/app/[locale]/dashboard/club/invoices/page.tsx:375` | Toolbar `gap-4` `p-4`; actions `gap-4` at `:422` | Same copied toolbar. | high |
| `frontend/src/app/[locale]/dashboard/club/orders/page.tsx:239` | Toolbar `gap-4` `p-4`; actions `gap-4` at `:292` | Same copied toolbar. | high |
| `frontend/src/app/[locale]/dashboard/club/licenses/page.tsx:280` | Toolbar `gap-4` `p-4`; actions `gap-4` at `:322` | Same copied toolbar. | high |
| `frontend/src/app/[locale]/dashboard/club/reports/page.tsx:101` | Filter bar `gap-4` `p-4` | Same bar as the shared toolbar. | medium |
| `frontend/src/app/[locale]/dashboard/ltf-finance/reports/page.tsx:126` | Filter bar `gap-4` `p-4` | Same bar. | medium |
| `frontend/src/app/[locale]/dashboard/club/training/page.tsx:207` | Filter bar `gap-4` `p-4` | Same bar. Also `training/timetable/page.tsx:368` and `promotion/[id]/page.tsx:97`. | medium |
| `frontend/src/components/national-team/national-team-desk.tsx:351` | Page `space-y-3`; tab body `space-y-4` at `:367` and again at `:519`, `:723`, `:981` | Section stack is 12px, the block under the tabs is 16px. | high |
| `frontend/src/app/[locale]/dashboard/ltf/page.tsx:103` | Stat grid `gap-4`, and `md:gap-5` | Card grid is 16px, 20px from the `md` breakpoint. Page stack is 12px. | medium |
| `frontend/src/app/[locale]/dashboard/ltf-finance/page.tsx:215` | Stat and panel grids `gap-4`; lower section `space-y-4` at `:291` | Same 16px grid next to a 12px page stack. | medium |
| `frontend/src/components/member/current-licenses-panel.tsx:89` | Panel `p-3`; subtitle `mt-1`; preview and table `mt-4` at `:93` and `:107` | Header-to-body is 16px inside 12px padding. | high |
| `frontend/src/components/club-admin/team-groups.tsx:164` | Panel `p-3`; title row `gap-2`; hints `mt-1`; table `mt-4` at `:176` | Same card: 8px, 4px, then 16px before the table. | high |
| `frontend/src/components/club-admin/action-queue.tsx:37` | `app-panel` `p-3` `space-y-4` | Card padding 12px, children 16px apart. | medium |
| Form `space-y-5` | 25 hits, including `club/income/new/page.tsx:98`, `club/expenses/new/page.tsx:114`, `ltf-finance/license-settings/new/page.tsx:71`, both delete pages | Field stack is 20px. Neighbouring forms use `space-y-2` (8px) per field. | high |
| `frontend/src/components/import/import-wizard-page.tsx:1396` | `space-y-5` (also `:1530`, `:1611`, `:2070`, `:2138`) | Wizard steps are 20px while the page scale is 12px. | medium |
| `frontend/src/components/ui/modal.tsx:24` | Header `gap-4` | Title-to-close is 16px. Dialog body padding is separate. | low |
| `frontend/src/app/[locale]/dashboard/club/billing/page.tsx:583` | `justify-end gap-2` | Button group at 8px, while licenses/invoices/orders use `gap-4`. | medium |
| `frontend/src/app/[locale]/dashboard/club/subsidies/page.tsx:565` | `justify-end gap-2` (also `:897`, `:941`) | Same 8px button group. | medium |
| `frontend/src/components/home-landing.tsx:154` | `gap-10`, `mt-8` | Marketing page. Out of the desk scale. | low |

`gap-4` on card grids is about 84 of the 129 `gap-4` hits. `space-y-4` is about 60 section stacks, concentrated in the national team desk, finance pages, and the import wizard. `mt-4` (184) is the usual “then the table” offset inside a card.

## Top offenders

1. Copied list toolbars (`p-4` `gap-4`) on members, invoices, orders, and licenses, against `ListToolbarPanel` (`p-3` `gap-3`).
2. `ListActionsRow` itself: `gap-4` around `gap-3` actions and `gap-2` pagination.
3. National team tab bodies at `space-y-4` under a `space-y-3` page.
4. Card header-to-body `mt-4` inside `p-3` panels (current licenses, team groups, and the same pattern elsewhere).
5. Finance and income/expense forms at `space-y-5`.
6. Dashboard stat grids at `gap-4` / `md:gap-5`.

## Is a one-pass fix safe?

Not as one replace, and not in this audit.

Leave `space-y-2` and `gap-2` alone. They are the field and button-group step. Collapsing them into 12px would redesign forms.

Safe as a small follow-up, because each hit is the same role:

- The copied toolbars listed above: `p-4` and `gap-4` become `p-3` and `gap-3`, matching `ListToolbarPanel`.
- `space-y-5` on those forms becomes `space-y-3`.
- The five `justify-end gap-4` action rows become `gap-2`.

Unsafe as a blind replace:

- Every `gap-4`, `p-4`, or `mt-4`. `p-4` also pads the license-card designer, banners, and dropzones. `mt-4` is used for more than one role. `gap-4` on a stat grid is the right idea (make it `gap-3`) but it should be a reviewed pass, not a side effect of the toolbar fix.

Recommendation: do not apply fixes in this change. The page stack is already even. The visible leftovers are the 16px toolbars and the 20px forms. Those two groups are safe to apply next; the rest of the 16px grid and card-body offsets should be a separate pass that does not touch `gap-2` or `space-y-2`.

## Screenshots

1440×900, deviceScaleFactor 2, clipped.

| File | What it shows |
| --- | --- |
| `/opt/cursor/artifacts/spacing_members_toolbar.png` | Club members. Custom toolbar is `p-4` / `gap-4` inside a `space-y-3` page. |
| `/opt/cursor/artifacts/spacing_ltf_members_toolbar.png` | LTF members. Shared `ListToolbarPanel` at `p-3` / `gap-3`. |
| `/opt/cursor/artifacts/spacing_national_stack.png` | National team. Tabs, then a `space-y-4` filter block, then the table. |
| `/opt/cursor/artifacts/spacing_login_form.png` | Login. `space-y-3` form and `space-y-2` fields, which matches the proposed scale. |
