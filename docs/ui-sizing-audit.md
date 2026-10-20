# UI sizing audit

## Applied

The scale below is now in the app. Accent color, light/dark behavior, and the existing radius, type, and page-padding tokens are unchanged. Dialog and short-form `max-w-*` widths were left in place.

- `--control-height-sm: 28px` in `frontend/src/themes/ltf_theme.css`. Button `sm` uses it. Button `lg` and `icon-lg` match the 32px default. `py-2` was removed from the default button so the fixed height holds. License settings no longer passes `size="lg"`.
- The coarse-pointer block that raised controls to 40px and rows to 44px was removed. Mouse and touch share the dense tokens.
- Badges are 20px (`h-5`), `px-1.5`, `text-xs` (the `--text-meta` alias; the `.text-meta` class also forces muted color, so badges do not use it), and `--radius-chip`. Tab counts, the sidebar count, and the designer slot chip are chips, not pills. Calendar days, chart tracks, and blur orbs stay circles.
- `dataThClass` / `dataTdClass` and copied `th`/`td` padding are `px-[var(--control-padding-x)] py-1` (10px × 4px). History and current-license tables use `app-data-table`.
- `FormPanel` and the copied card/panel `p-6` / `p-5` / auth `p-8` / `p-10` padding are `p-3`. Section stacks `space-y-6` are `space-y-3`. Desk `gap-6` is `gap-3`. Side-panel and section bars use `px-3 py-2`. Page padding stays `--page-padding-x` 1rem and `--page-padding-y` 0.75rem.
- Underline tabs are `--control-height` with 16px icons.
- The switch track is 20×36px inside a 32px row.
- Menu rows, the select `sm` trigger, the student picker, the history checkbox hit area, and `.designer-tool` use the control-height tokens. `.designer-tool` type is `--text-meta`.
- Login uses `text-display`, a `p-3` card, and a content-sized submit. The order-licenses action row is in normal flow, not a sticky bottom bar.

The tables under this section are the original findings. They are not a remaining-work list.

Spacing between those sizes is reviewed in `docs/ui-spacing-consistency.md`. Page stacks are 12px. Button groups, card grids, and toolbars still mix 8px, 12px, and 16px.

Audit of the pre-change tree. Branch `cursor/theme-restyle-b3ce`.

Scope: `frontend/src` components, pages, shadcn primitives (`components/ui`), `frontend/src/app/globals.css`, and `frontend/src/themes/ltf_theme.css`. There is no `tailwind.config` file. Tailwind 4 reads the `@theme` block in `globals.css`.

Counts are pattern hits in non-test `.tsx` and `.css` files. One hit is one line, not one component. Arbitrary values that already call a token (`min-h-[var(--control-height)]`, `px-[var(--page-padding-x)]`) are not leftovers.

`text-sm`, `text-base`, `text-lg`, `text-xl`, `text-2xl`, and `text-3xl` are already remapped in `globals.css` (`--text-sm` and `--text-base` both point at `--text-body` 0.8125rem; `--text-lg` at `--text-section`; `--text-xl` at `--text-title`; `--text-2xl` and `--text-3xl` at `--text-display`). Those class names are not treated as oversized. `text-4xl`, `text-5xl`, `text-[10px]`, and `text-[11px]` are not on that scale.

## Summary

| Category | Hits | Files | What stands out |
| --- | ---: | ---: | --- |
| Buttons and touch heights | 24 | 16 | 40–48px controls next to a 32px token. `sm` and `default` are the same height. |
| Badges and pills | 12 | 9 | `rounded-full` chips and a looser status badge than the 5px radius scale. |
| Loose padding, gaps, row cells | 174 | 90 | `space-y-6` ×79, `p-6` ×22, `p-5` ×12, `p-8` ×2, `p-10` ×6, `px-4 py-3` ×45, `gap-6` ×8. |
| Mobile-first leftovers | 8 desk-visible plus chrome | 6 | Coarse-pointer token bump, sticky bottom bar, `sm:` stacking, hamburger and a fixed bar that only appear below `lg`. |
| Hard-coded sizes and narrow containers | 79 `max-w-*` | 57 | Most `max-w-*` are dialogs and forms and should stay. The bypasses are `text-4xl`, `10px`/`11px` type, and `min-h-[2.75rem]`. |

The shell, entity tables (`.app-data-table`), radii, and shadows already follow the dense tokens. Primitives and many panels still use a 40–48px touch scale and 24px card padding.

### Top 10

1. `frontend/src/components/ui/underline-tabs.tsx:86` — tab height `h-12` (48px), `size-5` icons, `rounded-full` count pills. Used on the member page, national team, club settings, and license settings.
2. `space-y-6` page stacks — 79 hits. The member page (`members/[id]/page.tsx:473`) and national desk (`national-team-desk.tsx:351`) are the obvious ones. Club printing/training, LTF admin, and LTF finance layouts wrap every child the same way.
3. `FormPanel` is `app-panel p-6` (`list-page-chrome.tsx:343`), and 21 other panels copy `p-6` (member teams, height and weight, current licenses, team groups).
4. `frontend/src/components/ui/switch.tsx:29` — track `h-11 min-h-11 w-[3.5rem]` (44px). The file comment says it is a touch target.
5. `frontend/src/themes/ltf_theme.css:158` — `@media (pointer: coarse)` raises `--control-height` to 40px and `--table-row-height` to 44px, which undoes the desktop scale on any coarse pointer.
6. `frontend/src/components/ui/button.tsx:29` — `sm` and `default` are both `--control-height`. `lg` is `h-10` (40px). License settings calls `size="lg"` (`license-settings/page.tsx:1029`). `icon-lg` is `size-10`.
7. Menu rows at `min-h-10` (40px) in `popover-select.tsx`, `action-menu.tsx`, `club-teams-desk.tsx`, and `team-groups.tsx`. `row-action-menu.tsx` already uses `--control-height`.
8. `dataThClass` / `dataTdClass` are `px-4 py-3` (`list-page-chrome.tsx:364`). History, current licenses, and the subsidies tables copy the same padding, so those rows are taller than `--table-row-height` (36px).
9. 44px hit targets outside the button primitive: history checkbox wrapper `min-h-11 min-w-11`, student picker rows `min-h-11`, designer tools `min-height: 44px` plus `font-size: 10px`.
10. Login card `p-8`, full-width submit, and a `text-4xl` brand heading (`(auth)/login/page.tsx`). Order-licenses keeps a `sticky bottom-4` action bar on the desktop viewport (`order-licenses/page.tsx:943`).

## Proposed standard size scale

Proposal only. Nothing below is implemented.

| Role | Value | Token |
| --- | --- | --- |
| Button `sm` | 28px | New `--control-height-sm` (or `h-7` until that token exists) |
| Button default | 32px | Existing `--control-height` |
| Button `lg` | Remove, or set equal to default | Do not keep a 40px step |
| Icon button | 32px | `size-[var(--control-height)]` |
| Badge | 20px tall, padding 2px 6px | Height utility plus `px-1.5 py-0`, font `--text-meta`, radius `--radius-chip` |
| Table row | 36px | Existing `--table-row-height` |
| Table cell padding | 4px 10px | `0.25rem var(--control-padding-x)`, the `.app-data-table` rule |
| Card and panel padding | 12px | `p-3`. New `--panel-padding: 0.75rem` if panels should not repeat the utility |
| Page and section gap | 12px | `gap-3` / `space-y-3`. New `--page-gap: 0.75rem` |
| Page padding | Keep 16px × 12px | Existing `--page-padding-x` 1rem, `--page-padding-y` 0.75rem |
| Input | 32px, body type | `min-h-[var(--control-height)]`, font `--text-body`. Drop extra `py-2` and `md:text-sm` |

Desktop must not use 40px, 44px, or 48px controls. The coarse-pointer media query should not rewrite the desktop tokens.

## 1. Buttons and touch heights

| File:line | Current value | Why suspicious | Proposed token / value | Severity |
| --- | --- | --- | --- | --- |
| `frontend/src/components/ui/button.tsx:27` | `default`: height `--control-height` and `py-2` | Vertical padding fights the fixed 32px height. | Height only: `h-[var(--control-height)]`, horizontal padding `--control-padding-x` | medium |
| `frontend/src/components/ui/button.tsx:29` | `sm` is the same height as `default` | No compact step, so dense toolbars cannot get smaller. | `--control-height-sm` 28px | high |
| `frontend/src/components/ui/button.tsx:30` | `lg`: `h-10 min-h-10` (40px) | Larger than the control token. | Drop `lg`, or map it to `--control-height` | high |
| `frontend/src/components/ui/button.tsx:34` | `icon-lg`: `size-10` (40px) | Same 40px step as `lg`. | `size-[var(--control-height)]` | medium |
| `frontend/src/components/ui/switch.tsx:19` | Wrapper `min-h-11` (44px) | Touch target around a desk control. | Align the row to `--control-height` | high |
| `frontend/src/components/ui/switch.tsx:29` | Track `h-11 min-h-11 w-[3.5rem]`; thumb `h-8 w-8` | Comment in the file says ~44px touch height. Hard-coded width. | Track height 20px, width ~36px, on the 5px radius | high |
| `frontend/src/components/ui/underline-tabs.tsx:86` | Tab `h-12` and `px-4` | 48px tabs on member, national team, settings, license settings. | `h-[var(--control-height)]` (32px), `px-3` | high |
| `frontend/src/components/ui/underline-tabs.tsx:92` | Tab icon `size-5` (20px) | Icon is larger than the 16px sidebar icon token. | `size-4` (`--sidebar-item-icon-size` is 1rem) | medium |
| `frontend/src/components/ui/popover-select.tsx:20` | Option `min-h-10` | 40px menu row. `row-action-menu` is already 32px. | `min-h-[var(--control-height)]` | high |
| `frontend/src/components/ui/popover-select.tsx:135` | Search field `min-h-10` | Taller than the input primitive. | `min-h-[var(--control-height)]` | high |
| `frontend/src/components/ui/action-menu.tsx:44` | Item `min-h-10` | Same 40px menu row. | `min-h-[var(--control-height)]` | high |
| `frontend/src/components/ui/select.tsx:40` | `data-[size=sm]:min-h-10` | The `sm` trigger is 40px, taller than the default trigger. | `sm` should be `--control-height-sm` (28px), never above default | high |
| `frontend/src/components/club-admin/club-teams-desk.tsx:79` | Menu row `min-h-10` | Duplicates the 40px menu row instead of the shared menu item. | `min-h-[var(--control-height)]` | medium |
| `frontend/src/components/club-admin/team-groups.tsx:99` | Menu row `min-h-10` | Same duplicate. | `min-h-[var(--control-height)]` | medium |
| `frontend/src/components/club-admin/student-multi-picker.tsx:106` | Label `min-h-11` | 44px row. | `min-h-[var(--control-height)]` | medium |
| `frontend/src/components/club-admin/student-multi-picker.tsx:120` | Option `min-h-11` plus `py-2` | 44px row with extra padding. | `min-h-[var(--control-height)]`, drop `py-2` | medium |
| `frontend/src/components/history/member-history-timeline.tsx:504` | Checkbox hit area `min-h-11 min-w-11` | 44×44px wrapper in a 36px table. | Hit area `--control-height` (32px). Keep the checkbox glyph at 16px | high |
| `frontend/src/themes/ltf_theme.css:164` | Coarse pointer: control 40px, row 44px, padding-x 14px | Rewrites the desktop tokens for any coarse pointer, including a desktop with a touch screen. | Leave 32px / 36px in place. Do not bump the shared tokens | high |
| `frontend/src/app/globals.css:336` | `.designer-tool` `min-height: 44px` | Touch-sized tool button, hard-coded. | `min-height: var(--control-height)` | high |
| `frontend/src/app/[locale]/dashboard/ltf-finance/license-settings/page.tsx:1029` | `Button` `size="lg"` | Only `size="lg"` call. Renders at 40px. | Default size | high |
| `frontend/src/components/app-shell.tsx:304` | Sidebar collapse control `size-10` | Visible on every desktop page, 40px next to 32px controls. | `size-[var(--control-height)]` | high |
| `frontend/src/components/app-shell.tsx:344` | Drawer close `size-10` | 40px icon button. Only in the `lg:hidden` drawer. | `size-[var(--control-height)]` | low |
| `frontend/src/components/profile-photo/profile-photo-manager.tsx:716` | Color input `h-10 w-16` | 40px control. | `h-[var(--control-height)]` | medium |
| `frontend/src/app/[locale]/dashboard/club/reports/page.tsx:150` | Textarea `min-h-[2.75rem]` (44px) | Arbitrary height, not a token. | `min-h-[var(--control-height)]` for a single-line field, or a named textarea token | medium |
| `frontend/src/app/[locale]/dashboard/ltf-finance/reports/page.tsx:200` | `min-h-[2.75rem]` | Same 44px arbitrary height. | Same as the club reports field | medium |
| `frontend/src/app/[locale]/dashboard/club/training/sessions/[id]/page.tsx:201` | Attendance toggle `px-4 py-3` | Chip buttons are about 44px tall. | `h-[var(--control-height)] px-3 py-0` | medium |
| `frontend/src/components/ui/input.tsx:11` | `min-h` is correct, plus `py-2` | Extra vertical padding on a fixed-height field. | Drop `py-2`. Keep `min-h-[var(--control-height)]` | medium |

`Button` `size="icon"` already uses `--control-height`. Checkbox glyphs at `h-4 w-4` are fine.

## 2. Badges and pills

`StatusBadge` already uses `--radius-chip` (5px). It is still taller and wider than the proposed 20px chip.

| File:line | Current value | Why suspicious | Proposed token / value | Severity |
| --- | --- | --- | --- | --- |
| `frontend/src/components/ui/status-badge.tsx:17` | `px-2.5 py-0.5 text-xs`, no fixed height | About 22–24px tall and wider than sibling chips. `text-xs` is `--text-meta`, which is fine. | Height 20px, `px-1.5 py-0`, `--text-meta`, `--radius-chip` | medium |
| `frontend/src/components/ui/underline-tabs.tsx:97` | Count `rounded-full min-w-6 px-2 py-0.5 text-xs` | Pill radius next to 5px controls. | `--radius-chip`, `px-1.5 py-0`, `--text-meta` | high |
| `frontend/src/components/app-shell.tsx:285` | Nav count `rounded-full text-[10px] min-h-4` | Pill, and 10px type is off the type scale. | `--radius-chip`, `--text-meta` | medium |
| `frontend/src/app/[locale]/dashboard/ltf/license-cards/[id]/designer/page.tsx:4863` | Slot chip `rounded-full px-2 py-0.5 text-[11px]` | Pill and an off-scale font size. | `--radius-chip`, `--text-meta` | medium |
| `frontend/src/app/[locale]/dashboard/ltf-finance/license-settings/page.tsx:1108` | Chip `px-2 py-0.5 text-[10px]` | Radius is already `--radius-chip`. Type is 10px. | `--text-meta` | medium |
| `frontend/src/app/[locale]/dashboard/club/members/order-licenses/page.tsx:631` | Success mark `size-12 rounded-full` | 48px circle. | `size-8` on `--radius-chip`, or keep a circle only if it is an avatar-style mark | medium |
| `frontend/src/components/club-admin/training-calendar.tsx:196` | Day number `size-7 rounded-full` | Calendar day, not a badge. | Leave the circle | low |
| `frontend/src/components/events/event-calendar-page.tsx:254` | Day number `size-7 rounded-full` | Same calendar mark. | Leave the circle | low |
| `frontend/src/components/club-admin/stat-breakdown.tsx:32` | Bar track `h-1.5 rounded-full` | Chart track, not a badge. | Leave | low |
| `frontend/src/components/club-admin/action-queue.tsx:52` | Severity tick `h-10 w-1 rounded-full` | 1px-wide decorative bar. The `h-10` makes the row tall. | Bar height follows the row, about 16px | low |
| `frontend/src/app/[locale]/(auth)/login/page.tsx:77` | `size-72` / `size-64` `rounded-full` blur | Decorative orbs, not controls. | Leave | low |
| `frontend/src/app/[locale]/dashboard/ltf/license-cards/[id]/designer/page.tsx:5384` | Resize handle `rounded-full` | Circular handle, not a badge. | Leave | low |

## 3. Padding, margins, and gaps

Shared sources first. The panels and page stacks below repeat them.

| File:line | Current value | Why suspicious | Proposed token / value | Severity |
| --- | --- | --- | --- | --- |
| `frontend/src/components/ui/list-page-chrome.tsx:343` | `FormPanel`: `app-panel p-6` (24px) | Every form panel is twice the proposed card padding. | `p-3` (`--panel-padding` 0.75rem) | high |
| `frontend/src/components/ui/list-page-chrome.tsx:364` | `dataThClass` `px-4 py-3` | Utilities beat `.app-data-table`, so rows grow past 36px. | `px-[var(--control-padding-x)] py-1`, and prefer `app-data-table` | high |
| `frontend/src/components/ui/list-page-chrome.tsx:365` | `dataTdClass` `px-4 py-3` | Same cell padding. Subsidies tables consume both classes. | Same as the header class | high |
| `frontend/src/components/ui/list-page-chrome.tsx:366` | `dataRowClass` sets `--table-row-height` | Conflicts with `py-3` on the cells. The padding wins. | Keep the row height, drop the cell `py-3` | high |
| `frontend/src/components/ui/side-panel.tsx:37` | Header `px-4 py-3` | Looser than a 12px panel. | `px-3 py-2` | medium |
| `frontend/src/components/ui/side-panel.tsx:48` | Body `px-4 py-3` | Same. | `px-3 py-2` | medium |
| `frontend/src/components/ui/side-panel.tsx:51` | Footer `px-4 py-3` | Same. | `px-3 py-2` | medium |
| `frontend/src/app/[locale]/dashboard/club/members/[id]/page.tsx:473` | `space-y-6` | Member page stack under the 48px tabs. | `space-y-3` | high |
| `frontend/src/components/national-team/national-team-desk.tsx:351` | `space-y-6` | National team page stack. | `space-y-3` | high |
| `frontend/src/components/national-team/national-team-desk.tsx:632` | `space-y-6` | Nested national section. | `space-y-3` | medium |
| `frontend/src/components/club-admin/club-admin-layout.tsx:311` | `space-y-6` | Wraps every printing and training page. | `space-y-3` | high |
| `frontend/src/components/ltf-admin/ltf-admin-layout.tsx:183` | `space-y-6` | Wraps LTF admin pages. | `space-y-3` | high |
| `frontend/src/components/ltf-finance/ltf-finance-layout.tsx:143` | `space-y-6` | Wraps LTF finance pages. | `space-y-3` | high |
| `frontend/src/components/member/current-licenses-panel.tsx:89` | `app-panel p-6` | Member licenses card. | `p-3` | high |
| `frontend/src/components/member/current-licenses-panel.tsx:111` | Header cells `px-4 py-3` | Table is not `app-data-table`. Row class sets 36px and `py-3` overrides it (`:119`). | `app-data-table` and the compact cell padding | high |
| `frontend/src/components/history/member-history-timeline.tsx:192` | `table` without `app-data-table` | Misses the compact cell rule. | Add `app-data-table` | high |
| `frontend/src/components/history/member-history-timeline.tsx:196` | `th` `px-4 py-3` | Loose header. | Compact cell padding | high |
| `frontend/src/components/history/member-history-timeline.tsx:673` | Cells `px-4 py-0` plus a 36px row height | Horizontal padding is still 16px, not `--control-padding-x` (10px). | `px-[var(--control-padding-x)]` | medium |
| `frontend/src/components/club-admin/team-groups.tsx:164` | `app-panel p-6` | Poomsae group card. | `p-3` | high |
| `frontend/src/components/club-admin/member-teams-card.tsx:44` | `app-panel p-6` | Member teams card. | `p-3` | high |
| `frontend/src/components/club-admin/height-weight-section.tsx:314` | `app-panel p-6` when not embedded | Height and weight card. | `p-3` | high |
| `frontend/src/components/club-admin/action-queue.tsx:37` | `p-6` | Dashboard queue card. | `p-3` | medium |
| `frontend/src/components/club-admin/stat-breakdown.tsx:23` | `app-panel p-5` | 20px, between `p-3` and `p-6`. | `p-3` so panels match | medium |
| `frontend/src/components/club-admin/summary-card.tsx:41` | `p-5` | Same mismatch. | `p-3` | medium |
| `frontend/src/app/[locale]/(auth)/login/page.tsx:93` | Panel `p-8` (32px) | Densest mismatch on the login screen. | `p-3` or `p-4` | high |
| `frontend/src/app/[locale]/(auth)/login/page.tsx:101` | Form `mt-8 space-y-5` | 32px before the fields, 20px between them. | `mt-4 space-y-3` | medium |
| `frontend/src/app/[locale]/dashboard/page.tsx:57` | Role card `p-10` (40px) and `max-w-xl` | Largest panel padding in the app. | `p-3`, let the card use the viewport width it needs | high |
| `frontend/src/app/[locale]/dashboard/page.tsx:71` | Inner block `p-6` | Nested inside the `p-10` card. | `p-3` | medium |

### Other `p-6` panels (24px → `p-3`)

| File:line | Current value | Why suspicious | Proposed token / value | Severity |
| --- | --- | --- | --- | --- |
| `frontend/src/app/[locale]/dashboard/ops/audit/[id]/page.tsx:52` | `p-6` | Desk panel padding. | `p-3` | medium |
| `frontend/src/app/[locale]/dashboard/club/invoices/[id]/page.tsx:290` | `p-6` | Desk panel padding. | `p-3` | medium |
| `frontend/src/app/[locale]/dashboard/club/settings/page.tsx:375` | `p-6` | Desk panel padding. | `p-3` | medium |
| `frontend/src/app/[locale]/dashboard/club/orders/[id]/page.tsx:139` | `p-6` | Desk panel padding. | `p-3` | medium |
| `frontend/src/app/[locale]/dashboard/club/members/new/page.tsx:233` | `p-6` | Desk panel padding. | `p-3` | medium |
| `frontend/src/components/club-admin/club-module-prices.tsx:33` | `p-6` | Desk panel padding. | `p-3` | medium |
| `frontend/src/components/club-admin/club-trainers-panel.tsx:232` | `p-6` | Desk panel padding. | `p-3` | medium |
| `frontend/src/components/club-admin/payconiq-payment-card.tsx:79` | `p-6` | Desk panel padding. | `p-3` | medium |
| `frontend/src/components/import/import-wizard-page.tsx:1358` | `p-6` | Wizard panel. | `p-3` | medium |
| `frontend/src/components/import/import-wizard-page.tsx:1394` | `p-6` | Wizard panel. | `p-3` | medium |
| `frontend/src/components/clubmgmt/publication-consent-panel.tsx:160` | `p-6` | Desk panel padding. | `p-3` | medium |
| `frontend/src/components/branding/branding-logos-manager.tsx:338` | `p-6` | Desk panel padding. | `p-3` | medium |
| `frontend/src/components/profile-photo/profile-photo-manager.tsx:773` | `p-6` | Desk panel padding. | `p-3` | medium |
| `frontend/src/components/profile-photo/profile-photo-manager.tsx:776` | `p-6` | Desk panel padding. | `p-3` | medium |
| `frontend/src/components/home-landing.tsx:168` | `p-6` | Marketing card. | `p-3` if marketing joins the desk scale | low |

### Other `p-5` (20px → `p-3`)

| File:line | Current value | Why suspicious | Proposed token / value | Severity |
| --- | --- | --- | --- | --- |
| `frontend/src/app/[locale]/dashboard/ltf-finance/license-settings/page.tsx:991` | `p-5` | Sits beside `p-6` form panels. | `p-3` | medium |
| `frontend/src/app/[locale]/dashboard/ltf-finance/license-settings/page.tsx:999` | `p-5` | Same page, different padding. | `p-3` | medium |
| `frontend/src/app/[locale]/dashboard/ltf-finance/license-settings/page.tsx:1009` | `p-5` | Same page, different padding. | `p-3` | medium |
| `frontend/src/app/[locale]/dashboard/ops/translations/page.tsx:239` | `p-5` | Desk panel. | `p-3` | medium |
| `frontend/src/app/[locale]/dashboard/ops/translations/page.tsx:301` | `p-5` | Desk panel. | `p-3` | medium |
| `frontend/src/app/[locale]/dashboard/ops/translations/page.tsx:314` | `p-5` | Desk panel. | `p-3` | medium |
| `frontend/src/app/[locale]/dashboard/club/members/[id]/delete/page.tsx:169` | `p-5` | Confirm panel. | `p-3` | low |
| `frontend/src/app/[locale]/dashboard/ltf/licenses/[id]/delete/page.tsx:135` | `p-5` | Confirm panel. | `p-3` | low |
| `frontend/src/components/import/import-wizard-page.tsx:2221` | `p-5` | Wizard panel. | `p-3` | medium |
| `frontend/src/components/profile-photo/profile-photo-manager.tsx:611` | `p-5` | Photo panel. | `p-3` | medium |

### Other `p-8` and `p-10`

| File:line | Current value | Why suspicious | Proposed token / value | Severity |
| --- | --- | --- | --- | --- |
| `frontend/src/app/[locale]/verify-email/page.tsx:94` | `p-8` and `max-w-md` | Auth card, same weight as login. | `p-4` | medium |
| `frontend/src/app/[locale]/settings/privacy/page.tsx:85` | `p-10 max-w-3xl` | 40px padding and a 48rem column. | `p-3`, drop the page `max-w` | medium |
| `frontend/src/app/not-found.tsx:4` | `p-10 max-w-xl` | Marketing-style empty state. | `p-4` | low |
| `frontend/src/app/[locale]/checkout/cancel/page.tsx:14` | `p-10 max-w-xl` | Checkout result card. | `p-4` | low |
| `frontend/src/app/[locale]/checkout/success/page.tsx:158` | `p-10 max-w-xl` | Checkout result card. | `p-4` | low |
| `frontend/src/app/[locale]/checkout/success/page.tsx:188` | `p-10 max-w-xl` | Checkout result card. | `p-4` | low |

### Loose table and banner cells (`px-4 py-3`)

Banners can stay a step looser than table rows. Table cells should use the `.app-data-table` padding.

| File:line | Current value | Why suspicious | Proposed token / value | Severity |
| --- | --- | --- | --- | --- |
| `frontend/src/app/[locale]/dashboard/club/subsidies/page.tsx:607` | `td` `px-4 py-3` (also 613, 632, 645, 664, 734–739, 760–762, 920–921, 939–940) | Hand-copied cell padding. Also uses `dataTdClass`. | `app-data-table` | high |
| `frontend/src/app/[locale]/dashboard/ltf-finance/license-settings/page.tsx:687` | Section header `px-4 py-3` (also 839, 1171, 1278) | 12px vertical padding on section bars. | `px-3 py-2` | medium |
| `frontend/src/app/[locale]/dashboard/ops/translations/page.tsx:335` | Sticky header `px-4 py-3` | Desk table header. | Compact cell padding | medium |
| `frontend/src/app/[locale]/dashboard/ops/translations/page.tsx:353` | Row `px-4 py-3` | Desk table row. | Compact cell padding | medium |
| `frontend/src/app/[locale]/dashboard/club/admins/page.tsx:550` | Row `px-4 py-3` | Card row, not a data cell, still 12px tall padding. | `px-3 py-2` | medium |
| `frontend/src/components/clubmgmt/membership-fee-panel.tsx:282` | Header `px-4 py-3` | Section bar. | `px-3 py-2` | medium |
| `frontend/src/app/[locale]/dashboard/ltf/page.tsx:92` | Toolbar strip `px-4 py-3` | Banner, not a table. | `px-3 py-2` | low |
| `frontend/src/app/[locale]/dashboard/ltf-finance/page.tsx:200` | Toolbar strip `px-4 py-3` | Banner. | `px-3 py-2` | low |
| `frontend/src/app/[locale]/dashboard/club/members/page.tsx:805` | Banner `px-4 py-3` | Notice, not a row. | `px-3 py-2` | low |
| `frontend/src/app/[locale]/dashboard/club/invoices/page.tsx:361` | Banner `px-4 py-3` | Notice. | `px-3 py-2` | low |
| `frontend/src/app/[locale]/dashboard/ltf/members/page.tsx:392` | Banner `px-4 py-3` | Notice. | `px-3 py-2` | low |
| `frontend/src/app/[locale]/dashboard/ltf/clubs/page.tsx:174` | Banner `px-4 py-3` | Notice. | `px-3 py-2` | low |
| `frontend/src/components/ui/list-page-chrome.tsx:199` | Notice `px-4 py-3` | Shared banner. | `px-3 py-2` | low |
| `frontend/src/components/ui/list-page-chrome.tsx:272` | Toast `px-4 py-3` | Shared toast. | `px-3 py-2` | low |

### `gap-6` (24px → `gap-3`)

| File:line | Current value | Why suspicious | Proposed token / value | Severity |
| --- | --- | --- | --- | --- |
| `frontend/src/app/[locale]/reset-password/page.tsx:60` | `gap-6` | Auth stack. | `gap-3` | low |
| `frontend/src/app/[locale]/dashboard/ltf-finance/reports/page.tsx:213` | `gap-6` | Desk grid gap. | `gap-3` | medium |
| `frontend/src/app/[locale]/dashboard/ltf-finance/reports/page.tsx:321` | `gap-6` | Desk grid gap. | `gap-3` | medium |
| `frontend/src/app/[locale]/dashboard/ops/queries/page.tsx:93` | `gap-6` | Desk grid gap. | `gap-3` | medium |
| `frontend/src/app/[locale]/dashboard/club/reports/page.tsx:156` | `gap-6` | Desk grid gap. | `gap-3` | medium |
| `frontend/src/app/[locale]/dashboard/club/shop/items/[id]/page.tsx:493` | `gap-6` | Item editor grid. | `gap-3` | medium |
| `frontend/src/app/[locale]/dashboard/club/shop/sell/page.tsx:253` | `gap-6` | Sell desk grid. | `gap-3` | medium |
| `frontend/src/app/[locale]/dashboard/club/training/holidays/page.tsx:92` | `gap-6` | Desk grid gap. | `gap-3` | medium |

### Every `space-y-6` (24px → `space-y-3`)

79 hits, 70 files. Severity is high on the three layouts and on the member and national roots listed above. The rest are medium: each is a page or section root with the same 24px stack.

| File:line | Current value | Why suspicious | Proposed token / value | Severity |
| --- | --- | --- | --- | --- |
| `frontend/src/app/[locale]/about/page.tsx:55` | `space-y-6` | 24px stack. | `space-y-3` | low |
| `frontend/src/app/[locale]/dashboard/member/page.tsx:88` | `space-y-6` | 24px stack. | `space-y-3` | medium |
| `frontend/src/app/[locale]/dashboard/member/photo/page.tsx:56` | `space-y-6` | 24px stack. | `space-y-3` | medium |
| `frontend/src/app/[locale]/dashboard/ltf-finance/license-settings/page.tsx:579` | `space-y-6` | 24px stack. | `space-y-3` | medium |
| `frontend/src/app/[locale]/dashboard/ltf-finance/license-settings/page.tsx:761` | `space-y-6` | 24px stack. | `space-y-3` | medium |
| `frontend/src/app/[locale]/dashboard/ltf-finance/license-settings/page.tsx:989` | `space-y-6` | 24px stack. | `space-y-3` | medium |
| `frontend/src/app/[locale]/dashboard/club/page.tsx:377` | `space-y-6` | 24px stack. | `space-y-3` | medium |
| `frontend/src/app/[locale]/dashboard/club/reports/page.tsx:98` | `space-y-6` | 24px stack. | `space-y-3` | medium |
| `frontend/src/app/[locale]/dashboard/club/shop/sales/page.tsx:48` | `space-y-6` | 24px stack. | `space-y-3` | medium |
| `frontend/src/app/[locale]/dashboard/club/shop/snapshots/page.tsx:50` | `space-y-6` | 24px stack. | `space-y-3` | medium |
| `frontend/src/app/[locale]/dashboard/club/shop/items/page.tsx:67` | `space-y-6` | 24px stack. | `space-y-3` | medium |
| `frontend/src/app/[locale]/dashboard/club/shop/items/[id]/page.tsx:414` | `space-y-6` | 24px stack. | `space-y-3` | medium |
| `frontend/src/app/[locale]/dashboard/club/shop/items/[id]/page.tsx:492` | `space-y-6` | 24px stack. | `space-y-3` | medium |
| `frontend/src/app/[locale]/dashboard/club/shop/items/[id]/page.tsx:514` | `space-y-6` | 24px stack. | `space-y-3` | medium |
| `frontend/src/app/[locale]/dashboard/club/shop/sell/page.tsx:227` | `space-y-6` | 24px stack. | `space-y-3` | medium |
| `frontend/src/app/[locale]/dashboard/club/families/page.tsx:139` | `space-y-6` | 24px stack. | `space-y-3` | medium |
| `frontend/src/app/[locale]/dashboard/club/fees/page.tsx:21` | `space-y-6` | 24px stack. | `space-y-3` | medium |
| `frontend/src/app/[locale]/dashboard/club/billing/page.tsx:288` | `space-y-6` | 24px stack. | `space-y-3` | medium |
| `frontend/src/app/[locale]/dashboard/club/subsidies/page.tsx:345` | `space-y-6` | 24px stack. | `space-y-3` | medium |
| `frontend/src/app/[locale]/dashboard/club/subsidies/page.tsx:787` | `space-y-6` | 24px stack. | `space-y-3` | medium |
| `frontend/src/app/[locale]/dashboard/club/admins/page.tsx:371` | `space-y-6` | 24px stack. | `space-y-3` | medium |
| `frontend/src/app/[locale]/dashboard/club/promotion/page.tsx:137` | `space-y-6` | 24px stack. | `space-y-3` | medium |
| `frontend/src/app/[locale]/dashboard/club/licenses/page.tsx:278` | `space-y-6` | 24px stack. | `space-y-3` | medium |
| `frontend/src/app/[locale]/dashboard/club/training/page.tsx:139` | `space-y-6` | 24px stack. | `space-y-3` | medium |
| `frontend/src/app/[locale]/dashboard/club/training/timetable/page.tsx:214` | `space-y-6` | 24px stack. | `space-y-3` | medium |
| `frontend/src/app/[locale]/dashboard/club/training/hours/page.tsx:286` | `space-y-6` | 24px stack. | `space-y-3` | medium |
| `frontend/src/app/[locale]/dashboard/club/training/holidays/page.tsx:83` | `space-y-6` | 24px stack. | `space-y-3` | medium |
| `frontend/src/app/[locale]/dashboard/club/training/sessions/[id]/page.tsx:122` | `space-y-6` | 24px stack. | `space-y-3` | medium |
| `frontend/src/app/[locale]/dashboard/club/income/page.tsx:103` | `space-y-6` | 24px stack. | `space-y-3` | medium |
| `frontend/src/app/[locale]/dashboard/club/income/[id]/page.tsx:179` | `space-y-6` | 24px stack. | `space-y-3` | medium |
| `frontend/src/app/[locale]/dashboard/club/income/new/page.tsx:91` | `space-y-6` | 24px stack. | `space-y-3` | medium |
| `frontend/src/app/[locale]/dashboard/club/invoices/page.tsx:351` | `space-y-6` | 24px stack. | `space-y-3` | medium |
| `frontend/src/app/[locale]/dashboard/club/invoices/[id]/page.tsx:268` | `space-y-6` | 24px stack. | `space-y-3` | medium |
| `frontend/src/app/[locale]/dashboard/club/bank/page.tsx:72` | `space-y-6` | 24px stack. | `space-y-3` | medium |
| `frontend/src/app/[locale]/dashboard/club/bank/[id]/page.tsx:81` | `space-y-6` | 24px stack. | `space-y-3` | medium |
| `frontend/src/app/[locale]/dashboard/club/settings/page.tsx:344` | `space-y-6` | 24px stack. | `space-y-3` | medium |
| `frontend/src/app/[locale]/dashboard/club/transfers/page.tsx:394` | `space-y-6` | 24px stack. | `space-y-3` | medium |
| `frontend/src/app/[locale]/dashboard/club/expenses/page.tsx:96` | `space-y-6` | 24px stack. | `space-y-3` | medium |
| `frontend/src/app/[locale]/dashboard/club/expenses/[id]/page.tsx:206` | `space-y-6` | 24px stack. | `space-y-3` | medium |
| `frontend/src/app/[locale]/dashboard/club/expenses/new/page.tsx:107` | `space-y-6` | 24px stack. | `space-y-3` | medium |
| `frontend/src/app/[locale]/dashboard/club/orders/page.tsx:234` | `space-y-6` | 24px stack. | `space-y-3` | medium |
| `frontend/src/app/[locale]/dashboard/club/orders/[id]/page.tsx:131` | `space-y-6` | 24px stack. | `space-y-3` | medium |
| `frontend/src/app/[locale]/dashboard/club/payments/page.tsx:302` | `space-y-6` | 24px stack. | `space-y-3` | medium |
| `frontend/src/app/[locale]/dashboard/club/payments/[id]/page.tsx:204` | `space-y-6` | 24px stack. | `space-y-3` | medium |
| `frontend/src/app/[locale]/dashboard/club/payments/[id]/record/page.tsx:210` | `space-y-6` | 24px stack. | `space-y-3` | medium |
| `frontend/src/app/[locale]/dashboard/club/payments/[id]/record/page.tsx:223` | `space-y-6` | 24px stack. | `space-y-3` | medium |
| `frontend/src/app/[locale]/dashboard/club/printer-profiles/page.tsx:251` | `space-y-6` | 24px stack. | `space-y-3` | medium |
| `frontend/src/app/[locale]/dashboard/club/members/page.tsx:745` | `space-y-6` | 24px stack. | `space-y-3` | medium |
| `frontend/src/app/[locale]/dashboard/club/members/order-licenses/page.tsx:673` | `space-y-6` | 24px stack. | `space-y-3` | medium |
| `frontend/src/app/[locale]/dashboard/ltf/page.tsx:91` | `space-y-6` | 24px stack. | `space-y-3` | medium |
| `frontend/src/app/[locale]/dashboard/ltf/club-admins/page.tsx:622` | `space-y-6` | 24px stack. | `space-y-3` | medium |
| `frontend/src/app/[locale]/dashboard/ltf/license-types/page.tsx:168` | `space-y-6` | 24px stack. | `space-y-3` | medium |
| `frontend/src/app/[locale]/dashboard/ltf/licenses/page.tsx:494` | `space-y-6` | 24px stack. | `space-y-3` | medium |
| `frontend/src/app/[locale]/dashboard/ltf/license-cards/page.tsx:368` | `space-y-6` | 24px stack. | `space-y-3` | medium |
| `frontend/src/app/[locale]/dashboard/ltf/license-cards/print-jobs/page.tsx:301` | `space-y-6` | 24px stack. | `space-y-3` | medium |
| `frontend/src/app/[locale]/dashboard/ltf/clubs/page.tsx:172` | `space-y-6` | 24px stack. | `space-y-3` | medium |
| `frontend/src/app/[locale]/dashboard/ltf/clubs/[id]/page.tsx:236` | `space-y-6` | 24px stack. | `space-y-3` | medium |
| `frontend/src/app/[locale]/dashboard/ltf/clubs/[id]/page.tsx:250` | `space-y-6` | 24px stack. | `space-y-3` | medium |
| `frontend/src/app/[locale]/dashboard/ltf/clubs/new/page.tsx:84` | `space-y-6` | 24px stack. | `space-y-3` | medium |
| `frontend/src/app/[locale]/dashboard/ltf/settings/page.tsx:252` | `space-y-6` | 24px stack. | `space-y-3` | medium |
| `frontend/src/app/[locale]/dashboard/ltf/printer-profiles/page.tsx:256` | `space-y-6` | 24px stack. | `space-y-3` | medium |
| `frontend/src/app/[locale]/dashboard/ltf/members/page.tsx:390` | `space-y-6` | 24px stack. | `space-y-3` | medium |
| `frontend/src/app/[locale]/dashboard/ltf/members/[id]/page.tsx:245` | `space-y-6` | 24px stack. | `space-y-3` | medium |
| `frontend/src/app/[locale]/dashboard/ltf/members/[id]/page.tsx:264` | `space-y-6` | 24px stack. | `space-y-3` | medium |
| `frontend/src/app/[locale]/dashboard/ltf/member-transfers/page.tsx:60` | `space-y-6` | 24px stack. | `space-y-3` | medium |
| `frontend/src/components/finance/bank-statement-workspace.tsx:100` | `space-y-6` | 24px stack. | `space-y-3` | medium |
| `frontend/src/components/history/member-history-timeline.tsx:632` | `space-y-6` | 24px stack. | `space-y-3` | medium |
| `frontend/src/components/clubmgmt/household-invoice-view.tsx:106` | `space-y-6` | 24px stack. | `space-y-3` | medium |
| `frontend/src/components/clubmgmt/member-club-record-panel.tsx:784` | `space-y-6` | 24px stack. | `space-y-3` | medium |
| `frontend/src/components/clubmgmt/membership-fee-panel.tsx:214` | `space-y-6` | 24px stack. | `space-y-3` | medium |
| `frontend/src/components/clubmgmt/committee-page.tsx:479` | `space-y-6` | 24px stack. | `space-y-3` | medium |
| `frontend/src/components/ltf-finance/module-fees-panel.tsx:150` | `space-y-6` | 24px stack. | `space-y-3` | medium |
| `frontend/src/components/branding/branding-logos-manager.tsx:478` | `space-y-6` | 24px stack. | `space-y-3` | medium |

Member page `:473`, national desk `:351` and `:632`, and the three layouts are listed in the first spacing table so they are not repeated here.

## 4. Mobile-first leftovers

Desktop is the target. Breakpoints that only add a row layout at `sm:` or `md:`, and chrome that exists for a phone, are leftovers. `lg:hidden` pieces are invisible at 1440px; they are listed so they are not mistaken for the desktop look.

| File:line | Current value | Why suspicious | Proposed token / value | Severity |
| --- | --- | --- | --- | --- |
| `frontend/src/themes/ltf_theme.css:158` | `@media (pointer: coarse)` bumps control, row, and padding | See the button table. It is the token-level mobile scale. | Keep 32px / 36px / 10px | high |
| `frontend/src/app/[locale]/dashboard/club/members/order-licenses/page.tsx:943` | `sticky bottom-4` bar, `p-4` | Action bar stays stuck to the bottom of the desktop viewport. | Put the actions in the page header, right side | high |
| `frontend/src/app/[locale]/dashboard/club/shop/items/[id]/page.tsx:872` | `fixed inset-x-0 bottom-0 … lg:hidden` and `Button` `w-full` | Phone save bar. The form also adds `pb-24 lg:pb-0` (`:492`). | Desktop keeps the header action. The bar can stay if a phone layout is still required | medium |
| `frontend/src/components/app-shell.tsx:334` | `fixed inset-0 … lg:hidden` drawer | Off-canvas nav. Desktop sidebar is `hidden … lg:block` (`:325`). | Fine as phone chrome. Do not let it set desktop sizes | low |
| `frontend/src/components/app-shell.tsx:369` | Menu button `size="icon"` `lg:hidden` | Hamburger. Hidden at 1440px. | Leave hidden on desktop | low |
| `frontend/src/app/[locale]/dashboard/club/members/page.tsx:716` | `flex-col … sm:flex-row` | Modal actions stack until 640px. | `flex-row` from the default (desktop) layout | medium |
| `frontend/src/components/ui/input.tsx:11` | `text-base md:text-sm` | Mobile-first type switch. Both classes resolve to `--text-body`, so the size does not change. The pattern is still a leftover. | `text-sm` only | low |
| `frontend/src/components/app-shell.tsx:390` | Club select `min-w-[180px] sm:min-w-[240px]` | Width grows only after the `sm` breakpoint. Arbitrary pixels. | One desk width, e.g. `min-w-60` | medium |
| `frontend/src/components/app-shell.tsx:407` | Signed-in name `hidden … sm:flex` | Identity is hidden on the smallest width. | Show it in the desktop header, which already does at `sm` and up | low |
| `frontend/src/app/[locale]/(auth)/login/page.tsx:75` | Brand column `hidden … lg:flex`; form column always shown | Two-column only at `lg`. The form card is full width until then. | Acceptable for auth. The `p-8` / `text-4xl` / `w-full` button are the desk problem | medium |
| `frontend/src/app/[locale]/(auth)/login/page.tsx:149` | Submit `w-full` | Full-width button inside a narrow card. On a desk form, actions are content-sized and sit at the end of the row. | Default button width, aligned to the end of the form | high |
| `frontend/src/app/[locale]/(auth)/login/page.tsx:94` | Logo block `lg:hidden` | Phone-only brand lockup. | Leave | low |
| `frontend/src/components/home-landing.tsx:154` | `max-w-5xl`, `gap-10`, `lg:grid-cols-…`, `py-16 lg:py-24` | Marketing page built mobile-first. | Out of the desk scale. `text-4xl` / `lg:text-5xl` (`:157`) is still off the type tokens | low |

`w-full` on inputs, search fields, and controls inside a side panel is correct. It is not listed.

## 5. Hard-coded sizes and narrow containers

| File:line | Current value | Why suspicious | Proposed token / value | Severity |
| --- | --- | --- | --- | --- |
| `frontend/src/app/[locale]/(auth)/login/page.tsx:86` | `text-4xl` | Not in the `@theme` map, so it stays Tailwind's 36px. `--text-display` is 1.375rem. | `text-display` | high |
| `frontend/src/components/home-landing.tsx:111` | `text-4xl` | Same unmapped size. | `text-display` if this page joins the scale | low |
| `frontend/src/components/home-landing.tsx:157` | `text-4xl lg:text-5xl` | `text-5xl` is also unmapped. | `text-display` | low |
| `frontend/src/app/globals.css:346` | `.designer-tool` `font-size: 10px` | Hard-coded, below `--text-meta` (11px). | `font-size: var(--text-meta)` | high |
| `frontend/src/components/app-shell.tsx:275` | `text-[10px]` | "New" nav mark, off the type scale. | `--text-meta` | medium |
| `frontend/src/components/club-admin/training-calendar.tsx:202` | `text-[11px]` (also `:208`, `:328`) | One pixel under `--text-meta`, but still arbitrary. | `--text-meta` | low |
| `frontend/src/components/club-admin/training-calendar.tsx:313` | `text-[10px]` | Weekday labels. | `--text-meta` | low |
| `frontend/src/app/[locale]/dashboard/ltf/license-cards/[id]/designer/page.tsx:696` | `text-[11px]` (also 703, 4668, 4878, 4879, 4954, 4984, 5004, 5040, 5196, 5895) | Inspector copy bypasses `--text-meta`. | `--text-meta` | medium |
| `frontend/src/app/[locale]/dashboard/ltf/license-cards/[id]/designer/page.tsx:5325` | `text-[10px]` (also 5355, 5505, 5513, 5522, 7017, 7023, 7102, 7108) | Canvas chrome at 10px. | `--text-meta` | medium |
| `frontend/src/app/[locale]/dashboard/page.tsx:57` | `max-w-xl` on the signed-in card | Narrows a page that otherwise uses the viewport. | Drop `max-w-xl` | medium |
| `frontend/src/app/[locale]/about/page.tsx:55` | `max-w-3xl` | Reading column. Fine for prose, not for a desk tool. | Leave if the page stays an article | low |
| `frontend/src/app/[locale]/dashboard/club/subsidies/page.tsx:561` | `max-w-3xl` on a heading block | Limits a paragraph, not the table. | Leave | low |

79 `max-w-xs` through `max-w-7xl` hits sit in 57 files. Dialogs, side panels (`max-w-md`), and short forms should keep a max width. The shell `max-w-[1440px]` is already gone. Do not treat those form widths as leftovers.

Designer canvas sizes in millimetres, and measured iframe sizes on the license-card preview, are print geometry. They are not UI chrome.

## Not flagged

- Token arbitrary values: `min-h-[var(--control-height)]`, `w-[var(--sidebar-width)]`, `px-[var(--page-padding-x)]`.
- Remapped type classes `text-sm` through `text-3xl`.
- `.app-data-table` cells, which already use `--table-row-height` and `--control-padding-x`.
- Entity table rows.
- Checkbox glyphs at 16px.
- Circles that are avatars, calendar days, chart tracks, or blur orbs.

## Screenshots

1440×900, deviceScaleFactor 2, clipped to the example, `captureBeyondViewport: false`.

| File | What it shows |
| --- | --- |
| `/opt/cursor/artifacts/audit_member_tabs.png` | Member page. 48px tabs and the 24px stack above the `p-6` cards. |
| `/opt/cursor/artifacts/audit_national_tabs.png` | National team. Same tab height and `space-y-6`. |
| `/opt/cursor/artifacts/audit_login_form.png` | Login. `text-4xl` brand lockup and the `p-8` card with a full-width submit. |
| `/opt/cursor/artifacts/audit_team_groups.png` | Poomsae team. `app-panel p-6` group card. |
