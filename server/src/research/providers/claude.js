import { spawn } from 'node:child_process';
import { RESEARCH_TIMEOUT_MS } from '../../env.js';
import { resolveClaudeBin } from '../resolveBin.js';

// The prompt (untrusted) is always sent over stdin, never the command line, so
// nothing is interpolated into a shell string on any platform. On Windows a bare
// `claude` / `.cmd` shim can only be resolved through the shell (Node refuses to
// spawn a `.cmd` with shell:false — EINVAL, CVE-2024-27980), but a concrete
// `.exe` path spawns directly, which also handles spaces in the path.
export function useShellFor(bin) {
  return process.platform === 'win32' && !/\.(exe|com)$/i.test(bin);
}

let resolvedBin;
function claudeBin() {
  if (resolvedBin === undefined) resolvedBin = resolveClaudeBin();
  return resolvedBin;
}

export function resetResolvedClaudeBin() {
  resolvedBin = undefined;
}

const RESEARCH_ARGS = ['-p', '--allowedTools', 'WebSearch,WebFetch', '--output-format', 'json'];

export function stripFences(text) {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenced ? fenced[1].trim() : trimmed;
}

function parseCliJson(stdout) {
  let envelope;
  try {
    envelope = JSON.parse(stdout);
  } catch {
    return { ok: false, error: 'claude returned invalid JSON' };
  }
  if (envelope && envelope.is_error) {
    return {
      ok: false,
      error: typeof envelope.result === 'string' ? envelope.result : 'claude reported an error'
    };
  }
  if (envelope && typeof envelope.result === 'string') {
    try {
      return { ok: true, json: JSON.parse(stripFences(envelope.result)) };
    } catch {
      return { ok: false, error: 'claude result was not JSON' };
    }
  }
  return { ok: true, json: envelope };
}

function run(prompt, { timeoutMs = RESEARCH_TIMEOUT_MS, spawnImpl = spawn } = {}) {
  return new Promise((resolve) => {
    const bin = claudeBin();
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
    child.on('close', (code) => {
      // The `--output-format json` envelope carries the real reason (e.g. "Not
      // logged in") even on a non-zero exit, so prefer it over the exit code.
      const parsed = stdout.trim() ? parseCliJson(stdout) : null;
      if (code !== 0) {
        const message = (parsed && !parsed.ok && parsed.error) || stderr.trim() || `claude exited with code ${code}`;
        finish({ ok: false, error: message, raw: stdout });
        return;
      }
      if (!parsed) {
        finish({ ok: false, error: stderr.trim() || 'claude produced no output', raw: stdout });
        return;
      }
      if (!parsed.ok) {
        finish({ ok: false, error: parsed.error, raw: stdout });
        return;
      }
      finish({ ok: true, json: parsed.json, raw: stdout });
    });
  });
}

// Claude only exposes CLI presence, so `authenticated` is left undefined.
function isAvailable({ spawnImpl = spawn } = {}) {
  return new Promise((resolve) => {
    const bin = claudeBin();
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
      resolve({ available });
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

export const claudeProvider = {
  id: 'claude',
  label: 'Claude Code',
  resolveBin: (opts) => resolveClaudeBin(opts),
  isAvailable,
  run
};
