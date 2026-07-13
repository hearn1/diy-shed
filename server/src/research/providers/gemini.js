import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { RESEARCH_TIMEOUT_MS } from '../../env.js';
import { augmentedEnv, isOnPath } from '../resolveBin.js';
import { stripFences, useShellFor } from './claude.js';

// Resolution order: explicit override → `gemini` on PATH → bare `gemini` (lets
// the OS/shell try, degrading gracefully if absent). Gemini has no bundled
// desktop CLI to discover, unlike Claude.
export function resolveGeminiBin(opts = {}) {
  const env = opts.env ?? process.env;
  if (env.DIYSHED_GEMINI_BIN) return env.DIYSHED_GEMINI_BIN;
  if (isOnPath('gemini', { ...opts, env: augmentedEnv(opts) })) return 'gemini';
  return 'gemini';
}

let resolvedBin;
function geminiBin() {
  if (resolvedBin === undefined) resolvedBin = resolveGeminiBin();
  return resolvedBin;
}

export function resetResolvedGeminiBin() {
  resolvedBin = undefined;
}

const RESEARCH_ARGS = ['--output-format', 'json'];

// The prompt (untrusted) is piped over stdin rather than passed via `-p`, so it
// is never interpolated into a shell string — the Gemini CLI installs as a
// `gemini.cmd` shim on Windows which must be spawned through the shell
// (CVE-2024-27980), and an arg-borne prompt there would be a shell-injection
// vector. The headless envelope is `{ response, stats, error? }`.
function mapExit(code, stderr) {
  const detail = stderr.trim();
  if (code === 42) return detail || 'gemini input error';
  if (code === 53) return detail || 'gemini turn limit reached';
  if (code === 1) return detail || 'gemini error (often not signed in)';
  return detail || `gemini exited with code ${code}`;
}

function parseResult(stdout, stderr, code) {
  const trimmed = stdout.trim();
  let envelope;
  if (trimmed) {
    try {
      envelope = JSON.parse(trimmed);
    } catch {
      return { ok: false, error: code !== 0 ? mapExit(code, stderr) : 'gemini returned invalid JSON', raw: stdout };
    }
  }
  if (envelope && envelope.error) {
    const message = (envelope.error && (envelope.error.message || envelope.error.code)) || 'gemini reported an error';
    return { ok: false, error: String(message), raw: stdout };
  }
  if (code !== 0) {
    return { ok: false, error: mapExit(code, stderr), raw: stdout };
  }
  if (!envelope || typeof envelope.response !== 'string') {
    return { ok: false, error: stderr.trim() || 'gemini produced no output', raw: stdout };
  }
  try {
    return { ok: true, json: JSON.parse(stripFences(envelope.response)), raw: stdout };
  } catch {
    return { ok: false, error: 'gemini result was not JSON', raw: stdout };
  }
}

function run(prompt, { timeoutMs = RESEARCH_TIMEOUT_MS, spawnImpl = spawn } = {}) {
  return new Promise((resolve) => {
    const bin = geminiBin();
    let child;
    try {
      child = spawnImpl(bin, RESEARCH_ARGS, { shell: useShellFor(bin) });
    } catch (err) {
      resolve({ ok: false, error: err.message });
      return;
    }

    try {
      child.stdin?.end(prompt);
    } catch {
      // stdin already closed; the child will report via close/error
    }

    let stdout = '';
    let stderr = '';
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };

    const timer = setTimeout(() => {
      try {
        child.kill();
      } catch {
        // child already exited
      }
      finish({ ok: false, error: 'timeout' });
    }, timeoutMs);

    child.stdout?.on('data', (d) => {
      stdout += d;
    });
    child.stderr?.on('data', (d) => {
      stderr += d;
    });
    child.on('error', (err) => finish({ ok: false, error: err.message }));
    child.on('close', (code) => finish(parseResult(stdout, stderr, code)));
  });
}

// Auth detection is undocumented, so we check for the OAuth credentials the CLI
// caches after "Login with Google" (`~/.gemini/oauth_creds.json`). This avoids
// spending free-tier quota on a probe request; it is best-effort — presence of
// the file means a prior sign-in, not a guaranteed-valid token.
function isAuthenticated({ fsImpl = fs, home = os.homedir() } = {}) {
  try {
    return fsImpl.existsSync(path.join(home, '.gemini', 'oauth_creds.json'));
  } catch {
    return false;
  }
}

function isAvailable({ spawnImpl = spawn, fsImpl, home } = {}) {
  return new Promise((resolve) => {
    const bin = geminiBin();
    let child;
    try {
      child = spawnImpl(bin, ['--version'], { shell: useShellFor(bin) });
    } catch {
      resolve({ available: false });
      return;
    }
    let done = false;
    const settle = (available) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      if (!available) {
        resolve({ available: false });
        return;
      }
      resolve({ available: true, authenticated: isAuthenticated({ fsImpl, home }) });
    };
    const timer = setTimeout(() => {
      try {
        child.kill();
      } catch {
        // child already exited
      }
      settle(false);
    }, 3000);
    child.on('error', () => settle(false));
    child.on('close', (code) => settle(code === 0));
  });
}

export const geminiProvider = {
  id: 'gemini',
  label: 'Gemini',
  resolveBin: (opts) => resolveGeminiBin(opts),
  isAvailable,
  run
};
