# diy-shed

A locally-hosted app that helps you decide **which DIY project to tackle next**. Add projects you want to do around the house — diy-shed researches each one on the web (via your existing [Claude Code](https://claude.com/claude-code) install, no API key needed), figures out the tools and materials required, compares that against what you already own, and ranks your projects by effort and out-of-pocket cost.

## Prerequisites

- [Node.js](https://nodejs.org) LTS (v20+)
- [Claude Code CLI](https://claude.com/claude-code) installed and logged in (`claude --version` should work) — used for the automated research step. The app still works without it; you just fill in tools/materials manually.

## Quick start

```bash
git clone https://github.com/<you>/diy-shed.git
cd diy-shed
npm install
npm run dev
```

Then open http://localhost:3000.

All data is stored in a local SQLite file under `data/` — nothing leaves your machine except the web searches Claude runs during research.

## How it works

1. **Add a project** ("Replace the bathroom faucet").
2. diy-shed invokes `claude -p` headlessly to search the web for guides (YouTube videos, DIY sites) and extract the required tools, materials, cost estimates, and effort level.
3. **Add your inventory** — tools and materials you already own.
4. The home screen **ranks your projects**: low effort + few missing items = do it this weekend.

See [requirements.md](requirements.md) for the full spec and roadmap.

## Status

🚧 Early development — see the Milestones section of [requirements.md](requirements.md).
