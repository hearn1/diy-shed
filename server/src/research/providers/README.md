# Research providers

Each provider adapts one AI CLI to a common interface so the research runner can
select one and call `run(prompt)` without knowing which backs it. The shape is
documented in [`contract.js`](contract.js):

- `id` — stable slug (`'claude'`, `'gemini'`).
- `label` — human name.
- `resolveBin(opts?)` — resolve the executable path/command.
- `isAvailable(opts?)` → `{ available, authenticated?, error? }` — installed and,
  where detectable, signed in. Never throws.
- `run(prompt, opts?)` → `{ ok:true, json, raw } | { ok:false, error, raw? }`.

## Adding a provider

1. Implement the shape in `<id>.js` and register it in [`index.js`](index.js).
2. **Wire it through the shared contract suite.** Any new provider must pass
   [`contract.shared.js`](contract.shared.js) — import `runProviderContractTests`
   in its `*.test.js` and supply provider-appropriate fake stdout fixtures (see
   [`claude.test.js`](claude.test.js) / [`gemini.test.js`](gemini.test.js)). The
   suite injects a fake `spawnImpl`, so it never depends on a real binary.
