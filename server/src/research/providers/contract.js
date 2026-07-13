// The shape every research provider implements. Providers are behaviorally
// interchangeable: the runner selects one and calls `run(prompt)` without
// knowing which CLI backs it. Enforced by contract.shared.js.
//
// @typedef {Object} ProviderAvailability
// @property {boolean} available          - the CLI is installed and runnable.
// @property {boolean} [authenticated]    - signed in, where detectable (Claude
//                                           reports presence only → undefined).
// @property {string}  [error]            - why it is unavailable, if known.
//
// @typedef {{ ok: true, json: object, raw?: string } |
//           { ok: false, error: string, raw?: string }} ProviderRunResult
//
// @typedef {Object} Provider
// @property {string} id                  - stable slug ('claude', 'gemini').
// @property {string} label               - human name ('Claude Code', 'Gemini').
// @property {(opts?: object) => string} resolveBin
//     Resolve the executable path/command.
// @property {(opts?: object) => Promise<ProviderAvailability>} isAvailable
//     Installed and (where detectable) signed in. Never throws.
// @property {(prompt: string, opts?: object) => Promise<ProviderRunResult>} run
//     Execute the prompt and return the same envelope runner.js consumes.

export {};
