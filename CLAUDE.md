# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

diy-shed is a locally-hosted web app that helps a homeowner decide **which DIY project to tackle next**. Users add projects; the app researches each one on the web (via the user's local Claude Code CLI, not an API key), determines required tools/materials, compares against inventory the user owns, and ranks projects by effort and out-of-pocket cost. All data lives in a local SQLite file — nothing leaves the machine except the web searches Claude runs during research.

The full spec and the milestone roadmap live in [requirements.md](requirements.md). The current state is roughly **M1 (skeleton)**: full CRUD for projects/inventory/project-items with manual entry. Claude Code research (M2), ranking/gap-analysis (M3), completion reconciliation (M4), and Electron packaging (M5) are not built yet — check requirements.md before assuming a feature exists.

## Commands

Run from the repo root (npm workspaces: `server` and `client`).

- `npm install` — installs all workspaces.
- `npm run dev` — runs server (`:3000`) and Vite dev server (`:5173`) together via `concurrently`. **Open the Vite URL** (`http://localhost:5173`); its `/api` calls are proxied to the server.
- `npm start` — production: builds the client, then serves the built UI *and* the API from `:3000` on a single port (SPA fallback for client routes).
- `npm test` — runs server tests then client tests.

Per-workspace / single-test:
- `npm -w server run test` / `npm -w client run test` — one side only (both use Vitest).
- `npm -w server run test -- projects` — run a single server test file by name filter (Vitest positional). Same pattern for client: `npm -w client run test -- HomePage`.
- `npm -w server run dev` — server alone with `node --watch`.

## Architecture

Two workspaces, one shared SQLite database.

### Server (`server/`) — Express + better-sqlite3, ESM

- [src/index.js](server/src/index.js) is the entrypoint: imports `./env.js` (which loads the repo-root `.env` via dotenv) **first**, then starts the app. [src/app.js](server/src/app.js) builds the Express app and is imported directly by tests (no listener) — keep the listen/build split.
- [src/app.js](server/src/app.js) mounts three routers under `/api` and, **if `client/dist` exists**, serves it statically with a `*` SPA fallback that skips `/api/*`. This is why `npm start` works as a single port. The dist dir can be overridden with `DIYSHED_CLIENT_DIST`.
- [src/db/index.js](server/src/db/index.js) opens the DB **at import time** and exports a singleton `db`. Routers `import db` and call `db.prepare(...)` synchronously (better-sqlite3 is sync). WAL mode and `foreign_keys = ON` are set on open. Because the DB path is read from `process.env.DIYSHED_DB` at import, tests set that env var *before* importing `app.js` (see any `server/test/*.test.js`).
- [src/db/schema.js](server/src/db/schema.js) is the single source of truth for the schema (`CREATE TABLE IF NOT EXISTS` run on every open) and seeds default ranking weights into `settings` (`w_effort`, `w_cost`). Tables: `projects`, `inventory`, `project_items`, `guides`, `settings`. Enum constraints are enforced in SQL via `CHECK`.
- Routes ([routes/projects.js](server/src/routes/projects.js), [routes/inventory.js](server/src/routes/inventory.js), [routes/projectItems.js](server/src/routes/projectItems.js)) are thin: validate → prepared statement → JSON. `projectItems` is mounted at `/api/projects/:projectId/items` with `mergeParams: true`. Validation uses enum lists from [util/validate.js](server/src/util/validate.js); PUT handlers build partial updates from an allow-list of columns.

### Client (`client/`) — React 18 + Vite + react-router-dom v6

- Routing is declared in [src/App.jsx](client/src/App.jsx); all pages render inside a shared `<Layout>`. Pages: Home, ProjectForm (new/edit share one component), ProjectDetail, Inventory.
- [src/api/client.js](client/src/api/client.js) is the only fetch layer — `get/post/put/del` helpers that throw `Error(data.error)` on non-2xx and return `null` for 204. Call these rather than `fetch` directly. Requests use relative `/api/...` paths (proxied in dev, same-origin in prod).
- [vite.config.js](client/vite.config.js) sets the `/api` → `:3000` dev proxy and the Vitest jsdom config.

### Shared conventions

- **Enums are duplicated intentionally**: [server/src/util/validate.js](server/src/util/validate.js) holds bare arrays for validation; [client/src/constants.js](client/src/constants.js) holds `{value, label}` objects plus `labelFor()` for display. When you add/change an enum value, update **both** and the `CHECK` constraint in [schema.js](server/src/db/schema.js).
- **Name normalization**: item names get a `normalized_name` via [server/src/util/normalize.js](server/src/util/normalize.js) (trim, lowercase, collapse whitespace) on insert/update — this is the basis for the future fuzzy inventory-matching (FR3.4). Keep it populated on any write to `project_items` / `inventory`.
- Every route/page/util has a colocated `*.test.js(x)` next to it; add tests in the same place.

## Domain model notes (from requirements.md)

- **Priority uses a divisor, not a multiplier**, in the ranking formula: `final_score = base_score / priority_weight`, lower ranks higher (weights: Urgent Fix `1.0`, Highly Desired `0.75`, Slightly Desired `0.3`, Dreams `0.05`). This is deliberate — see FR5.4.
- The effort/cost weight is a **single slider**: only `w_effort` is meaningful; `w_cost = 1 − w_effort`.
- **Tools vs materials differ at completion**: tools are reusable (offer to add to inventory when a project is Done), materials are consumed (never auto-suggested). See FR7.
- Claude research (M2) will spawn `claude -p ... --allowedTools WebSearch,WebFetch --output-format json` as a child process — **no filesystem/shell tools granted**, schema-validated response, one retry then `research_failed`. It must degrade gracefully when the CLI is absent.
- Research is now **provider-pluggable** (M6): the runner selects a provider (Claude or free Gemini) behind a common interface in [server/src/research/providers/](server/src/research/providers/). There is **no silent default** — the provider is stored in `settings.ai_provider` and chosen via the first-run wizard / Settings screen.

## Design

The home screen visual design is fixed by an interactive mockup: [design/home-concepts.html](design/home-concepts.html) (chosen direction: **1a "Workshop Ledger"**), documented in [design/README.md](design/README.md). Type: Bitter (headings) / Karla (body); warm-cream + dark-brown + amber/rust OKLCH palette. Match this when building UI.
