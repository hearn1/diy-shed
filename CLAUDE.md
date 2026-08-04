# CLAUDE.md

Guidance for Claude Code working in this repository.

## What this is

diy-shed is a **local-first desktop/web app that helps a homeowner decide which DIY project to tackle next**. The user adds projects; an AI CLI researches each one on the web to produce a summary, guide links, an effort estimate, and a tools/materials list; the app compares that list against the inventory the user already owns and ranks projects by effort and out-of-pocket cost. All data lives in a local SQLite file. Nothing leaves the machine except the web searches the AI CLI performs.

The app is feature-complete through project research, ranking, gap analysis, completion reconciliation, Electron packaging, and multi-provider AI setup (v0.5.0). [requirements.md](requirements.md) holds the original spec, but it predates the provider work — **trust the code over requirements.md** where they disagree.

## Commands

npm workspaces: `server`, `client`, `electron`. Node >= 20.

- `npm install` — installs all workspaces.
- `npm run dev` — server (`:3000`) + Vite (`:5173`) concurrently. **Open the Vite URL**; `/api` is proxied.
- `npm start` — builds the client, then serves UI *and* API from `:3000` (SPA fallback).
- `npm run build` — client production build only.
- `npm test` — server tests then client tests (both Vitest).
- `npm -w server run test` / `npm -w client run test` — one side.
- `npm -w server run test -- projects` — single file by name filter. Same for client.
- `npm run electron` — build + `electron-rebuild` for better-sqlite3 + launch the desktop shell.

Verify changes with `npm test` **and** `npm run build`.

## Architecture

### Server (`server/`) — Express 4 + better-sqlite3, ESM

- `src/app.js` builds and exports the Express app with no listener; `src/server.js` exposes `startServer()`; `src/index.js` is the CLI entrypoint and imports `./env.js` **first** (dotenv from repo root). Tests import `app.js` directly — keep the build/listen split.
- `src/db/index.js` opens the database **at module-import time** and exports a singleton `db`. The path comes from `process.env.DIYSHED_DB`, read at import, which is why every server test sets that env var *before* importing `app.js`. better-sqlite3 is **synchronous** — never `await` a `db` call.
- `src/db/schema.js` is the only schema definition. It runs `CREATE TABLE IF NOT EXISTS` on every open and uses an `ensureColumn()` helper for **additive-only** migrations of existing tables. There is no migration framework, no version table, no down-migrations. New tables go in the `db.exec` block; new columns on existing tables go through `ensureColumn`.
- Tables: `projects`, `inventory`, `project_items`, `guides`, `settings` (a plain key/value table).
- Routers under `/api`: `projects`, `projects/:projectId/items` (mounted with `mergeParams: true`), `inventory`, `settings`, plus a `GET /api/health`. Routers are deliberately thin: validate → prepared statement → JSON. `PUT` handlers build partial updates from an explicit allow-list of columns rather than spreading the body.
- If `client/dist` exists (override with `DIYSHED_CLIENT_DIST`), `app.js` serves it statically with a `*` SPA fallback that skips `/api/*`.

### Client (`client/`) — React 18 + Vite + react-router-dom v6

- Routes are declared in `src/App.jsx`; every page renders inside `<Layout>`. Pages: Home (ranked list + effort/cost slider), ProjectForm (new and edit share one component), ProjectDetail, Inventory, Setup (first-run AI wizard), Settings.
- `src/api/client.js` is the **only** fetch layer: generic `get/post/put/del` that throw `Error(data.error)` on non-2xx and return `null` for 204, plus named helpers for specific endpoints. Add new endpoints as named helpers here; never call `fetch` from a component.
- No state library and no CSS framework — component state plus hand-written CSS in `src/index.css`. Pages that wait on background work (research) poll on a 4s interval while status is `researching`.

### Research (`server/src/research/`) — provider-neutral

This is the most load-bearing abstraction in the repo.

- `runner.js` owns the whole lifecycle and knows nothing about any specific CLI: build the prompt (`prompt.js`) → resolve the selected provider → `provider.run(prompt)` → validate the returned JSON (`schema.js`) → persist in one transaction. On failure it retries **once**, then sets `status='research_failed'` with `research_error`.
- `providers/` holds the registry and the implementations. A provider is a plain object `{ id, label, resolveBin, isAvailable, run }`; `run` returns `{ ok: true, json }` or `{ ok: false, error }` and **never throws**. `contract.js` documents the shape; `contract.shared.js` is a **shared test suite every provider must pass** — a new or changed provider behaviour belongs there, not duplicated per provider.
- Two providers exist: `claude.js` and `gemini.js`. Anything that changes what research produces belongs in the provider-neutral layer (`prompt.js`, `schema.js`, `runner.js`) so both providers get it. **Adding behaviour to one provider only is a defect.**
- **No silent default provider.** The choice is stored in `settings.ai_provider`; unset means "not configured", and research fails fast rather than guessing. `selection.js` reads/writes it; `health.js` reports the selection plus per-provider availability.
- Research runs through a small concurrency-capped queue (`queue.js`), fire-and-forget from the route, so `POST /api/projects/:id/research` returns `202` immediately and the client polls.

## Invariants worth knowing before you change anything

- **Research replaces only what research created.** The persist transaction deletes `project_items WHERE source='research'` and all `guides` for the project, then reinserts. Rows with `source='manual'` and any user-set `inventory_id` survive a re-run. Preserving user-authored data across re-runs is a deliberate product rule, not an accident — hold that line for anything new that research produces.
- **Enums live in three places** and must be changed together: the SQL `CHECK` constraint in `schema.js`, the bare arrays in `server/src/util/validate.js`, and the `{value, label}` lists in `client/src/constants.js` (with `labelFor()` for display).
- **Project statuses** are `researching`, `ready`, `in_progress`, `done`, `research_failed`. `in_progress` is defined in the schema, the validators, and the UI labels, but nothing in the app currently transitions a project into it — today it is only reachable via `PUT /api/projects/:id`.
- **Tools and materials differ at completion.** `GET /api/projects/:id/completion-review` returns only *unowned tools*; `POST /api/projects/:id/complete` takes `add_item_ids`, adds those tools to inventory via `util/ownership.js`, and sets `status='done'` — all in one transaction. Materials are consumed and must never be auto-suggested for inventory. Route completion through this existing flow rather than re-implementing it.
- **Ownership** is either an explicit `inventory_id` link or a fuzzy token-subset match on `normalized_name` (`util/match.js`); `match_override='ignore'` suppresses matching. Always populate `normalized_name` (`util/normalize.js`) on any write to `project_items` or `inventory`.
- **Ranking**: `final_score = base_score / priority_weight`, sorted **ascending** — a divisor, not a multiplier. The effort/cost weighting is a single slider: only `w_effort` is stored; `w_cost = 1 - w_effort`.

## Tests

- Vitest everywhere. Unit tests are **colocated** next to the module (`foo.js` → `foo.test.js`); route/integration tests using supertest live in `server/test/`. Client tests use jsdom + Testing Library and assert user-visible behaviour, not implementation details.
- Server integration tests set `process.env.DIYSHED_DB` to a temp file *before* importing `app.js` — copy that pattern from any file in `server/test/`.
- Baseline on a clean checkout: server 173 tests / 22 files, client 63 tests / 12 files, all passing; `npm run build` succeeds.

## Electron

`electron/main.js` imports `server/src/server.js` **in-process** on a random port and points the window at it, setting `DIYSHED_DB` to the per-user `userData` dir and `DIYSHED_CLIENT_DIST` into `app.asar`. Consequences: don't assume repo-root-relative paths at runtime, don't spawn a second server, and remember native modules need `electron-rebuild`.

## Design

The home screen visual language is fixed by [design/home-concepts.html](design/home-concepts.html) (direction 1a, "Workshop Ledger"), documented in [design/README.md](design/README.md): Bitter headings / Karla body, warm-cream + dark-brown + amber/rust OKLCH palette. Match the existing CSS in `client/src/index.css` rather than introducing a new styling approach.
