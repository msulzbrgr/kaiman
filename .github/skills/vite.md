# Vite skill

## Version

Vite **8** — `vite`, `@vitejs/plugin-react`

## Config

The project config is minimal. Key settings:

```ts
// vite.config.ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  // Relative base so the built static site works when served
  // from a subdirectory (e.g. GitHub Pages at /repo-name/).
  base: './',
  plugins: [react()],
})
```

Keep `base: './'` — it makes all asset paths relative so the `dist/` folder can be deployed to any URL prefix without rebuilding.

## NPM scripts

| Command | What it does |
|---|---|
| `npm run dev` | Start Vite dev server (HMR) |
| `npm run build` | `tsc -b && vite build` — type-check then bundle to `dist/` |
| `npm run preview` | Serve the last `dist/` locally |
| `npm run test:e2e` | Run Playwright against the dev server |

## TypeScript integration

Vite calls the TypeScript compiler for type-checking only during `build` (`tsc -b`). In dev mode, Vite transpiles with esbuild (fast, no type-checking). Always run `npm run build` before merging to confirm there are no type errors.

Two tsconfig files:

| File | Scope |
|---|---|
| `tsconfig.json` | `src/` — app code, strict mode, `"noEmit": true` |
| `tsconfig.node.json` | Config files (`vite.config.ts`), Node environment |

## Module resolution

`"moduleResolution": "bundler"` in `tsconfig.json` — this matches Vite's resolver. Import `.ts`/`.tsx` files without extension; Vite resolves them automatically. Do not add `.js` extensions to relative imports.

## Static assets

Place static files in `public/` — they are copied verbatim to `dist/`. Reference them with a root-relative path in code (e.g. `/logo.svg`). Since `base` is `'./'`, the path becomes relative at runtime.

## Environment variables

Prefix with `VITE_` to expose a variable to the browser bundle:

```ts
const apiUrl = import.meta.env.VITE_API_URL
```

Variables without the prefix are only available in Node (config files, not in `src/`).

## Adding a new plugin

Install the plugin package and add it to the `plugins` array in `vite.config.ts`:

```ts
import inspect from 'vite-plugin-inspect'

export default defineConfig({
  base: './',
  plugins: [react(), inspect()],
})
```

## Build output

`npm run build` produces:

```
dist/
  index.html
  assets/
    index-<hash>.js
    index-<hash>.css
```

All assets are content-hashed for long-term caching. The GitHub Pages workflow uploads the entire `dist/` folder as a Pages artifact.
