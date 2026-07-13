import { claudeProvider } from './claude.js';

// Ordered registry of every research provider. Order is the presentation order
// (Claude first, the default-established integration; further providers after).
const providers = [claudeProvider];
const byId = new Map(providers.map((p) => [p.id, p]));

export const providerIds = providers.map((p) => p.id);

export function listProviders() {
  return providers.slice();
}

export function getProvider(id) {
  return byId.get(id);
}

// Availability is probed by spawning the CLI, so cache each provider's result
// per process (health and the create-gate both read it). Reset in tests.
const availabilityCache = new Map();

export function getProviderAvailability(id, opts) {
  if (availabilityCache.has(id)) return availabilityCache.get(id);
  const provider = byId.get(id);
  const result = provider
    ? Promise.resolve(provider.isAvailable(opts))
    : Promise.resolve({ available: false, error: `unknown provider: ${id}` });
  availabilityCache.set(id, result);
  return result;
}

export function resetAvailabilityCache() {
  availabilityCache.clear();
}
