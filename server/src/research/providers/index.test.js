import { describe, it, expect, beforeEach } from 'vitest';
import { EventEmitter } from 'node:events';
import { listProviders, getProvider, providerIds, getProviderAvailability, resetAvailabilityCache } from './index.js';

function fakeChild() {
  const child = new EventEmitter();
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.kill = () => {
    child.killed = true;
  };
  return child;
}

describe('provider registry', () => {
  it('lists providers and includes claude', () => {
    const ids = listProviders().map((p) => p.id);
    expect(ids).toContain('claude');
    expect(providerIds).toEqual(ids);
  });

  it('getProvider returns the provider by id and undefined for unknown ids', () => {
    expect(getProvider('claude').id).toBe('claude');
    expect(getProvider('nope')).toBeUndefined();
  });
});

describe('getProviderAvailability', () => {
  beforeEach(() => {
    resetAvailabilityCache();
  });

  it('caches a provider availability probe per process', async () => {
    let calls = 0;
    const spawnImpl = () => {
      calls += 1;
      const child = fakeChild();
      queueMicrotask(() => child.emit('close', 0));
      return child;
    };
    const first = await getProviderAvailability('claude', { spawnImpl });
    const second = await getProviderAvailability('claude', { spawnImpl });
    expect(first).toEqual({ available: true });
    expect(second).toEqual({ available: true });
    expect(calls).toBe(1);
  });

  it('resolves { available:false } for an unknown provider id', async () => {
    expect(await getProviderAvailability('nope')).toEqual(
      expect.objectContaining({ available: false })
    );
  });
});
