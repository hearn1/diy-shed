# diy-shed — Requirements

A locally-hosted web app that helps homeowners decide **what DIY project to tackle next**. Users add projects they want to complete around the house; the app researches each project on the web, figures out what tools and materials are needed, compares that against what the user already owns, and ranks projects by effort and out-of-pocket cost.

## Goals

- **Zero-friction local setup**: clone from GitHub, `npm install`, `npm run dev`, open a browser. No cloud services, no accounts, no API keys.
- **Reuse Claude Code for intelligence**: all web research and parsing is delegated to the locally-installed Claude Code CLI (`claude -p` headless mode), which runs on the user's existing Claude Code subscription. The app itself never needs an Anthropic API key.
- **Local-first data**: everything is stored in a local SQLite database file. Deleting the folder deletes everything.

## Non-Goals

- Multi-user support, authentication, or hosting on the public internet.
- Real-time price lookups from specific retailers (cost estimates are approximate, produced during research).
- Managing project execution (task checklists, scheduling). This is a *prioritization* tool, though this could be a future direction.

---

## Functional Requirements

### FR1 — Project Management
- **FR1.1**: User can add a project with a name and free-text description (e.g., "Replace the bathroom faucet", "Build raised garden beds").
- **FR1.2**: User can view, edit, and delete projects.
- **FR1.3**: Each project has a status: `Researching` → `Ready` (research complete) → `In Progress` → `Done` (plus `Research Failed` for retry).
- **FR1.4**: User can manually override any researched field (effort level, tool/material list, cost estimates) if the automated research got it wrong.

### FR2 — Automated Research (Claude Code integration)
- **FR2.1**: When a project is added, the backend invokes the Claude Code CLI headlessly (`claude -p <prompt> --allowedTools WebSearch,WebFetch --output-format json`) to research the project.
- **FR2.2**: Research must return, as structured JSON:
  - 3–5 guide links (YouTube videos, DIY websites, forum threads) with title, URL, and a one-line summary of why it's useful.
  - A list of **required tools** (reusable items: drill, pipe wrench, stud finder) with an approximate purchase cost each.
  - A list of **required materials** (consumables: lumber, faucet, screws, paint) with approximate cost each.
  - An **effort estimate**: level (Low / Medium / High), estimated hours, and a skill rating (Beginner / Intermediate / Advanced).
  - A short **summary** of the approach the guides recommend.
- **FR2.3**: Research runs asynchronously — the UI shows a `Researching…` state and updates when complete; the user is not blocked from using the app.
- **FR2.4**: If the `claude` CLI is not installed or the invocation fails, the project is marked `Research Failed` with a visible error and a "Retry" action. The app must degrade gracefully: users can still fill in tools/materials/effort manually.
- **FR2.5**: User can re-run research on any project at any time (replacing prior results after confirmation).

### FR3 — Inventory (tools & materials the user owns)
- **FR3.1**: User can add items to a personal inventory, each with a name and type (`tool` or `material`), and optional notes/quantity.
- **FR3.2**: User can view, edit, and delete inventory items.
- **FR3.3**: From a project's needed-items list, the user can mark an item as "I have this", which adds it to inventory (so ownership is shared across all projects).
- **FR3.4**: Matching between researched item names and inventory is fuzzy/name-normalized (e.g., "cordless drill" matches "drill"). Matching happens via a normalization pass during research plus simple string matching; the user can manually link/unlink matches the app gets wrong.

### FR4 — Gap Analysis & Cost
- **FR4.1**: For each project, the app computes the **missing items list**: required tools/materials not in inventory.
- **FR4.2**: Each project shows an **estimated out-of-pocket cost** = sum of approximate costs of missing items.
- **FR4.3**: Cost updates automatically when inventory changes (buying a drill for one project reduces the cost of every other project that needs a drill).

### FR5 — Project Ranking
- **FR5.1**: The home screen shows all non-done projects **ranked by a score** combining:
  - Effort level (lower effort ranks higher)
  - Out-of-pocket cost for missing items (cheaper ranks higher)
- **FR5.2**: Default scoring: normalize effort (Low=1, Medium=2, High=3) and cost to 0–1 ranges, score = `w_effort × effort_norm + w_cost × cost_norm`, lower is better. Default weights 50/50.
- **FR5.3**: User can adjust the effort-vs-cost weighting with a simple slider ("I have more time than money" ↔ "I have more money than time").
- **FR5.4**: Ranking list shows, per project: name, effort level, # of missing items, estimated cost, and score/rank.

### FR6 — Project Detail View
- **FR6.1**: Shows the research summary, guide links (clickable, open in new tab), full tool/material lists with owned-vs-missing status, effort estimate, and cost breakdown.
- **FR6.2**: Owned items are visually distinguished from missing items.

---

## Technical Requirements

### TR1 — Stack
- **Backend**: Node.js with Express, plain JavaScript or TypeScript.
- **Frontend**: React (Vite), served by the dev server during development; production build served statically by Express.
- **Database**: SQLite via `better-sqlite3` — single file (`data/diy-shed.db`), gitignored, created automatically on first run.
- **Node version**: LTS (≥ 20).

### TR2 — Claude Code CLI integration
- **TR2.1**: Backend spawns `claude -p` as a child process with `--output-format json` and a constrained tool allowlist (`WebSearch`, `WebFetch` only). No filesystem or shell tools are granted to the research invocation.
- **TR2.2**: The research prompt instructs Claude to return a single JSON object matching a documented schema; the backend validates the response (schema validation) and stores it. Invalid responses trigger one automatic retry, then `Research Failed`.
- **TR2.3**: A startup/health check detects whether `claude` is on PATH and surfaces its availability in the UI.
- **TR2.4**: Research invocations have a timeout (default 5 minutes) and are queued (max 1–2 concurrent) to avoid hammering the CLI.

### TR3 — Local hosting & setup
- **TR3.1**: `npm install` then `npm run dev` starts backend + frontend; `npm start` serves the production build. App is reachable at `http://localhost:3000` (port configurable via env var).
- **TR3.2**: No secrets or config files are required to run. Optional settings (port, ranking weights default, research timeout) via `.env` with documented defaults.
- **TR3.3**: README documents prerequisites (Node LTS, Claude Code CLI installed and logged in) and the two-command setup.
- **TR3.4**: Works on Windows, macOS, and Linux (no platform-specific paths or shell assumptions in the CLI spawn logic).

### TR4 — Data model (initial sketch)
- `projects` — id, name, description, status, effort_level, effort_hours, skill_level, research_summary, researched_at, created_at
- `guides` — id, project_id, title, url, summary
- `project_items` — id, project_id, name, normalized_name, type (tool|material), est_cost, inventory_id (nullable manual/auto link)
- `inventory` — id, name, normalized_name, type (tool|material), notes, created_at
- `settings` — key/value (ranking weights, etc.)

---

## Open Questions

- Should completed projects' leftover materials auto-suggest additions to inventory?
- Is a per-project "priority/urgency" user field wanted as a third ranking factor (e.g., a leaking faucet outranks a cheap shelf)?
- Package as a single `npx` command or Electron app later for even easier install?

## Milestones

1. **M1 — Skeleton**: Express + React + SQLite scaffolding, project & inventory CRUD, manual entry of tools/materials/effort. (App is useful with zero Claude integration.)
2. **M2 — Research**: Claude Code CLI integration, async research pipeline, guide links, schema validation, failure handling.
3. **M3 — Ranking**: gap analysis, cost rollup, scoring, weight slider, ranked home screen.
4. **M4 — Polish**: fuzzy inventory matching improvements, manual overrides, health checks, README + GitHub release.
