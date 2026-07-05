# Copilot Instructions

## Project overview

**kaiman** is a browser-only sports-schedule planning app for ice-hockey teams. It is a Vite + React 19 + TypeScript SPA that stores all data locally in the browser via IndexedDB (Dexie). There is no backend, no authentication, and no network data layer. The UI language is German.

## Tech stack

| Layer | Library / tool |
|---|---|
| Framework | React 19 + TypeScript 6 (strict) |
| Build | Vite 8 |
| Database | Dexie 4 (IndexedDB) + dexie-react-hooks 4 |
| Calendar | FullCalendar 6 (daygrid, timegrid, list, multimonth, interaction plugins) |
| Date utilities | date-fns 4 |
| Excel import | read-excel-file 9 |
| E2E tests | Playwright (chromium only) |
| Deployment | GitHub Pages (static, `dist/`) |

## Architecture

```
src/
  db/           # Dexie schema (db.ts), entity types (types.ts), repo helpers (repo.ts), backup
  features/     # One folder per UI page (schedule, teams, people, sources, settings)
  import/       # Pluggable importer system (SourceImporter interface, registry, parsers)
  lib/          # Pure utility functions (normalize, nameParse, dateParse)
  components/   # Shared UI primitives
  App.tsx       # Root: tab-based navigation with useState<Tab>
  main.tsx      # Entry point
```

## Coding conventions (reverse-engineered)

### TypeScript

- **Strict mode** is always on: `strict`, `noUnusedLocals`, `noUnusedParameters`, `noFallthroughCasesInSwitch`.
- Prefer `type` imports: `import type { Foo } from '…'` for type-only symbols.
- Avoid `as any`; cast through a precise intermediate type instead.
- Use `satisfies` to validate object literals against a type without widening (see `SCHEDULE_FIELDS … as const satisfies …`).
- All date/time values stored and passed as ISO 8601 strings (`string | null`). Convert to/from `Date` at the boundary only.
- Normalised dedup keys are always lowercase, single-spaced strings produced by `normKey()`.

### React

- Functional components with named exports from feature files; `default export` for page components.
- No routing library — navigation is a `useState<Tab>` in `App.tsx`.
- No global state library — use local `useState`/`useReducer` + Dexie reactive queries.
- Use `useMemo` for derived data that is expensive to recompute (e.g., map lookups, filtered event lists).
- Avoid `useEffect` for data fetching; use `useLiveQuery` from dexie-react-hooks instead.
- Inline styles only for one-off layout tweaks (e.g., `style={{ flex: 1 }}`). Prefer CSS classes defined in `index.css`.
- CSS custom properties (`--border`, `--muted`, etc.) for design tokens.

### Dexie / database

- The single Dexie instance is `db` exported from `src/db/db.ts`.
- All DB writes go through `src/db/repo.ts` helpers or direct `db.table.method()` calls inside feature components.
- Use compound indexes (`[a+b]`) for multi-column lookups.
- Wrap multi-step mutations in `db.transaction('rw', …)`.
- Every entity type is defined in `src/db/types.ts`; `id` is always `number | undefined` (auto-increment).
- `useLiveQuery(query, deps, defaultValue)` — always provide a default value (`[]` or `undefined`) as the third argument.

### Import system

- New file formats implement the `SourceImporter` interface (`kind`, `label`, `detect()`, `parse()`).
- Registered in `src/import/registry.ts`.
- `detect()` does a fast, synchronous heuristic check on `fileName` and text content.
- `parse()` returns `ImportResult` with `events`, `teamNames`, and `peopleNames`.
- `sourceKey` (stable merge key) format: `date|teamNameKey|startTime`.
- Re-importing the same file (same `kind` + `fileName`) updates existing events instead of duplicating.

### CSS / styling

- All CSS is in `src/index.css`; no CSS modules, no CSS-in-JS.
- BEM-like class names for components (e.g., `schedule-main-lower--collapsed`).
- Responsive breakpoints handled in JS via `window.innerWidth` and debounced `resize` listeners.

### Testing

- E2E tests live in `tests/`, test fixtures in `tests/fixtures/`.
- Run with `npm run test:e2e` (Playwright, chromium, `http://127.0.0.1:4173`).
- The dev server (`npm run dev`) is reused locally; a fresh server is started in CI.

### Build & deploy

- `npm run build` — runs `tsc -b && vite build` into `dist/`.
- `base: './'` in `vite.config.ts` so the static site works from any URL path.
- Deployed to GitHub Pages via `.github/workflows/static.yml` on every push to `main`.

## Skills references

Detailed library-specific guidance lives in `.github/skills/`:

- [`react-typescript.md`](skills/react-typescript.md) — React + TypeScript patterns used in this project
- [`dexie.md`](skills/dexie.md) — Dexie IndexedDB patterns
- [`fullcalendar.md`](skills/fullcalendar.md) — FullCalendar integration patterns
- [`vite.md`](skills/vite.md) — Vite build & config patterns
- [`playwright.md`](skills/playwright.md) — Playwright E2E test patterns
