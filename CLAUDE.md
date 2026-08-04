# CLAUDE.md

Comprehensive guidance for Claude Code working in this repository. It describes the repository **as it is today** (v0.5.0). Where [requirements.md](requirements.md) disagrees with this document or with the code, the code wins — requirements.md is the original spec and predates several shipped changes.

---

## 1. Product

diy-shed is a **local-first application that helps a homeowner decide which DIY project to tackle next**, and then actually get it done.

The loop:

1. The user adds a project (name + free-text description).
2. An AI CLI installed on the user's own machine researches it on the web and returns a summary, 1–5 guide links, an effort estimate (level / hours / skill), and lists of required **tools** and **materials** with rough costs.
3. The app compares those tools and materials against the **inventory** of things the user already owns, and computes what is missing and what it would cost out of pocket.
4. Projects are ranked by a weighted combination of effort and out-of-pocket cost, divided by a priority weight.
5. When a project is finished, the app reconciles reusable tools back into inventory.

Design constraints that shape everything:

- **Local-first.** All data lives in one SQLite file on the user's machine. There is no backend service, no account, no telemetry. The only network traffic is the web searches the AI CLI performs.
- **No API keys.** Research runs by spawning the user's already-installed, already-signed-in AI CLI as a child process. If no CLI is present, the app degrades to a fully usable manual-entry app.
- **Single user.** There is no auth, no multi-tenancy, no concurrent-writer story. Prepared statements run synchronously against a local file.

### Shipped feature set

Projects CRUD · inventory CRUD · project item (tool/material) CRUD · AI research with retry and failure states · guide links · gap analysis and cost rollup · priority-weighted ranking with a live effort-vs-cost slider · fuzzy inventory matching with manual override · project completion with tool reconciliation · first-run AI setup wizard · provider settings screen · provider-aware health banner · Electron desktop packaging.

---

## 2. Repository layout

```
/
├── package.json               root workspace: scripts, shared deps, electron config
├── electron-builder.yml       packaging config
├── requirements.md            original spec (partly superseded — see §1)
├── README.md, CHANGELOG.md
├── .env.example               documented environment variables
├── design/
│   ├── README.md              design language write-up
│   └── home-concepts.html     interactive mockup; direction 1a "Workshop Ledger" is canon
├── electron/
│   ├── main.js                desktop shell: starts the server in-process
│   ├── preload.js
│   └── build/                 icons
├── server/
│   ├── package.json
│   ├── test/                  route/integration tests (supertest)
│   └── src/
│       ├── index.js           CLI entrypoint (imports env.js first, then listens)
│       ├── server.js          startServer({ port }) → { server, port }
│       ├── app.js             builds the Express app, no listener
│       ├── env.js             dotenv load + tunables
│       ├── db/
│       │   ├── index.js       opens the DB at import, exports singleton
│       │   └── schema.js      the entire schema + additive migrations
│       ├── routes/            projects, projectItems, inventory, settings
│       ├── research/          provider-neutral research pipeline (see §6)
│       ├── ranking/           gap.js (ownership/cost), score.js (ranking)
│       └── util/              validate, normalize, match, ownership
└── client/
    ├── package.json
    ├── vite.config.js         /api dev proxy + Vitest jsdom config
    └── src/
        ├── main.jsx, App.jsx  entry + route table
        ├── index.css          all styling (hand-written, no framework)
        ├── constants.js       client-side enum lists + labelFor()
        ├── providerMeta.js    provider UI copy + status derivation
        ├── api/client.js      the only fetch layer
        ├── components/        Layout, ProviderPicker, ProviderStatus
        └── pages/             Home, ProjectForm, ProjectDetail, Inventory, Setup, Settings
```

---

## 3. Commands

npm workspaces: `server`, `client`, `electron`. Node >= 20 (`engines`).

| Command | What it does |
| --- | --- |
| `npm install` | Installs all workspaces from the root. |
| `npm run dev` | Runs the API (`:3000`) and the Vite dev server (`:5173`) concurrently. **Open the Vite URL** — it proxies `/api` to the server. |
| `npm start` | `npm run build` then serves the built client *and* the API from `:3000` on one port. |
| `npm run build` | Client production build only (`client/dist`). |
| `npm test` | Server tests, then client tests. Both Vitest. |
| `npm -w server run test` | Server only. |
| `npm -w client run test` | Client only. |
| `npm -w server run test -- projects` | Single server test file by name filter (Vitest positional). Same pattern client-side. |
| `npm -w server run dev` | Server alone under `node --watch`. |
| `npm run electron` | Build + `electron-rebuild` for better-sqlite3 + launch the desktop shell. |
| `npm run pack:electron` / `npm run dist:electron` | Unpacked dir / full installer via electron-builder. |

**Verification for any change: `npm test` and `npm run build` must both pass.**

### Environment variables

| Variable | Effect |
| --- | --- |
| `DIYSHED_DB` | SQLite file path. Read **at import time** in `db/index.js`; defaults to `<repo>/data/diy-shed.db`. |
| `DIYSHED_CLIENT_DIST` | Override the static client dir served by `app.js`. |
| `DIYSHED_CLAUDE_BIN` / `DIYSHED_GEMINI_BIN` | Explicit CLI paths, highest priority in binary resolution. |
| `DIYSHED_RESEARCH_TIMEOUT_MS` | Per-research-call timeout; default 300000. |
| `DIYSHED_RESEARCH_CONCURRENCY` | Research queue width; clamped to 1–2, default 1. |
| `DIYSHED_PACKAGED` | Set by the Electron shell; makes binary resolution probe the login-shell PATH. |
| `PORT` | Server listen port when not passed explicitly. |

`server/src/env.js` loads the **repo-root** `.env` via dotenv and must be imported before anything reads these — `src/index.js` does this first.

---

## 4. Server architecture

### Entrypoints and the build/listen split

`app.js` builds and exports the Express app **without calling `listen`**. `server.js` wraps it in `startServer({ port })` returning `{ server, port }` (port `0` picks a free one — Electron relies on this). `index.js` is the CLI entrypoint: it imports `./env.js` first, then starts the server. Tests import `app.js` directly and drive it with supertest. **Preserve this split** — both the test suite and the Electron shell depend on it.

`app.js` mounts, in order:

- `GET /api/health` → `research/health.js`
- `/api/projects` → `routes/projects.js`
- `/api/projects/:projectId/items` → `routes/projectItems.js` (`Router({ mergeParams: true })`)
- `/api/inventory` → `routes/inventory.js`
- `/api/settings` → `routes/settings.js`

Then, **only if the client dist dir exists**, `express.static(distDir)` plus a `*` SPA fallback that calls `next()` for `/api/*`. This is why `npm start` works on a single port. (Express 4 — `*` is a valid path here; do not upgrade to Express 5 semantics casually.)

### Database

`db/index.js` opens the database **at module-import time** and exports a singleton. `openDb(path)` creates the parent directory, sets `journal_mode = WAL` and `foreign_keys = ON`, then runs `initSchema(db)`.

Two consequences that bite people:

1. The DB path is captured from `process.env.DIYSHED_DB` **at import**, so every server test sets that env var *before* importing `app.js` or any router.
2. better-sqlite3 is **synchronous**. `db.prepare(...).get()/all()/run()` return values directly. Never `await` them, and never wrap them in promises for style.

Transactions use `db.transaction(fn)` which returns a callable — note that it must be **invoked**: `db.transaction(fn)()`.

### Schema and migrations

`db/schema.js` is the single source of truth. There is **no migration framework, no version table, and no down-migrations.** The strategy is:

- New tables: add a `CREATE TABLE IF NOT EXISTS` to the `db.exec` template. It runs on every open, so existing databases pick it up.
- New columns on existing tables: use the `ensureColumn(db, table, column, definition)` helper at the bottom, which checks `PRAGMA table_info` and issues an `ALTER TABLE ... ADD COLUMN` when missing. This is **additive only** — a column added this way cannot have a `CHECK` retrofitted onto an existing table, which is why `project_items.source` and `match_override` are enforced in application code rather than SQL.
- Seed rows go through `INSERT OR IGNORE`.

Current tables:

**`projects`** — `id`, `name`, `description` (default `''`), `status` (`CHECK` in `researching|ready|in_progress|done|research_failed`, default `ready`), `priority` (`CHECK` in `urgent_fix|highly_desired|slightly_desired|dreams`, default `slightly_desired`), `effort_level` (`Low|Medium|High`), `effort_hours` REAL, `skill_level` (`Beginner|Intermediate|Advanced`), `research_summary`, `research_error`, `research_provider`, `researched_at`, `created_at`.

**`inventory`** — `id`, `name`, `normalized_name`, `type` (`tool|material`), `quantity`, `notes`, `created_at`.

**`project_items`** — `id`, `project_id` (FK → `projects` `ON DELETE CASCADE`), `name`, `normalized_name`, `type` (`tool|material`), `est_cost` REAL, `source` (`manual|research`, default `manual`), `match_override` (`auto|ignore`, default `auto`), `inventory_id` (FK → `inventory` `ON DELETE SET NULL`).

**`guides`** — `id`, `project_id` (FK, cascade), `title`, `url`, `summary`.

**`settings`** — plain `key`/`value` TEXT store. Seeded with `w_effort=0.5`, `w_cost=0.5`. Also holds `ai_provider`. Values are strings; callers coerce. Adding a setting means adding a key, not a column.

### Route conventions

Routers are deliberately thin: **validate → prepared statement → JSON**. There is no service layer, no ORM, no DTO mapping. Patterns to follow:

- Validation uses the bare enum arrays from `util/validate.js` via `isValidEnum(value, allowed)`.
- `PUT` handlers build a partial update from an **explicit allow-list** of columns (`if ('name' in body) { ... }`, or the `UPDATABLE` map in `routes/projects.js`). Never spread `req.body` into SQL.
- Errors are `res.status(4xx).json({ error: 'message' })` — a single `error` string, which the client's fetch wrapper turns into `Error.message`.
- `204` with `.end()` for deletes; `201` with the created row for creates; `202` for accepted-but-async work.
- Rows are returned as-is from SQLite (snake_case), with derived data attached alongside (e.g. `{ ...row, guides, gap }`).

### Route inventory

**`/api/projects`**
- `GET /` — all projects, newest first.
- `GET /ranked` — non-`done` projects with `est_cost` / `missing_count` attached, ranked; accepts `?w_effort=` to preview a weighting without persisting it.
- `GET /:id` — project + `guides` + `gap` (`{ est_cost, missing_count, items[] }`).
- `POST /` — create. Kicks off research asynchronously **unless** an explicit `status` was supplied or `?research=false`, and only when the selected provider is available. Returns `201` immediately.
- `PUT /:id` — partial update over the `UPDATABLE` allow-list (`name`, `description`, `status`, `priority`, `effort_level`, `effort_hours`, `skill_level`).
- `DELETE /:id`
- `POST /:id/research` — re-run research; sets `status='researching'`, enqueues, returns `202`.
- `GET /:id/completion-review` — the **unowned tools** for this project.
- `POST /:id/complete` — body `{ add_item_ids }`; validates each id is a tool of this project, adds unowned ones to inventory, sets `status='done'`, all in one transaction.

**`/api/projects/:projectId/items`** — `GET /`, `POST /`, `PUT /:itemId`, `DELETE /:itemId`, plus `POST /:itemId/own` (link/create inventory row, `match_override='auto'`) and `POST /:itemId/unlink` (clear `inventory_id`, set `match_override='ignore'`).

**`/api/inventory`** — `GET /`, `GET /:id`, `POST /`, `PUT /:id`, `DELETE /:id`.

**`/api/settings`** — `GET /` → `{ w_effort, w_cost, ai_provider }`; `PUT /` sets `w_effort` (0–1); `PUT /provider` sets or clears `ai_provider`.

**`/api/health`** → `{ status, selectedProvider, providers[{ id, label, available, authenticated, error }], claude: { available } }`. The top-level `claude` key is a back-compat mirror.

---

## 5. Domain logic

### Normalization and matching

`util/normalize.js` produces `normalized_name` (trim, lowercase, collapse whitespace). **Every write to `project_items` or `inventory` must populate it** — it is the basis of matching.

`util/match.js` does a token **subset** match in either direction: `"drill"` matches `"cordless drill"` and vice versa, scoped to the same `type`. Ties resolve to the lowest inventory `id`.

`ranking/gap.js` decides ownership per item, in priority order:

1. `inventory_id` is set → owned (explicit user link wins).
2. `match_override === 'ignore'` → not owned (explicit user rejection).
3. Otherwise fuzzy match against inventory.

`analyzeGap` returns `{ items (each with `owned` and `matched_inventory_id`), missing, missing_count, est_cost }` where `est_cost` sums only **missing** items' `est_cost`.

### Ranking

`ranking/score.js`. Effort maps `Low/Medium/High → 1/2/3` (unknown → 2). Then:

```
effort_norm = effortScore / 3
cost_norm   = est_cost / maxCost across the set   (0 when maxCost is 0)
base_score  = w * effort_norm + (1 - w) * cost_norm
final_score = base_score / priority_weight
```

`priority_weight`: `urgent_fix 1.0`, `highly_desired 0.75`, `slightly_desired 0.3`, `dreams 0.05`. Sorted **ascending** — lower `final_score` ranks higher. **Priority is a divisor, not a multiplier**; this is deliberate. Tie-breaks: higher priority weight, then lower cost, then lower id. `priority_weight` is stripped from the response; `rank` is added.

The effort/cost weighting is a **single slider**: only `w_effort` is stored; `w_cost` is always `1 - w_effort` and exists only for display.

### Ownership and completion

`util/ownership.js#ownProjectItem(item)` finds an inventory row with the same `type` + `normalized_name`, creates one if absent, then links the project item and resets `match_override='auto'`. It is used both by the "I have this" button and by project completion.

Completion is a two-step flow, and it exists because **tools and materials behave differently**: tools are reusable and survive the project; materials are consumed. `GET /:id/completion-review` therefore returns **only unowned tools**, and `POST /:id/complete` refuses ids that are not tools of the project. Materials are never auto-suggested for inventory.

### Project status

`researching` → `ready` → `in_progress` → `done`, with `research_failed` as the retry state.

Who sets what today:

- `researching` — set by `POST /:id/research`, by `startResearch()` on create, and again at the top of `researchProject()`.
- `ready` — set by the research persist transaction on success.
- `research_failed` — set by `fail()` in the runner, always with a `research_error` message.
- `done` — set by `POST /:id/complete`.
- `in_progress` — **defined in the schema `CHECK`, in `util/validate.js`, and in the client's `STATUSES` labels, but nothing in the application currently transitions a project into it.** It is reachable only through a manual `PUT /api/projects/:id`.

---

## 6. Research pipeline (`server/src/research/`)

This is the most load-bearing abstraction in the repository. It is **provider-neutral by design**, and keeping it that way is a hard requirement.

### Files

| File | Responsibility |
| --- | --- |
| `runner.js` | The whole lifecycle. Knows nothing about any specific CLI. |
| `prompt.js` | `buildResearchPrompt({ name, description })` — the single prompt, shared by all providers. Interpolates the enum lists so the prompt and the validator cannot drift. |
| `schema.js` | `validateResearchResult(obj)` → `{ ok, value }` or `{ ok:false, errors[] }`. Hand-written validator, no schema library. |
| `queue.js` | Tiny concurrency-capped FIFO (`createQueue`, cap clamped 1–2) with a module-level `enqueue`. |
| `selection.js` | Reads/writes `settings.ai_provider`; `isSelectedProviderAvailable(db)`. |
| `health.js` | Builds the `/api/health` payload from the registry + selection. |
| `resolveBin.js` | Cross-platform binary discovery (PATH, bundled desktop CLI, login-shell PATH augmentation when packaged). |
| `providers/index.js` | Ordered registry: `listProviders`, `getProvider`, `providerIds`, cached `getProviderAvailability`, `resetAvailabilityCache`. |
| `providers/contract.js` | JSDoc-only description of the provider shape. |
| `providers/contract.shared.js` | **Shared test suite every provider must pass.** |
| `providers/claude.js`, `providers/gemini.js` | The two implementations. |
| `providers/README.md` | How to add a provider. |
| `claudeCli.js` | Legacy thin wrapper retained for compatibility. |

### The provider contract

A provider is a plain object:

```js
{
  id,                                  // stable slug, e.g. 'claude'
  label,                               // human name shown in the UI
  resolveBin(opts) -> string,
  isAvailable(opts) -> Promise<{ available, authenticated?, error? }>,
  run(prompt, opts) -> Promise<{ ok:true, json, raw? } | { ok:false, error, raw? }>
}
```

Rules the shared suite enforces: `run` **never throws** (all failures come back as `{ ok:false, error }`), it honours `opts.timeoutMs` by killing the child and returning `{ ok:false, error:'timeout' }`, it returns the *parsed model object* on success (unwrapping each CLI's own envelope and stripping ``` fences), and `isAvailable` resolves `{ available:boolean }` even when the binary is missing. Both providers accept an injectable `spawnImpl` so tests never spawn a real process.

`authenticated` is `undefined` when a provider cannot detect sign-in (Claude reports presence only); the client treats only an explicit `false` as "signed out".

Both providers pipe the prompt over **stdin, never argv**, and use `useShellFor(bin)` — on Windows a `.cmd`/`.bat` shim can only be spawned through the shell, and an argv-borne prompt there would be a shell-injection vector.

### The lifecycle

1. A route calls `startResearch(id)`: sets `status='researching'`, clears `research_error`, and `enqueue(() => researchProject(id))` **fire-and-forget** (the promise is deliberately swallowed) so the HTTP response returns immediately. The client polls.
2. `researchProject(projectId, deps)` loads the project, re-asserts `researching`, and resolves a provider. Resolution is: `deps.provider` (test injection) → the stored `settings.ai_provider` → look it up in the registry → check `isAvailable()`. **There is no silent fallback**: unset, unknown, or unavailable each fail fast to `research_failed` with an explanatory message.
3. `attempt()` builds the prompt, calls `provider.run`, and validates the JSON. On failure the runner retries **exactly once**, then fails.
4. On success, one `db.transaction` writes everything: the project's `status='ready'`, `research_summary`, `research_provider`, effort fields, `researched_at`, cleared `research_error`; then replaces guides and research-sourced items.

### The re-run preservation rule

This is the invariant most likely to be broken by accident:

```sql
DELETE FROM guides       WHERE project_id = ?;
DELETE FROM project_items WHERE project_id = ? AND source = 'research';
```

Research **replaces only what research created.** Rows with `source='manual'` survive a re-run untouched, as do any `inventory_id` links and `match_override` values the user set. The UI warns the user before a re-run ("this replaces the current research results"). Preserving user-authored data across re-runs is a deliberate product rule — anything new that research learns to produce is expected to respect it.

`deps` injection (`{ db, provider, getProvider }`) is how `runner.test.js` exercises all of this without a CLI or a real database. Follow that pattern rather than mocking modules.

---

## 7. Client architecture

React 18 + Vite + react-router-dom v6. **No state-management library, no data-fetching library, no CSS framework, no component library.** Component-local `useState`/`useEffect` and hand-written CSS.

### Routing

`App.jsx` declares every route inside a single `<Layout>` element route: `/`, `/projects/new`, `/projects/:id`, `/projects/:id/edit`, `/inventory`, `/setup`, `/settings`. `ProjectFormPage` serves both create and edit.

`Layout.jsx` renders the header/nav/`<Outlet/>` and fetches `/api/health` once to decide whether to show a dismissible setup banner (no provider selected → `/setup`; selected provider not installed or signed out → `/settings`).

### The API layer

`api/client.js` is the **only** place `fetch` is called. It exposes generic `get/post/put/del` — which throw `new Error(data.error)` on non-2xx and return `null` for `204` — plus named helpers (`rerunResearch`, `markItemOwned`, `unlinkItem`, `getCompletionReview`, `completeProject`, `getHealth`, `getSettings`, `updateSettings`, `setProvider`, `getRankedProjects`). New endpoints get a named helper here; components never call `fetch` directly. All paths are relative `/api/...` (proxied in dev, same-origin in prod).

### Page patterns

- **Errors**: a page-level `error` string state rendered as `<p className="error">`, set from the caught `err.message`.
- **Async work**: pages that depend on research poll every 4s **only while** something is `researching`, via a `useRef` interval that is cleared in the effect's cleanup (`HomePage`, `ProjectDetailPage`).
- **Destructive actions** confirm with `window.confirm` before firing.
- **Reloading**: after a mutation, pages re-fetch (`loadProject()` / `loadItems()` / `load()`) rather than patching local state, except where a response is used directly.
- **Multi-step flows** are modeled as nullable state rather than routes — e.g. `completionTools === null` means "not in the completion review", non-null renders an inline `role="dialog"` panel with pre-checked boxes.
- **Enums** come from `constants.js` and are rendered through `labelFor(LIST, value)`; never hardcode a label.
- **Provider UI copy** lives in `providerMeta.js` (labels, install/sign-in hints, `deriveStatus`, `looksLikeProviderError`) and is shared by the wizard, Settings, and the banner so all three agree.

---

## 8. Shared conventions

- **Enums are duplicated in three places on purpose** and must change together:
  1. the SQL `CHECK` constraint in `server/src/db/schema.js`,
  2. the bare arrays in `server/src/util/validate.js` (validation),
  3. the `{ value, label }` lists in `client/src/constants.js` (display).
  Note the `ensureColumn` caveat: columns added to an existing table cannot carry a retrofitted `CHECK`, so some enums are enforced only at layers 2 and 3.
- **snake_case on the wire.** SQLite rows are serialized as-is; the client consumes `est_cost`, `effort_level`, `missing_count`, etc. Do not camelCase at the boundary.
- **ESM everywhere** (`"type": "module"` in all workspaces), with explicit `.js`/`.jsx` extensions in relative imports.
- **Comments explain *why*.** The existing codebase comments non-obvious decisions (why the prompt goes over stdin, why priority divides, why availability is cached, why a model is pinned) and leaves obvious code uncommented. Match that density.

---

## 9. Testing

Vitest in both workspaces.

- **Placement**: unit tests are **colocated** (`foo.js` → `foo.test.js`, `Page.jsx` → `Page.test.jsx`). Route/integration tests using **supertest** live in `server/test/`.
- **Server integration tests** set `process.env.DIYSHED_DB` to a temp file **before** importing `app.js`, because the DB opens at import. Copy the header of any file in `server/test/`.
- **Research tests** inject `deps` (`{ db, provider }`) into `researchProject` and `spawnImpl` into providers — no real child processes, no real CLI.
- **Provider tests** call `runProviderContractTests(makeProvider, fixtures)` from `providers/contract.shared.js` with CLI-specific stdout fixtures, then add provider-specific cases. Behaviour that all providers must share belongs in the shared suite, not copy-pasted.
- **Client tests** use jsdom + Testing Library, stub `global.fetch` or mock `api/client.js`, and assert what the user sees and can do (roles, labels, text) rather than internal state.
- **Baseline on a clean checkout**: server 22 files / 173 tests, client 12 files / 63 tests, all passing; `npm run build` succeeds. Some client tests emit React `act(...)` and React Router v7 future-flag warnings — these are pre-existing noise, not failures.

---

## 10. Electron

`electron/main.js` runs the Express server **in the main process** (`await import('../server/src/server.js')`, `startServer({ port: 0 })`) and points a `BrowserWindow` at `http://localhost:<port>`. Before starting it sets `DIYSHED_DB` to `app.getPath('userData')/diy-shed.db`, `DIYSHED_CLIENT_DIST` into the packaged app root (`client/dist` inside `app.asar`), and `DIYSHED_PACKAGED=1`. It takes a single-instance lock and closes the server on quit.

Implications for server code:

- **Never assume repo-root-relative paths at runtime.** Anything that needs a writable location must derive it from the DB path or an env var.
- **Do not spawn a second server process** or bind a fixed port.
- **better-sqlite3 is native** — it must be rebuilt against Electron's ABI (`npm run electron:rebuild`, wired into `npm run electron`).
- `resolveBin.js` augments PATH with the login-shell PATH and common install dirs when packaged, because a double-clicked GUI app on macOS/Linux inherits a minimal PATH and would otherwise not find an npm-global CLI.

---

## 11. Known pitfalls

1. **The DB opens at import time.** Any module that imports `db/index.js` (directly or transitively) triggers it. Set `DIYSHED_DB` first in tests.
2. **better-sqlite3 is synchronous.** No `await` on `db` calls. `db.transaction(fn)` returns a function you must call.
3. **`ensureColumn` is additive only.** No column drops, renames, type changes, or retrofitted constraints.
4. **Enums live in three places** (§8).
5. **Provider availability is cached per process** in `providers/index.js`. Tests that change availability must call `resetAvailabilityCache()`.
6. **Resolved binaries are memoized** per provider (`resetResolvedClaudeBin` / `resetResolvedGeminiBin` exist for tests).
7. **Research is fire-and-forget** — `enqueue(...).catch(() => {})`. A rejection there is invisible; failures must be persisted to `research_error`, not thrown.
8. **The SPA fallback is `app.get('*')`** and skips `/api/*` by prefix. A new API route mounted outside `/api` would be swallowed by it.
9. **`GET /api/projects/ranked` is declared before `GET /api/projects/:id`** — order matters, or `ranked` would be parsed as an id.
10. **The Gemini model is pinned** (`gemini-3.5-flash-lite`) for free-tier quota reasons; don't unpin it casually.
11. **Windows shell spawning**: `useShellFor(bin)` is required for `.cmd` shims; prompts must stay on stdin.
12. **`data/diy-shed.db` is gitignored** but persists between runs — stale local data can make manual testing misleading.

---

## 12. Design

The visual language is fixed by the interactive mockup [design/home-concepts.html](design/home-concepts.html) — chosen direction **1a "Workshop Ledger"** — and written up in [design/README.md](design/README.md): Bitter for headings, Karla for body, a warm-cream / dark-brown / amber-rust OKLCH palette, index-card project rows with a rank numeral, pill-shaped priority tags, and a three-segment effort bar.

All styling lives in `client/src/index.css` as plain hand-written CSS with semantic class names (`project-card`, `item-list`, `pill`, `actions`, `banner`, `empty`, `error`). Extend that file and reuse the existing classes rather than introducing CSS modules, utility frameworks, or inline style objects.
