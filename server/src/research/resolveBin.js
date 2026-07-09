import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Directories where the Claude desktop app bundles the headless CLI, per OS.
export function bundledClaudeDirs({ platform = process.platform, home = os.homedir(), env = process.env } = {}) {
  if (platform === 'win32') {
    return [env.APPDATA, env.LOCALAPPDATA].filter(Boolean).map((r) => path.join(r, 'Claude', 'claude-code'));
  }
  if (platform === 'darwin') {
    return [path.join(home, 'Library', 'Application Support', 'Claude', 'claude-code')];
  }
  return [path.join(home, '.config', 'Claude', 'claude-code')];
}

function parseVersion(name) {
  const m = /^(\d+)\.(\d+)\.(\d+)/.exec(name);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

function compareVersion(a, b) {
  for (let i = 0; i < 3; i += 1) {
    if (a[i] !== b[i]) return a[i] - b[i];
  }
  return 0;
}

// Newest `claude-code/<version>/claude(.exe)` bundled by the desktop app, or null.
export function discoverBundledClaude(opts = {}) {
  const platform = opts.platform ?? process.platform;
  const fsImpl = opts.fsImpl ?? fs;
  const exe = platform === 'win32' ? 'claude.exe' : 'claude';
  let best = null;
  for (const dir of bundledClaudeDirs({ platform, home: opts.home, env: opts.env })) {
    let entries;
    try {
      entries = fsImpl.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const version = parseVersion(entry.name);
      if (!version) continue;
      const candidate = path.join(dir, entry.name, exe);
      if (!fsImpl.existsSync(candidate)) continue;
      if (!best || compareVersion(version, best.version) > 0) best = { version, path: candidate };
    }
  }
  return best ? best.path : null;
}

// Whether a bare `claude` resolves on PATH (respecting PATHEXT on Windows).
export function isOnPath(cmd = 'claude', opts = {}) {
  const platform = opts.platform ?? process.platform;
  const env = opts.env ?? process.env;
  const fsImpl = opts.fsImpl ?? fs;
  const dirs = (env.PATH || '').split(path.delimiter).filter(Boolean);
  const exts = platform === 'win32' ? (env.PATHEXT || '.COM;.EXE;.BAT;.CMD').split(';') : [''];
  for (const dir of dirs) {
    for (const ext of exts) {
      try {
        if (fsImpl.existsSync(path.join(dir, cmd + ext))) return true;
      } catch {
        // unreadable dir; keep looking
      }
    }
  }
  return false;
}

// Resolution order: explicit override → `claude` on PATH → bundled desktop-app
// CLI → bare `claude` (lets the OS/shell try, and degrades gracefully if absent).
export function resolveClaudeBin(opts = {}) {
  const env = opts.env ?? process.env;
  if (env.DIYSHED_CLAUDE_BIN) return env.DIYSHED_CLAUDE_BIN;
  if (isOnPath('claude', opts)) return 'claude';
  return discoverBundledClaude(opts) || 'claude';
}
