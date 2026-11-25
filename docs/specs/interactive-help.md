# Interactive help and guided tours

Status: spec only. Faustino has decided the four open points below. No app code until he says go. Nothing in this pull request changes the app.

A person who is stuck can search the manual from inside the app, or turn on a guide that paints the real screen the way the printed manual paints a screenshot: a rounded border around each control, a numbered disc on the top-left corner, and a short bubble that says what the control does. A guide opens as a step-by-step walk. “Show all steps” switches to every number at once.

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

**Colour, decided.** The shape matches the manual. The colour does not. Faustino chose the link blue, so red stays for errors. The border and the disc use the existing `--link` token (light `#0265b2`, dark `#4db8ff`). The numeral uses a contrasting token so the digit stays readable on that blue. Primary buttons stay LTF red. Danger stays the danger token. There is no separate red for guides.

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
- The `?` key, only when focus is not in a field, a menu, or a dialog. It opens the “How do I…?” palette (section 3).

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
- The border and the numbered disc match `annotate()` in shape: rounded rect, disc straddling the top-left corner, contrasting numeral, thin ring. The stroke and the disc are `--link`, not the manual red. In map mode every step on the current page is numbered at once, which is what pages 12, 14 and 16 do.
- The bubble sits beside the control on a wide screen: the step title, one or two sentences, and the example when it is a field. A text button in the bubble opens the manual section. The bubble has no second close control. Exit lives in the guide bar.
- The guide bar is a slim strip, icon plus label: Back, Next, Show all steps, Exit. It shows “Step 2 of 6”. Exit is the only close.

### Two modes

A guide always opens in the walk. The guide bar has a switch, icon plus the words “Show all steps”, which turns on the map. Turning it off returns to the step you were on.

**Walk.** One step at a time. Next and Back move the bubble. When the step says `advance: "click"`, Next stays quiet until the person actually uses that control. `advance: "value"` waits until the field is non-empty and, when a pattern is given, until it matches (a date, an email, a year). `advance: "manual"` is for reading a result, and Next is enough.

**Map.** Every numbered step that is on this page is visible together, as in the manual. Clicking a number opens its bubble. Nothing advances by itself. This is the mode for “what does this screen do?”

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

Faustino included these in the first build. They ship with the help panel and the first guide, not in a later pass.

**“How do I…?”** Pressing `?` outside a field opens a small palette. Typing filters the same MiniSearch index. Choosing a row opens the page or starts that guide’s walk. The palette is the search, not a second catalogue. Escape closes it. It does not open while a guide is already running.

**First visit.** The first time a desk that has at least one guide is opened, one line appears under the header: icon, “Stuck? Press ? for a guide.”, and a dismiss control. Dismissing it stores a flag in `localStorage` for that browser. It does not come back, it does not start a guide, and it does not cover the page.

**Completion ticks.** When a walk reaches the celebration, that guide shows a small tick in the help list. The tick is a success-token icon plus the word Done, not a badge image. Skipping does not tick it. The list is stored in `localStorage` with the guide id only.

There is still no mascot and no sound. The confetti at the end of a finished walk is the playful part. A guide never starts by itself, never covers the screen on sign-in, and never repeats a hint that was dismissed.

## 4. The first guides, and who keeps them

Faustino set this order. Each guide is its own pull request, after the layer can walk.

| Order | Guide | Desk | Starts on |
|---|---|---|---|
| 1 | Order a license | club admin, and only when the club may order | Members list → order page |
| 2 | Add a member | club admin | Members list → the member form |
| 3 | Import members | club admin | The import page |
| 4 | Pay an LTF invoice | club admin, LTF finance | The invoices list |
| 5 | Set up the authenticator app | any desk that is asked for one | Security / the enrolment screen |

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

1. **This spec.** Docs only. The decisions below are recorded here.
2. **Help pack.** The build step from the four manuals, the side panel, header Help (icon plus label), search, desk filter, the “How do I…?” palette on `?`, and the one-time first-visit hint. No overlay.
3. **Hooks.** `data-guide` on the controls for “Order a license” only, the guide file, and the test that fails if a hook is missing. Still no overlay.
4. **The layer, opening in the walk.** Border and disc in `--link`, bubble, scrim, phone sheet, reduced motion, Back, Next, wait for the click or the value, cross the page change, resume, skip, exit, and progress. “Show all steps” switches to the map. Confetti at the end, then the completion tick for that guide.
5. **Add a member.**
6. **Import members.**
7. **Pay an LTF invoice.**
8. **Authenticator setup.**
9. **Smoke.** The Playwright tour for “Order a license”, fake data, Chromium only. It checks the walk and one toggle of “Show all steps”.

## Decisions, recorded

Faustino decided these. They are not open.

1. **Colour.** The link blue theme token (`--link`). Red stays for errors. Primary buttons are unchanged.
2. **Opening mode.** The step-by-step walk. “Show all steps” is a switch to the map.
3. **Extras.** The command palette, the first-visit hint, and the completion ticks are in the first build. Section 3 and pull requests 2 and 4 above include them.
4. **Order.** Order a license, then add a member, import members, pay an LTF invoice, authenticator setup.
