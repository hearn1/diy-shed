import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openDb } from '../db/index.js';
import { getSelectedProviderId, setSelectedProviderId } from './selection.js';

let db;
let dbPath;

beforeEach(() => {
  dbPath = path.join(os.tmpdir(), `diy-shed-selection-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
  db = openDb(dbPath);
});

afterEach(() => {
  db.close();
  for (const suffix of ['', '-wal', '-shm']) {
    try {
      fs.unlinkSync(dbPath + suffix);
    } catch {
      // ignore
    }
  }
});

describe('provider selection', () => {
  it('returns null when unset (no silent default)', () => {
    expect(getSelectedProviderId(db)).toBeNull();
  });

  it('persists and reads back a valid provider id', () => {
    expect(setSelectedProviderId(db, 'gemini')).toBe('gemini');
    expect(getSelectedProviderId(db)).toBe('gemini');
    setSelectedProviderId(db, 'claude');
    expect(getSelectedProviderId(db)).toBe('claude');
  });

  it('rejects an unknown provider id', () => {
    expect(() => setSelectedProviderId(db, 'bogus')).toThrow();
    expect(getSelectedProviderId(db)).toBeNull();
  });

  it('unsets the selection with null', () => {
    setSelectedProviderId(db, 'claude');
    expect(setSelectedProviderId(db, null)).toBeNull();
    expect(getSelectedProviderId(db)).toBeNull();
  });
});
