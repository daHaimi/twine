# TWINE — Architecture

TWINE (**T**ablet **W**eaving **IN**teractive **E**ditor) is a fully
client-side, static web app for viewing, editing, and printing tablet
weaving patterns in the [GTT format](../../GTT-DEFINITION.md). There is no
backend: the production artifact is a plain `dist/` folder (HTML/CSS/JS)
served as-is by nginx, and all persistence happens in the browser's
IndexedDB. This document describes how the codebase is organized and why,
as a companion to [`IMPLEMENTATION-PLAN.md`](../../IMPLEMENTATION-PLAN.md)
(which records the stage-by-stage build plan and every explicit
decision/rationale for ambiguous points in the brief — read that first for
*why* a given technology or format convention was chosen).

## Technology stack

| Concern | Choice |
|---|---|
| UI framework | React 19 + TypeScript, built with Vite |
| Routing | React Router (`createBrowserRouter`) |
| State management | Zustand |
| IndexedDB access | [`idb`](https://github.com/jakearchibald/idb) (thin promise wrapper) |
| Unit/fuzz testing | Vitest + `fast-check`, run under `jsdom` |
| E2E/browser testing | Playwright (headless Chromium; a touch-enabled mobile device profile too) |
| Linting | `oxlint` |

See decisions #1–#22 in `IMPLEMENTATION-PLAN.md` for the rationale behind
each of these, plus the GTT-format-specific conventions TWINE follows
(colour packing, line endings, default palette/cards, etc) and the Node
version requirement.

## Source layout

```
twine/
├── src/
│   ├── domain/            # Pure, framework-agnostic business logic
│   │   ├── model/pattern.ts    # Pattern/Card/Pick/Action/Palette/Pack types + LIMITS
│   │   ├── gtt/
│   │   │   ├── colour.ts       # 0x00BBGGRR <-> CSS #RRGGBB codec
│   │   │   ├── parser.ts       # GTT XML string -> Pattern (DOMParser-based)
│   │   │   ├── serializer.ts   # Pattern -> GTT XML string (hand-written builder)
│   │   │   └── io.ts           # Browser-facing glue: File read, download-as-GTT
│   │   ├── naming.ts           # Clone/duplicate "-<N>" suffix rule
│   │   ├── simulation.ts       # CurThread/CurPos/CurHoles recomputation
│   │   ├── weavingDraft.ts     # Draft rows, direction symbols, repetition expansion,
│   │   │                       #   incremental recompute cache (Stage 4)
│   │   └── pickAction.ts       # Pick-cell action cycling + swipe-gesture classification
│   ├── hooks/
│   │   └── useDraftRows.ts     # Feeds the live preview from the incremental draft cache
│   ├── components/
│   │   ├── DraftChart/         # Shared thread-path chart renderer (full + preview views)
│   │   └── PaletteSelect/      # Hole colour picker: palette swatches, coloured trigger field
│   ├── storage/
│   │   ├── db.ts               # IndexedDB schema + shared connection (idb)
│   │   └── patternRepository.ts # Pattern CRUD, default-pattern factory
│   ├── state/              # Zustand stores (UI-facing; call into domain + storage)
│   │   ├── patternListStore.ts  # Pattern Selection page: list/upload/create/clone/delete
│   │   └── editPatternStore.ts  # Edit Pattern page: the in-progress draft Pattern + all mutations
│   ├── pages/              # One folder per frontend state (component + CSS module)
│   │   ├── PatternSelection/
│   │   ├── EditPattern/
│   │   └── WeavingDraft/       # WeavingDraftPage.tsx + CSS module + print.css (A4)
│   ├── styles/global.css   # Base styles, CSS custom properties, prefers-color-scheme
│   └── app/App.tsx         # Router setup wiring the 3 frontend states together
├── tests/
│   ├── unit/               # Vitest + fast-check, mirrors src/ structure 1:1
│   └── e2e/                # Playwright specs (full-browser flows)
├── tests/fixtures/         # Reference .gtt files used by both unit and e2e tests
├── vite.config.ts
├── vitest.config.ts
└── playwright.config.ts
```

**Key architectural principle:** anything that encodes a GTT-format rule or
a TWINE business rule (naming, limits, card-state simulation, pack-overlap
resolution, pick-action cycling, colour packing) lives in `src/domain/` as
pure, dependency-free TypeScript — no DOM, no IndexedDB, no React. This is
what makes the 95%-statement-coverage/fuzz-testing NFR tractable: every one
of those modules can be exhaustively unit- and property-tested in complete
isolation. `src/storage/` and `src/state/` exist only to *orchestrate* calls
into `domain/`; `src/pages/` renders state and forwards user input back into
`state/` actions. If you're looking for "where is rule X enforced", it is
almost certainly in `src/domain/`, not in a component.

## Domain layer

### `model/pattern.ts`
Defines the in-memory `Pattern` shape and every type it's built from
(`Card`, `Pick`, `Action`, `Palette`, `Pack`), plus the `LIMITS` constant
(`MAX_CARDS = 140`, `MAX_PICKS = 128`, hole count `3..8`, 16-slot palette).
This is the *only* representation the rest of the app operates on — GTT XML
is just a serialization format for it, never passed around directly outside
`domain/gtt/`.

A few representational choices worth knowing about when reading other code:
- A `Pick.actions` map only ever stores *non-default* entries; any
  card/pack absent from the map is implicitly Idle (mirrors the GTT "missing
  action defaults to Idle" rule, and avoids ever materializing a huge number
  of explicit Idle entries).
- `PreservedBlocks` holds the raw, verbatim inner XML for `<Notes>` and
  `<Selvedges>` (plus a presence flag for the content-less `<Release/>`
  marker) — these are blocks TWINE's UI never edits but must round-trip
  byte-for-byte if present on import, per the brief.

### `gtt/parser.ts` and `gtt/serializer.ts`
Parsing uses the browser's native `DOMParser` (handles CDATA/entities
correctly with no extra dependency). Serialization is a **hand-written
string builder**, not `XMLSerializer` — the format has byte-level
requirements (CDATA-wrapped `<Name>`, specific indentation/line-endings,
freshly-recomputed `CurThread`/`CurPos`/`CurHoles`, omitted-when-unset
palette entries, always-overwritten `TWData` `Source`/`Version`) that a
generic serializer would fight us on. `CurThread`/`CurPos`/`CurHoles` are
always *ignored* on import and *recomputed* on export via `simulation.ts` —
they're a cache, never a source of truth.

### `simulation.ts`
Computes each card's final `CurThread`/`CurPos`/`CurHoles` by replaying all
picks against a card's static `Holes`/`Threading`. Also resolves TWINE's
Pack-mode extension: when a pick is in `Pack` mode, a card's net rotation
for that pick is the cumulative sum of every pack covering that card (that
has an explicit action in the pick), applied in ascending `Pack.order`.

### `weavingDraft.ts`
Computes the Stage 3 Weaving Draft rendering model for a pattern:
- `computeDraftRows` produces one row per pick with one cell per card. It
  deliberately calls `simulation.ts`'s `resolveCardDelta` so pack-overlap
  resolution is identical to GTT export, and stores the net rotation delta
  plus the palette colour at the card's weaving position (before that pick).
- `draftSymbol` maps `(threading, net delta)` to the brief's `\ / |` stroke
  table. A net delta of zero also covers cancelling overlapping packs and
  twists, which render as Idle by design. `draftActionLabel` maps the same
  delta to the cell's action text (`F`, `B`, `.`) with the hole count appended
  for multi-turn actions (`F2`, `B2`, …), per the user's clarification of
  `webbrief.png`.
- `holeLabel` produces the A/B/C… hole labels of the setup grid, while
  `pickRowLabel` numbers draft rows 1..N and wraps back to 1 after the
  pattern's last pick (so each displayed repetition restarts at 1).
- `expandDraftRows` repeats the *whole* pattern 1–4 times (clamped) and
  annotates each row with a `repeatIndex` so the view can draw the thicker
  separator between repetitions.
- **Incremental recompute cache (Stage 4):** `DraftCache` stores the last
  rows together with a config signature (cards/packs/palette) and a per-pick
  signature. `updateDraftCache` reuses all rows before the first changed pick
  by reference and recomputes only the tail from `positionAfter` seeds via
  `computeDraftRowsFrom`; an unchanged pattern returns the identical cache
  object and any config change falls back to a full recompute.

The shared `components/DraftChart/` renders the setup grid, the draft grid
(SVG strokes, action labels, palette fills, repeat separators) and legend. Both
`pages/WeavingDraft/` (full view) and `pages/EditPattern/` (compact live
preview panel beside the Picks grid) use it, so they cannot disagree about
how a pick looks. `hooks/useDraftRows.ts` feeds the preview from the
incremental cache; it is the React-side bridge to the pure domain functions.
Print geometry lives in `pages/WeavingDraft/print.css`
(`@page { size: A4 portrait }` + hiding app chrome) with chart print sizing in
`DraftChart.module.css`. See decision #21 for the webbrief layout
interpretation.

### `pickAction.ts`
Drives the Picks-grid cell interaction model described in the brief
("choose the most intuitive way of human input... swiping up/down to turn
forward/backward, swiping sideways to twist"):
- `cycleAction` steps a single click/tap through all 6 representable states
  in one self-contained loop (`Idle -> F1 -> F2 -> B1 -> B2 -> Twist ->
  Idle`), so mouse users can reach every state with one interaction
  primitive.
- `gestureFromSwipe(dx, dy, threshold=24)` classifies a raw pointer-move
  delta into `'tap' | 'up' | 'down' | 'sideways'`.
- `applyGesture` maps a classified gesture onto the next action: `'tap'`
  delegates to `cycleAction`; `'up'`/`'down'` are direct Turn-F/Turn-B
  shortcuts (independent of each other, each with their own 1→2→Idle
  sub-cycle); `'sideways'` toggles Twist.
- `actionLabel` renders a compact cell label (`'·'`, `'F1'`, `'B2'`, `'Tw'`,
  ...).

All four functions are pure and gesture classification/cycling is fully
unit- and fuzz-tested; the only non-pure part of this feature is the
pointer-event wiring in `EditPatternPage.tsx` (see below).

### `naming.ts`
Implements the clone/duplicate "-<N>" suffix rule: strip any existing
trailing `-<N>` suffix from the base name, then append the lowest unused
`-<N>` among the given set of existing names. Shared by pattern cloning
today; written generically enough to reuse for Pack/Snippet cloning in
later stages.

### `gtt/colour.ts`
Pure codec between GTT's packed `0x00BBGGRR` integer colour format (byte 0
= R, byte 1 = G, byte 2 = B, byte 3 unused — the Delphi `TColor`/COLORREF
convention) and CSS `#RRGGBB` strings, fuzz-tested for round-trip fidelity.
`readableTextColour` also picks black or white text for a packed colour so
palette swatches and colour-filled fields stay legible.

## Storage layer

`storage/db.ts` owns a single shared IndexedDB connection (`idb`-wrapped),
with one object store per persisted entity (`patterns` now; `snippets`
reserved for Stage 6). `storage/patternRepository.ts` is the *only* module
that touches the `patterns` store directly — list/get/save/delete, plus the
default-pattern factory (6 cards × 4 holes, `S`-threaded, 4-colour default
palette) used when creating a new pattern from scratch. Keeping all
IndexedDB access behind this one module means state/UI code never needs to
know anything about IndexedDB's API shape, and it's the single seam unit
tests mock/reset (`resetDbConnectionForTests` + `fake-indexeddb`'s
`indexedDB.deleteDatabase`) between test cases.

## State layer (Zustand stores)

- `patternListStore.ts` — backs the Pattern Selection page: loading the
  stored-pattern list, file upload/drag-drop import (via `domain/gtt/io.ts`),
  create-new, clone (via `naming.ts`), rename, delete.
- `editPatternStore.ts` — backs the Edit Pattern page: holds the
  in-progress draft `Pattern`, plus every mutation action for both the
  "configuration" part (name, palette, cards, packs) and the "picks" part
  (add/remove pick rows, per-cell action editing, Card/Pack mode switching).

**Destructive-change confirmation pattern:** any store action that could
discard existing pick data (reducing card count, reducing a card's hole
count, removing a card, switching a pick row's mode when it would discard
existing action data) is split into a `preview*` function (pure,
side-effect-free — returns a `DestructiveChangePreview` describing the
impact, or `undefined` if the change isn't destructive) and a separate
`apply*` function that performs the actual mutation. The UI calls `preview*`
first; if it returns a preview, a confirmation dialog is shown and `apply*`
is only invoked on confirmation. Non-destructive changes (e.g. *increasing*
card count) have no `preview*` step and apply immediately. This keeps the
"must warn before a destructive change" rule enforceable and unit-testable
at the store level, rather than relying on UI code to remember to ask.

Stores are global singletons (the standard Zustand pattern) — every unit
test file that touches a store must reset its state in `beforeEach`.

## Pages / routing

`app/App.tsx` maps the brief's 3 frontend states onto 4 URL patterns:

| Route | Page | Notes |
|---|---|---|
| `/` | Pattern Selection | |
| `/pattern/:patternId` | Edit Pattern | |
| `/pattern/:patternId/draft` | Weaving Draft | reached *from* Edit Pattern; "back" returns there |
| `/draft/:patternId` | Weaving Draft | reached directly from Pattern Selection; "back" returns there |

Both draft routes render the same `WeavingDraftPage`, parameterized by a
`backTo` prop — this satisfies "from both other states, the Weaving draft
can be accessed" while keeping a single back-navigation target per entry
point.

Each page owns a CSS module with its own `@media (max-width: 640px)`
(layout) and `@media (pointer: coarse)` (touch-target sizing, 44px minimum)
rules, per the brief's responsive-design requirement — there is no
separate "mobile" component tree; the same markup adapts via CSS.

### Hole colour assignment (`PaletteSelect.tsx`)
The Cards table's hole cells use a palette picker instead of the old
click-to-cycle behaviour (removed with `domain/paletteCycle.ts`): the field
shows the selected colour and its index, and clicking it opens a popover
listing "Unset" plus all 16 palette slots as colour swatches. Unset slots are
disabled (they cannot be assigned), selection closes the popover, and Escape
or an outside click dismisses it. The same component is used for every hole
of every card, so the selection UI is identical everywhere.

### Pointer/gesture wiring (`EditPatternPage.tsx`)
The Picks grid's cell buttons track `pointerdown`/`pointerup` coordinates
and feed the delta into `gestureFromSwipe` + `applyGesture` from
`pickAction.ts`; a plain `onClick` (no measurable movement) is a separate
fallback path that always reaches `cycleAction` directly, so both a
genuine zero-movement click and a classified `'tap'` gesture behave
identically. Note there is **no `setPointerCapture` call** — this
deliberately relies on touch pointers' native implicit capture (a
`pointerup` stays targeted at the original `pointerdown` element even after
large on-screen movement) and is *not* equivalent to a mouse drag, which has
no such capture. This distinction matters when writing Playwright tests
against these gestures — see the E2E section below.

## Testing strategy

### Unit + fuzz tests (`tests/unit/`, Vitest)
Mirrors `src/` 1:1. Every `domain/` module is unit- and (where it takes
parameters) property/fuzz-tested with `fast-check`
(`fc.assert(fc.property(...))`), e.g. colour round-tripping, clone-name
suffixing, card/pick limit enforcement, pick-action cycling. `storage/` and
`state/` tests exercise real IndexedDB operations against
`fake-indexeddb`, resetting the connection and deleting the test database
in `beforeEach` to keep tests isolated (`fake-indexeddb` persists
in-process across test files otherwise). Component tests use
`@testing-library/react` under `jsdom`.

Run with `npm run test` (not `npx vitest` directly — the project's shell
environment sets `NODE_ENV=production` globally, and the `test` script
wraps Vitest with `cross-env NODE_ENV=test` to avoid React/testing-library
breaking under a production `NODE_ENV`). Coverage: `npm run test:coverage`
(v8 provider; current thresholds in `vitest.config.ts` are 95%
statements/functions/lines, 90% branches — see
`IMPLEMENTATION-PLAN.md`'s note on this being temporarily deprioritized in
favor of feature completeness during early stages).

### E2E tests (`tests/e2e/`, Playwright)
`playwright.config.ts` defines two projects — `desktop-chromium` (mouse
input) and `mobile-chromium` (a touch-enabled Pixel 7 device profile) — run
against `vite preview` on port 4173 (Vite's default `appType: 'spa'`
ensures direct navigation to e.g. `/pattern/:id` serves `index.html` via SPA
fallback, which the test suite relies on).

- `pattern-lifecycle.spec.ts`: create → edit name → save → reload
  (persistence through IndexedDB), file upload, clone (`-1` suffix) +
  delete, and download-as-`.gtt`.
- `picks-gestures.spec.ts`: the full 6-state tap cycle, swipe-up,
  swipe-down, swipe-sideways, and the plain-click tap-fallback path — on
  both projects.
- `weaving-draft.spec.ts`: setup/draft chart rendering, the 1–4 repetition
  control, print-media hiding of controls, and A4 `page.pdf()` output
  (desktop-only; mobile emulation cannot generate PDFs).
- `draft-preview.spec.ts`: the live preview updates immediately on pick edits
  (including a later pick, exercising the incremental path) and links to the
  full draft view, on both desktop and mobile.
- `cards-config.spec.ts`: the hole colour picker lists all palette swatches,
  assigns the chosen colour to the field (no rotation on repeated clicks),
  and supports clearing back to Unset.

**Simulating a touch swipe:** use `locator.dispatchEvent('pointerdown' |
'pointerup', { clientX, clientY, pointerId: 1, pointerType: 'touch' })`
directly on the target cell for *both* events, rather than
`page.mouse.move/down/up`. This is deliberate, not a shortcut: real mouse
drags have no implicit pointer capture, so dragging the mouse far enough to
register as a swipe can land `pointerup` on a *different* grid cell than
the one `pointerdown` started on (since the app never calls
`setPointerCapture`); touch pointers get implicit capture in real browsers,
so dispatching both events at the same locator correctly models what an
actual touchscreen does regardless of travel distance. For tests that need
a genuine trusted trailing `click` event (e.g. testing the `onClick`
tap-fallback path specifically), use a real `locator.click()` instead —
synthetic `dispatchEvent` calls do not trigger a browser's own auto-synthesized
`click` event the way a trusted pointer sequence does.

Run with `npx playwright test` (or `npm run test:e2e`). Browsers must be
installed once via `npx playwright install chromium` (not committed/cached
in the repo).

## Build & deployment

`npm run build` runs `tsc -b && vite build`, producing a pure static
`dist/` (no server runtime required) — intended to be served as-is by
nginx per the brief. Linting is `oxlint` (`npm run lint`), configured for
zero warnings/errors as the baseline. The toolchain requires Node
`^22.22.2 || ^24.15.0 || >=26.0.0` (pinned in `.nvmrc`); npm scripts run a
guard that fails early with an `nvm use` hint on older runtimes (decision
#22). Playwright browsers are installed once with
`npx playwright install chromium` — see the E2E section above.

## Current status & what's next

This document reflects the architecture as of the end of **Stage 4** (live
draft preview). See `IMPLEMENTATION-PLAN.md`'s stage checklist for exact
per-item status; briefly, Stages 0–4 are complete (scaffolding, core
domain/storage/pages, full Picks/Cards grid editing with mouse + touch
gestures, responsive layout, the weaving-draft thread-path chart with
direction strokes/repetition control/A4 print stylesheet, and the live
preview panel fed by incremental recomputation — all with unit/fuzz/E2E
coverage). Stages 5–6 (picks optimizer, snippet library) are not yet started;
the `snippets` IndexedDB store is present but unused, reserved for those
stages.
