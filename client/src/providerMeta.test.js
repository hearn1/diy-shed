import { describe, it, expect } from 'vitest';
import { deriveStatus, providerEntry, statusHint } from './providerMeta.js';

describe('deriveStatus', () => {
  it('is not_installed when the provider is unavailable', () => {
    expect(deriveStatus({ available: false })).toBe('not_installed');
  });

  it('is signed_out only when authenticated is explicitly false', () => {
    expect(deriveStatus({ available: true, authenticated: false })).toBe('signed_out');
  });

  it('is ready when available and not explicitly signed out (null auth counts as ready)', () => {
    expect(deriveStatus({ available: true, authenticated: true })).toBe('ready');
    expect(deriveStatus({ available: true, authenticated: null })).toBe('ready');
  });

  it('is unknown when there is no entry', () => {
    expect(deriveStatus(null)).toBe('unknown');
  });
});

describe('providerEntry', () => {
  it('finds the matching provider entry from a health payload', () => {
    const health = { providers: [{ id: 'claude' }, { id: 'gemini', available: true }] };
    expect(providerEntry(health, 'gemini')).toEqual({ id: 'gemini', available: true });
    expect(providerEntry(health, 'missing')).toBeNull();
    expect(providerEntry(null, 'gemini')).toBeNull();
  });
});

describe('statusHint', () => {
  it('gives the install hint when not installed', () => {
    expect(statusHint('claude', 'not_installed')).toMatch(/claude login/);
    expect(statusHint('gemini', 'not_installed')).toMatch(/Login with Google/);
  });

  it('gives the sign-in hint when signed out', () => {
    expect(statusHint('claude', 'signed_out')).toMatch(/claude login/);
    expect(statusHint('gemini', 'signed_out')).toMatch(/Login with Google/);
  });

  it('has no hint when ready', () => {
    expect(statusHint('gemini', 'ready')).toBe('');
  });
});
