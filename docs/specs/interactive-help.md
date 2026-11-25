# Interactive help and guided tours

Status: spec only. No code until Faustino approves this document. Nothing in this pull request changes the app.

A person who is stuck can search the manual from inside the app, or turn on a guide that paints the real screen the way the printed manual paints a screenshot: a rounded border around each control, a numbered disc on the top-left corner, and a short bubble that says what the control does. Two ways to follow a guide: see every number at once, or walk one step at a time.

## What the printed manual already does

The English book is `docs/user-manual/LTF-Dojang-Hub-User-Manual-EN.pdf`, built from `docs/user-manual/content/en.md`. Pages 12, 14 and 16 were read from that PDF, and the figures on those pages were opened as images.

| Page | Figure | What it numbers |
|---|---|---|
| 12 | Figure 5, “The role list, open on the technical console” (`figures/en/ops-desks.png`) | One control: the desk switcher in the header. The grey legend under the picture explains number 1. |
| 14 | Figure 6, “Already on, and a bundle that cannot be ordered again” (`figures/en/module-order.png`) | Two wide fields: “Already on”, then “Modules and bundles”. |
| 16 | Figure 8, “Taking the roll for a class” (`figures/en/roll.png`) | Six controls on one screen: the coaches field, the age chips, the roll, the empty-state line, “Mark the names shown as present”, and “Save roll”. Under the picture, a numbered procedure says what to click, in order. |

The book itself says, in “How to read this manual”: “Red numbers on a picture are explained in the list under it.”

The marks are drawn by `annotate()` in `docs/user-manual/tools/capture.py`, not by hand:

- Colour is RGB `(200, 16, 46)`, a red close to the LTF brand red `#e30613`, and not the danger token.
- A rounded rectangle is stroked around the control, about 4px outside it, corner radius about 6px, stroke about 2.5px.
- A filled disc sits on the top-left corner of that rectangle, so the disc straddles the corner rather than sitting inside the control. A thin white ring separates the disc from the border. The number is white and centred.
- The words are not inside the picture. They are the numbered legend under the figure, and, on page 16, the procedure list as well.

The on-screen guide copies that geometry. The bubble is the legend, moved next to the control so you do not have to look under a picture.

**Decision.** The standing UI rule is that red is for errors, while primary buttons are already LTF red. The manual’s callouts are also red. The proposal is a `--guide` token whose light-theme value is the manual red `#c8102e`, used only for these borders and discs, never for errors and never for ordinary buttons. If that still feels like too much red, the same token can be the link blue `#0265b2` and the shape stays. Faustino chooses.

## 1. Searchable help

### One source of truth

The four manuals already exist as `docs/user-manual/content/{en,fr,de,lb}.md`, with the same headings and anchors. That stays the source. A build step reads those files and writes a help pack the app can load: one record per section, with the anchor, the heading, the plain text, the role the chapter is for, and the figure id when there is one. UI labels stay as `[[keys]]` until the pack is built, then they are filled from `frontend/src/messages/{locale}.json`, the same way `build.py` already fills them for the PDF.

Guides do not copy those paragraphs. A guide step points at a manual anchor when it wants the long version, and it has its own one-sentence bubble.

### Search

Search runs in the browser. The pack for the active language is loaded the first time Help opens, then cached. MiniSearch (MIT, about 7 kB gzipped) is the index: prefix match, one-character typos, and field weights so a heading beats a passing mention. No request to the server, and no search service.

Results are filtered by the desk that is open. A coach does not see “Order a license”. A view-only desk sees the guide, and any step whose button is disabled says so in the bubble instead of pretending the click will work.

Each result shows the heading, a short snippet, and either “Open the page” or “Show me”, when that section has a guide.

### Where help opens

- A header button, icon plus the word Help, on every signed-in desk.
- The `?` key, only when focus is not in a field, a menu, or a dialog.
- A “How do I…?” row at the top of that panel (optional, see section 3).

The panel is the usual side panel: one Close in the header, theme tokens, icon plus label on every action.

### Contextual help

Each app route can name the manual anchors that belong on that page. Opening Help on the members list offers “Add a member” and “Order a license” before the general search. If the page has no anchors, Help opens on search with an empty box.

## 2. The guide layer

### How a guide is written

A guide is a small JSON file, one per task, plus message keys in en, fr, de and lb. It is not a script that queries the DOM with CSS selectors.

```json
{
  "id": "order-license",
  "desks": ["club_admin"],
  "titleKey": "Guide.orderLicenseTitle",
  "manual": "order-licenses",
  "steps": [
    {
      "id": "open-order",
      "anchor": "members.order-license",
      "route": "/dashboard/club/members",
      "titleKey": "Guide.orderLicenseOpenTitle",
      "bodyKey": "Guide.orderLicenseOpenBody",
      "advance": "click"
    }
  ]
}
```

The control wears a stable hook, put on the element itself:

```html
data-guide="members.order-license"
```

The test in section 4 fails when a guide names a hook that no longer exists in the source. Selectors such as `.btn-primary` or “the third button” are not allowed.

A field step also carries an example of a valid value, in the bubble, not as a placeholder that overwrites the field. Dates say the shape `DD.MM.YYYY`, for example `29.11.2026`. The field still stores ISO dates. The bubble never types into the field for the person.

### What you see

The layer is drawn above the app and does not live inside the page layout, so it cannot shove controls around.

- Everything outside the current steps is dimmed with the existing scrim token, about 50% in light and a little stronger in dark. The highlighted controls stay at full colour. There is a clear gap between the scrim and the border so the control reads as the subject.
- The border and the numbered disc match `annotate()`: rounded rect, disc straddling the top-left corner, white numeral, white ring. In map mode every step on the current page is numbered at once, which is what pages 12, 14 and 16 do.
- The bubble sits beside the control on a wide screen: the step title, one or two sentences, and the example when it is a field. A text button in the bubble opens the manual section. The bubble has no second close control. Exit lives in the guide bar.
- The guide bar is a slim strip, icon plus label: Back, Next, Show all steps, Exit. It shows “Step 2 of 6”. Exit is the only close.

### Two modes

**Map.** Every numbered step that is on this page is visible together, as in the manual. Clicking a number opens its bubble. Nothing advances by itself. This is the mode for “what does this screen do?”

**Walk.** One step at a time. Next and Back move the bubble. When the step says `advance: "click"`, Next stays quiet until the person actually uses that control. `advance: "value"` waits until the field is non-empty and, when a pattern is given, until it matches (a date, an email, a year). `advance: "manual"` is for reading a result, and Next is enough.

A walk can cross pages. “Order a license” starts on the members list, continues on the order page, and ends when the order is saved. The guide id and the step id are stored in `sessionStorage` for that browser tab. Refresh resumes. A different desk, Exit, or Skip clears it. Skip ends the guide without the celebration.

### When the control is missing

The layer scrolls the control into view, with `scroll-margin` so the bar and the bubble do not cover it. If the control is inside a closed menu or dialog, the step says which menu to open, and the walk waits. It does not open menus by itself. If the control is not in the DOM because this desk cannot see it, the step is omitted and the numbers stay contiguous.

### Phone

Checked against a 428×926 CSS-pixel frame, the iPhone 12 Pro Max width in Brave. The disc and the border stay on the control. The bubble becomes a sheet docked above the guide bar, so it does not cover the field being explained. Map mode still shows every number, and only one bubble is open. The sheet is one column, the same type size as the rest of the app, and it does not force horizontal scrolling.

### Accessibility

- The bubble is a dialog with a name (“Step 2 of 6, Order a license”). Focus moves into it when the step changes.
- In a walk, focus is not trapped: the person must be able to reach the real control. Tab order is the bubble, then the highlighted control, then the guide bar.
- Escape exits, the same as the Exit button, and asks only when the walk is past the first step.
- The scrim is `aria-hidden`. The disc’s number is in the accessible name, not only in the picture.
- `prefers-reduced-motion`: no pulse on the border, no confetti, and the bubble appears without a slide.

### The end

The last step says what should now be true (“The order is in the list”). Then the same confetti used after authenticator setup runs once (`frontend/src/lib/mfa-celebration.ts` and `canvas-confetti`, already in the app, loaded only at that moment). Reduced motion skips it and shows the sentence alone.

## 3. Fun, and easy to ignore

These are proposals. They are off unless Faustino asks for them.

| Idea | Why it is optional |
|---|---|
| “How do I…?” as a command palette (`?` then type) | The help panel already searches. A palette is faster for people who like one. |
| A first-visit hint, one line, dismissed forever | Easy to become nagging. Default off. |
| A small check drawn on a finished guide in the help list | Pleasant, and it is only a tick, not a mascot. |
| No mascot, no sounds | The confetti at the end is the playful part. |

The guide never starts by itself, never covers the screen on sign-in, and never repeats a hint that was dismissed.

## 4. The first guides, and who keeps them

| Guide | Desk | Starts on |
|---|---|---|
| Order a license | club admin, and only when the club may order | Members list → order page |
| Add a member | club admin | Members list → the member form |
| Import members | club admin | The import page |
| Pay an LTF invoice | club admin, LTF finance | The invoices list |
| Set up the authenticator app | any desk that is asked for one | Security / the enrolment screen |

A later pass can add the roll (page 16 is already the picture of that guide), a transfer, and printing cards.

**Authors.** Faustino approves the words. The manual files stay the long form. A guide is a short file in the repo, reviewed like any other change. Translators fill en, fr, de and lb together. English says “license”. French says “licence”.

**The anchor test.** A unit test reads every guide and fails if `data-guide="…"` is missing from the frontend source. Renaming a button without moving the hook breaks the test, not a person in production. A second test checks that every `titleKey` and `bodyKey` exists in all four message files, with the same placeholders.

**Smoke.** One Playwright test, club admin, fake data: open Help, start “Order a license”, see step 1 on the members list, go to the order page, see the next step’s number. It does not place a real order.

## 5. Library

| Option | Licence | What it is good at | Why it is not enough on its own |
|---|---|---|---|
| Build the layer here | — | Map mode and walk mode, the exact disc-on-the-corner, “wait until they click”, cross-page, no network | We own the bugs. The layer is small and is loaded only when Help is open. |
| Driver.js | MIT | A light step-by-step tour | One step at a time. The manual’s “all numbers at once” is the part Faustino pointed at. Styling the disc means fighting the library. |
| Shepherd | MIT | Flexible steps, popovers | Same gap: no map mode. Heavier. |
| React Joyride | MIT | React tours | Same gap, and a larger bundle. |
| Intro.js | AGPL, or a paid licence | Popular tours | The licence does not fit. |

**Recommendation.** Build the layer in the app. Use MiniSearch only for the help index. No hosted tour product, no telemetry, no font or script loaded from outside.

## 6. Language, speed, and privacy

- Bubbles and the help panel use the four message catalogues. The manual pack is built per language. Missing a key fails the same i18n check the app already has.
- The guide code, MiniSearch, and the manual pack are in a dynamic import. Until Help or a guide is opened, they are not downloaded. Confetti is imported only on the last step, as it already is after 2FA.
- Search, progress, and the resume token stay in the browser. Nothing is sent to a search vendor or an analytics vendor. The resume token stores the guide id and the step id, not what the person typed.
- View-only desks can open a guide and cannot complete a step the desk cannot press.

## 7. Small pull requests

Each one starts from the latest `develop`. They are not stacked.

1. **This spec.** Docs only.
2. **Help pack.** The build step from the four manuals, the side panel, header Help (icon plus label), `?`, search, desk filter. No overlay.
3. **Hooks.** `data-guide` on the controls for “Order a license” only, the guide file, and the test that fails if a hook is missing. Still no overlay.
4. **Map mode.** The border, the disc, the bubble, the scrim, the phone sheet, reduced motion. “Show all steps” works on the order page.
5. **Walk mode.** Next, Back, wait for the click or the value, cross the page change, resume, skip, exit, progress, confetti at the end.
6. **The other four guides,** one pull request each if a guide touches many files, otherwise one pull request for the set.
7. **Smoke.** The Playwright tour, fake data, Chromium only.

## Decisions for Faustino

1. Guide colour: the manual red `#c8102e` as a `--guide` token, or the link blue so red stays on errors and primary buttons?
2. When a guide opens, start in the walk, with “Show all steps” as a switch? (Recommended.) Or start in the map, like the book?
3. Ship the optional pieces in section 3, or leave them out of the first build? (Recommended: leave them out.)
4. Is the first guide “Order a license”, with the other four following in the order in section 4? (Recommended.)
