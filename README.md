# TWINE — Tablet Weaving INteractive Editor

TWINE is a browser-based editor for **tablet weaving patterns** in the GTT
format. Create and edit patterns, simulate the resulting weaving draft, and
print it on A4 — entirely in your browser, with no account and no server-side
storage.

**Official version: [https://twine.haimi.de](https://twine.haimi.de)**

## Features

- **Pattern library** — create, rename, clone, delete and search locally stored
  patterns; import `.gtt` files via file picker or drag & drop; download
  patterns as valid GTT XML.
- **Pattern configuration** — 16-slot palette with colour picker, card count
  (up to 140), holes per card, S/Z threading, hole colour assignment through
  a palette picker, and named packs with application order.
- **Picks editor** — a card/pick grid with cell actions (Idle, Turn F/B with
  one or two holes, Twist), Card-level and Pack-level rows, and mouse/touch
  gestures (tap to cycle, swipe up/down to turn, swipe sideways to twist).
- **Weaving draft** — a thread-path chart in the style of the classic Aisling
  draft: colour fills, direction strokes (`\`, `/`, `|`), per-cell action
  labels (`F`, `F2`, `B`, `B2`, `.`), pick-numbered rows, 1–4 repetitions with
  separators, and a live preview beside the picks grid.
- **A4 printing** — selectable common page margins (0/10/20/25/30 mm) and a
  print stylesheet that hides all app chrome.
- **Privacy** — everything runs client-side; patterns are stored in IndexedDB
  and nothing is uploaded or tracked.

## Technology

React + TypeScript, built with Vite; Zustand for state, `idb` for IndexedDB,
React Router for navigation. Testing uses Vitest + fast-check for unit/fuzz
tests and Playwright for browser tests (desktop and touch-emulated mobile).

The production build is a static `dist/` folder that can be served as-is by
nginx — no backend required.

## Getting started

TWINE requires Node.js `^22.22.2 || ^24.15.0 || >=26.0.0` (24.18.0 is pinned
in `.nvmrc`). The npm scripts check the version and print a hint if it is too
old.

```bash
nvm use                 # select the pinned Node version
npm install
npm run dev             # development server
```

To install the browsers needed for e2e tests once:

```bash
npx playwright install chromium
```

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Start the Vite development server |
| `npm run build` | Type-check and build the static `dist/` output |
| `npm run preview` | Serve the production build locally |
| `npm run lint` | Run oxlint |
| `npm test` | Run unit and fuzz tests |
| `npm run test:coverage` | Run unit tests with a V8 coverage report |
| `npm run test:e2e` | Run Playwright tests on desktop and mobile Chromium |

## Project structure

```
src/
├── domain/       # Pure GTT/business logic (model, parser, serializer,
│                 #   colour codec, simulation, draft rendering)
├── storage/      # IndexedDB repositories
├── state/        # Zustand stores
├── hooks/        # React bindings for incremental draft computation
├── components/   # Shared UI (draft chart, palette picker, footer)
├── pages/        # Pattern selection, Edit pattern, Weaving draft
├── styles/       # Global styles and theme tokens
└── app/          # Router setup
tests/unit/       # Vitest + fast-check (mirrors src/)
tests/e2e/        # Playwright specs
docs/ARCHITECTURE.md  # Architecture and data-flow documentation
```

## Roadmap

Planned for later stages: a picks optimizer (twist detection and inversion
with a visual-change threshold, undoable), and a pattern snippet library.

## Support

TWINE is free, shows no ads and collects no data. If you find it useful, you
can [buy me a coffee](https://www.paypal.me/tungavp).

## License

MIT — see [LICENSE](LICENSE).
