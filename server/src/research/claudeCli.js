import { spawn } from 'node:child_process';
import { RESEARCH_TIMEOUT_MS } from '../env.js';

// On Windows `claude` is a `.cmd` shim, which Node refuses to spawn with
// shell:false (EINVAL, CVE-2024-27980). We therefore spawn through the shell on
// win32 so PATHEXT resolves it, and keep the (untrusted) prompt off the command
// line entirely — it is written to stdin — so nothing is interpolated into a
// shell string on any platform.
const USE_SHELL = process.platform === 'win32';

const RESEARCH_ARGS = ['-p', '--allowedTools', 'WebSearch,WebFetch', '--output-format', 'json'];

function stripFences(text) {
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

export function runClaude(prompt, { timeoutMs = RESEARCH_TIMEOUT_MS, spawnImpl = spawn } = {}) {
  return new Promise((resolve) => {
    let child;
    try {
      child = spawnImpl('claude', RESEARCH_ARGS, { shell: USE_SHELL });
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
      if (code !== 0) {
        finish({ ok: false, error: stderr.trim() || `claude exited with code ${code}`, raw: stdout });
        return;
      }
      const parsed = parseCliJson(stdout);
      if (!parsed.ok) {
        finish({ ok: false, error: parsed.error, raw: stdout });
        return;
      }
      finish({ ok: true, json: parsed.json, raw: stdout });
    });
  });
}

let availabilityCache;

export function isClaudeAvailable({ spawnImpl = spawn } = {}) {
  if (availabilityCache !== undefined) return availabilityCache;
  availabilityCache = new Promise((resolve) => {
    let child;
    try {
      child = spawnImpl('claude', ['--version'], { shell: USE_SHELL });
    } catch {
      resolve(false);
      return;
    }
    let done = false;
    const settle = (value) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve(value);
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
  return availabilityCache;
}

export function resetClaudeAvailabilityCache() {
  availabilityCache = undefined;
}
