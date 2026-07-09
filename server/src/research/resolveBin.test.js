import { describe, it, expect } from 'vitest';
import { bundledClaudeDirs, discoverBundledClaude, isOnPath, resolveClaudeBin } from './resolveBin.js';

// Minimal in-memory fs: a set of existing paths + a dir->entries map. Path
// matching is case-insensitive to mirror Windows filesystem semantics.
function fakeFs(existing, dirs) {
  const lower = new Set([...existing].map((p) => p.toLowerCase()));
  return {
    existsSync: (p) => lower.has(String(p).toLowerCase()),
    readdirSync: (dir) => {
      if (!(dir in dirs)) {
        const err = new Error('ENOENT');
        err.code = 'ENOENT';
        throw err;
      }
      return dirs[dir].map((name) => ({ name, isDirectory: () => true }));
    }
  };
}

describe('bundledClaudeDirs', () => {
  it('uses APPDATA/LOCALAPPDATA on Windows', () => {
    const dirs = bundledClaudeDirs({
      platform: 'win32',
      env: { APPDATA: 'C:\\a', LOCALAPPDATA: 'C:\\l' }
    });
    expect(dirs).toEqual(['C:\\a\\Claude\\claude-code', 'C:\\l\\Claude\\claude-code']);
  });
});

describe('discoverBundledClaude', () => {
  it('returns the newest version’s claude.exe on Windows', () => {
    const base = 'C:\\a\\Claude\\claude-code';
    const fsImpl = fakeFs(
      new Set([`${base}\\2.1.9\\claude.exe`, `${base}\\2.1.100\\claude.exe`, `${base}\\2.0.5\\claude.exe`]),
      { [base]: ['2.1.9', '2.1.100', '2.0.5', 'not-a-version'] }
    );
    const found = discoverBundledClaude({ platform: 'win32', env: { APPDATA: 'C:\\a' }, fsImpl });
    expect(found).toBe(`${base}\\2.1.100\\claude.exe`);
  });

  it('returns null when nothing is bundled', () => {
    const fsImpl = fakeFs(new Set(), {});
    expect(discoverBundledClaude({ platform: 'win32', env: { APPDATA: 'C:\\a' }, fsImpl })).toBeNull();
  });

  it('skips version folders that have no binary', () => {
    const base = 'C:\\a\\Claude\\claude-code';
    const fsImpl = fakeFs(new Set([`${base}\\1.0.0\\claude.exe`]), { [base]: ['1.0.0', '2.0.0'] });
    expect(discoverBundledClaude({ platform: 'win32', env: { APPDATA: 'C:\\a' }, fsImpl })).toBe(
      `${base}\\1.0.0\\claude.exe`
    );
  });
});

describe('isOnPath', () => {
  it('finds claude.cmd via PATHEXT on Windows', () => {
    const fsImpl = fakeFs(new Set(['C:\\bin\\claude.cmd']), {});
    const env = { PATH: 'C:\\bin;C:\\other', PATHEXT: '.EXE;.CMD' };
    expect(isOnPath('claude', { platform: 'win32', env, fsImpl })).toBe(true);
  });

  it('returns false when not on PATH', () => {
    const fsImpl = fakeFs(new Set(), {});
    expect(isOnPath('claude', { platform: 'win32', env: { PATH: 'C:\\bin', PATHEXT: '.EXE' }, fsImpl })).toBe(false);
  });
});

describe('resolveClaudeBin precedence', () => {
  const winBase = 'C:\\a\\Claude\\claude-code';

  it('prefers the explicit DIYSHED_CLAUDE_BIN override', () => {
    const fsImpl = fakeFs(new Set([`${winBase}\\2.0.0\\claude.exe`]), { [winBase]: ['2.0.0'] });
    const env = { DIYSHED_CLAUDE_BIN: 'C:\\custom\\claude.exe', APPDATA: 'C:\\a', PATH: '', PATHEXT: '.EXE' };
    expect(resolveClaudeBin({ platform: 'win32', env, fsImpl })).toBe('C:\\custom\\claude.exe');
  });

  it('uses bare claude when it is on PATH', () => {
    const fsImpl = fakeFs(new Set(['C:\\bin\\claude.cmd', `${winBase}\\2.0.0\\claude.exe`]), { [winBase]: ['2.0.0'] });
    const env = { APPDATA: 'C:\\a', PATH: 'C:\\bin', PATHEXT: '.EXE;.CMD' };
    expect(resolveClaudeBin({ platform: 'win32', env, fsImpl })).toBe('claude');
  });

  it('falls back to the bundled binary when not on PATH', () => {
    const fsImpl = fakeFs(new Set([`${winBase}\\2.0.0\\claude.exe`]), { [winBase]: ['2.0.0'] });
    const env = { APPDATA: 'C:\\a', PATH: 'C:\\bin', PATHEXT: '.EXE' };
    expect(resolveClaudeBin({ platform: 'win32', env, fsImpl })).toBe(`${winBase}\\2.0.0\\claude.exe`);
  });

  it('falls back to bare claude when nothing is found', () => {
    const fsImpl = fakeFs(new Set(), {});
    const env = { APPDATA: 'C:\\a', PATH: 'C:\\bin', PATHEXT: '.EXE' };
    expect(resolveClaudeBin({ platform: 'win32', env, fsImpl })).toBe('claude');
  });
});
