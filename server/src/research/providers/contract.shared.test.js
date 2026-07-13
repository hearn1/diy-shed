import { describe, it, expect } from 'vitest';
import { hasProviderShape } from './contract.shared.js';

// Sanity: the contract is actually enforced. A provider missing any required
// member fails the shape check that the shared suite asserts, so dropping a
// method from a real provider would turn the suite red.
describe('provider contract enforcement', () => {
  const complete = {
    id: 'stub',
    label: 'Stub',
    resolveBin: () => 'stub',
    isAvailable: async () => ({ available: false }),
    run: async () => ({ ok: false, error: 'x' })
  };

  it('accepts a complete provider', () => {
    expect(hasProviderShape(complete)).toBe(true);
  });

  it('rejects a provider with a required method removed', () => {
    for (const key of ['id', 'label', 'resolveBin', 'isAvailable', 'run']) {
      const { [key]: _removed, ...broken } = complete;
      expect(hasProviderShape(broken)).toBe(false);
    }
  });
});
