// Thin compatibility shim over the Claude provider. The implementation now lives
// in providers/claude.js; call sites migrate to the registry over M6a and this
// re-export keeps runner.js, app.js, projects.js and existing tests working.
import { claudeProvider, resetResolvedClaudeBin } from './providers/claude.js';
import { getProviderAvailability, resetAvailabilityCache } from './providers/index.js';

export function runClaude(prompt, opts) {
  return claudeProvider.run(prompt, opts);
}

export function isClaudeAvailable(opts) {
  return getProviderAvailability('claude', opts).then((r) => r.available);
}

export function resetClaudeAvailabilityCache() {
  resetAvailabilityCache();
}

export { resetResolvedClaudeBin };
