# diy-shed

A locally-hosted web app that helps you decide **which DIY project to tackle next**. Add the projects you want to do around the house — diy-shed researches each one on the web (via your existing [Claude Code](https://claude.com/claude-code) install, **no API key needed**), works out the tools and materials required, compares that against what you already own, and ranks your projects by **effort and out-of-pocket cost**. Everything is stored in a local SQLite file; nothing leaves your machine except the web searches Claude runs during research.

## Prerequisites

- **[Node.js](https://nodejs.org) LTS, v20 or newer.**
- **[Claude Code CLI](https://claude.com/claude-code) installed and logged in** — used for the automated research step. Verify with `claude --version`, and sign in with `claude login` (or generate a headless token, see [Configuration](#configuration)).

Research **degrades gracefully if the CLI is absent** (FR2.4): the app is still fully usable — you just fill in each project's tools, materials, and effort by hand instead of having them researched for you. A dismissible banner appears in the UI when the CLI can't be found.

## Setup

```bash
git clone https://github.com/hearn1/diy-shed.git
cd diy-shed
npm install
npm run dev
```

`npm run dev` runs the API server (`http://localhost:3000`) and the Vite dev server (`http://localhost:5173`) together. **Open the Vite URL, [http://localhost:5173](http://localhost:5173)** — its `/api` calls are proxied to the server.

### Production

```bash
npm start
```

This builds the client and serves both the built UI and the API from a single port at [http://localhost:3000](http://localhost:3000) (client routes work on refresh via an SPA fallback).

### Desktop app (Electron)

An **alternative** to the `npm run dev` / `npm start` flow above (which stays the primary supported path): diy-shed can be packaged as a double-click desktop app that boots the same Express backend in-process and opens it in a native window.

- **Run it locally** (against a fresh build): `npm run electron`. This builds the client, rebuilds the native `better-sqlite3` module for Electron's ABI (`npm run electron:rebuild`), then launches the window.
- **Build an unpacked app** for a local smoke test: `npm run pack:electron` (output under `dist-electron/`).
- **Build installers** (Windows `nsis`, macOS `dmg`, Linux `AppImage`): `npm run dist:electron`.

Notes:

- It still uses your local **`claude` CLI** for automated research (same as the web flow). Manual entry of tools, materials, and effort works without it.
- Data is stored in the OS **per-user data directory** (via Electron's `userData` path), **not** the repo's `data/` folder — so the desktop app and the `npm run dev` flow keep separate databases.
- **Native module ABI**: `npm run electron` builds `better-sqlite3` for Electron, whereas the Node server (`npm run dev` / `npm start`) and `npm test` need it built for Node. After running the desktop app, run `npm rebuild better-sqlite3` (or `npm install`) before going back to the Node flows. The packaged installers (`pack:electron` / `dist:electron`) handle this rebuild automatically.

## Testing

```bash
npm test
```

Runs the server test suite then the client test suite (both use Vitest). To run one side only:

```bash
npm -w server run test
npm -w client run test
```

## Features

- **Projects + async research** — add a project and diy-shed spawns the Claude CLI headlessly to search the web for guides and extract the required tools, materials, cost estimates, and effort level. Research runs in the background with a status of `Researching → Ready` (or `Research Failed`, which you can re-run or fill in manually).
- **Inventory** — track the tools and materials you already own.
- **"I have this" / fuzzy matching** — researched items are matched against your inventory automatically; you can confirm, override, or manually link/unlink a match.
- **Gap analysis & out-of-pocket cost** — for each project, see what you're missing and what it will actually cost you to buy.
- **Ranked home screen + effort-vs-cost slider** — projects are ranked by a weighted score of effort and cost (scaled by priority); a single slider trades off how much you weight effort vs. cost.
- **Completion reconciliation** — when you mark a project Done, diy-shed offers to add any reusable tools you bought to your inventory (materials are consumed, not re-added).

## Configuration

Copy `.env.example` to `.env` at the repo root to override defaults. **All variables are optional** — running without a `.env` uses the defaults below.

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `3000` | Port the production server (`npm start`) listens on. |
| `DIYSHED_DB` | `<repo-root>/data/diy-shed.db` | Absolute path to the SQLite database file. |
| `DIYSHED_CLIENT_DIST` | `<repo-root>/client/dist` | Directory of the built client to serve in production. |
| `DIYSHED_RESEARCH_TIMEOUT_MS` | `300000` (5 min) | Max time a single Claude CLI research run may take before it's killed. |
| `DIYSHED_RESEARCH_CONCURRENCY` | `1` (capped at `2`) | Max concurrent research jobs in the in-process queue. |
| `DIYSHED_CLAUDE_BIN` | auto-discovered | Force a specific Claude CLI binary. Resolution order: this override → `claude` on `PATH` → the newest binary bundled with the Claude desktop app. |
| `CLAUDE_CODE_OAUTH_TOKEN` | _(none)_ | Long-lived token (`claude setup-token`) so research runs without an interactive login. Without valid auth, research fails as "Not logged in". |

## Data & privacy

All data lives in a **single SQLite file under `data/`** (gitignored and auto-created on first run). There's no cloud, no account, and no telemetry — **deleting the `data/` folder deletes everything**. The only thing that ever leaves your machine is the web searches Claude runs during a project's research step.

## Troubleshooting

- **"Claude Code CLI not found" banner** — the app couldn't locate a working `claude` binary, so automated research is disabled (manual entry still works). To fix: install the [Claude Code CLI](https://claude.com/claude-code), run `claude login`, and make sure `claude` is on your `PATH` (`claude --version` should succeed). If it lives somewhere unusual, point `DIYSHED_CLAUDE_BIN` at it. Restart `npm run dev` afterward.
- **Research fails as "Not logged in"** — the CLI was found but isn't authenticated. Run `claude login`, or set `CLAUDE_CODE_OAUTH_TOKEN` in `.env` for headless auth.

## More

See [requirements.md](requirements.md) for the full spec and milestone roadmap, and [design/README.md](design/README.md) for the home-screen visual design.
