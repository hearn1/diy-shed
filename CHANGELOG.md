# Changelog

All notable changes to diy-shed are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.4.0] - 2026-07-09

First tagged release, summarizing milestones M1–M4.

### M1 — Skeleton
- Full CRUD for **projects**, **inventory**, and **project items** with manual
  entry, backed by a local SQLite database (WAL mode, foreign keys on).
- Express + better-sqlite3 API server and a React 18 + Vite single-page client,
  served together on one port in production.
- Shared schema as the single source of truth, with enum constraints enforced in
  SQL and duplicated validation/display enums across server and client.

### M2 — Research (Claude CLI pipeline)
- Automated project research by spawning the local Claude Code CLI headlessly
  (`claude -p ... --allowedTools WebSearch,WebFetch`) — no Anthropic API key.
- Schema-validated research responses with a single retry, a `research_failed`
  status for the failure path, and graceful degradation when the CLI is absent.
- In-process research queue with configurable timeout and concurrency; CLI binary
  auto-discovery with an override.

### M3 — Ranking (gap analysis & scoring)
- Gap analysis comparing each project's required tools/materials against owned
  inventory, with an out-of-pocket cost estimate for missing items.
- Weighted ranking score combining effort and cost, scaled by a per-project
  priority divisor, driving a ranked home screen.
- Effort-vs-cost single slider (`w_effort`, with `w_cost = 1 − w_effort`) to tune
  the ranking to the user's preference.

### M4 — Polish
- Fuzzy inventory matching with a `match_override` column and manual link/unlink
  of researched items to inventory ("I have this").
- Project-detail ownership controls and a completion reconciliation flow that
  offers to add reusable tools to inventory when a project is marked Done.
- README rewrite (setup, features, environment, privacy), missing-CLI status
  banner polish with a concrete fix hint, and this release preparation.

[0.4.0]: https://github.com/hearn1/diy-shed/releases/tag/v0.4.0
