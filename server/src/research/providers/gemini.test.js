import { describe, it, expect, beforeEach } from 'vitest';
import { EventEmitter } from 'node:events';
import { geminiProvider, resolveGeminiBin, resetResolvedGeminiBin } from './gemini.js';
import { runProviderContractTests } from './contract.shared.js';

runProviderContractTests(() => geminiProvider, {
  expectedJson: { summary: 'ok' },
  successStdout: JSON.stringify({ response: '{"summary":"ok"}', stats: {} }),
  errorStdout: JSON.stringify({ error: { message: 'boom' } }),
  errorCode: 1,
  invalidStdout: 'not json at all'
});

function fakeChild() {
  const child = new EventEmitter();
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.stdinData = '';
  child.stdin = {
    end: (data) => {
      if (data !== undefined) child.stdinData += data;
      child.stdinEnded = true;
    }
  };
  child.kill = () => {
    child.killed = true;
  };
  return child;
}

// A spawnImpl that emits the given headless envelope (object → JSON, string →
// raw) on stdout, optional stderr, then closes with `code`.
function emit({ stdout, stderr, code = 0, captureInto }) {
  return (bin, args, opts) => {
    const child = fakeChild();
    if (captureInto) captureInto({ bin, args, opts, child });
    queueMicrotask(() => {
      if (stdout !== undefined) {
        child.stdout.emit('data', typeof stdout === 'string' ? stdout : JSON.stringify(stdout));
      }
      if (stderr !== undefined) child.stderr.emit('data', stderr);
      child.emit('close', code);
    });
    return child;
  };
}

beforeEach(() => {
  resetResolvedGeminiBin();
  delete process.env.DIYSHED_GEMINI_BIN;
});

describe('geminiProvider.run', () => {
  it('pipes the prompt over stdin with json output flags and parses the response', async () => {
    let cap;
    const res = await geminiProvider.run('build a shed', {
      spawnImpl: emit({ stdout: { response: '{"summary":"ok"}', stats: {} }, captureInto: (c) => (cap = c) })
    });
    expect(cap.args).toEqual(['--output-format', 'json', '-m', 'gemini-3.5-flash-lite']);
    expect(cap.args).not.toContain('build a shed');
    expect(cap.child.stdinData).toBe('build a shed');
    expect(res).toEqual(expect.objectContaining({ ok: true, json: { summary: 'ok' } }));
  });

  it('strips a ```json fenced response before parsing', async () => {
    const res = await geminiProvider.run('x', {
      spawnImpl: emit({ stdout: { response: '```json\n{"a":1}\n```' } })
    });
    expect(res.ok).toBe(true);
    expect(res.json).toEqual({ a: 1 });
  });

  it('surfaces the envelope error field as ok:false', async () => {
    const res = await geminiProvider.run('x', {
      spawnImpl: emit({ stdout: { error: { message: 'quota exceeded' } }, code: 1 })
    });
    expect(res.ok).toBe(false);
    expect(res.error).toBe('quota exceeded');
  });

  it('maps a non-zero exit with no envelope to a helpful message', async () => {
    const res = await geminiProvider.run('x', {
      spawnImpl: emit({ stderr: 'please login', code: 1 })
    });
    expect(res.ok).toBe(false);
    expect(res.error).toContain('please login');
  });

  it('returns ok:false on invalid JSON output (never throws)', async () => {
    const res = await geminiProvider.run('x', { spawnImpl: emit({ stdout: 'not json at all' }) });
    expect(res.ok).toBe(false);
    expect(res.error).toBeTruthy();
  });

  it('returns ok:false when the response is not valid research JSON', async () => {
    const res = await geminiProvider.run('x', { spawnImpl: emit({ stdout: { response: 'hello there' } }) });
    expect(res.ok).toBe(false);
  });

  it('kills the child and resolves ok:false error:timeout on timeout', async () => {
    let killed = false;
    const spawnImpl = () => {
      const child = fakeChild();
      child.kill = () => {
        killed = true;
      };
      return child;
    };
    const res = await geminiProvider.run('x', { spawnImpl, timeoutMs: 10 });
    expect(res).toEqual({ ok: false, error: 'timeout' });
    expect(killed).toBe(true);
  });

  it('resolves ok:false when the child cannot be spawned', async () => {
    const spawnImpl = () => {
      throw new Error('spawn ENOENT');
    };
    expect(await geminiProvider.run('x', { spawnImpl })).toEqual({ ok: false, error: 'spawn ENOENT' });
  });
});

describe('geminiProvider.isAvailable', () => {
  it('installed + authenticated when --version exits 0 and creds exist', async () => {
    const res = await geminiProvider.isAvailable({
      spawnImpl: emit({ code: 0 }),
      fsImpl: { existsSync: () => true },
      home: '/home/u'
    });
    expect(res).toEqual({ available: true, authenticated: true });
  });

  it('installed + signed-out when --version exits 0 but no creds', async () => {
    const res = await geminiProvider.isAvailable({
      spawnImpl: emit({ code: 0 }),
      fsImpl: { existsSync: () => false },
      home: '/home/u'
    });
    expect(res).toEqual({ available: true, authenticated: false });
  });

  it('not installed when the binary is absent (never throws)', async () => {
    const spawnImpl = () => {
      const child = fakeChild();
      queueMicrotask(() => child.emit('error', new Error('ENOENT')));
      return child;
    };
    expect(await geminiProvider.isAvailable({ spawnImpl })).toEqual({ available: false });
  });
});

describe('resolveGeminiBin & shell handling', () => {
  it('honors the DIYSHED_GEMINI_BIN override', () => {
    expect(resolveGeminiBin({ env: { DIYSHED_GEMINI_BIN: 'C:\\g\\gemini.exe' } })).toBe('C:\\g\\gemini.exe');
  });

  it('falls back to bare gemini when not on PATH', () => {
    const fsImpl = { existsSync: () => false };
    expect(resolveGeminiBin({ platform: 'win32', env: { PATH: 'C:\\bin', PATHEXT: '.EXE' }, fsImpl })).toBe('gemini');
  });

  it('uses the shell for a bare Windows name but not for an absolute .exe', async () => {
    const orig = process.platform;
    Object.defineProperty(process, 'platform', { value: 'win32' });
    try {
      let cap;
      process.env.DIYSHED_GEMINI_BIN = 'gemini';
      resetResolvedGeminiBin();
      await geminiProvider.run('x', { spawnImpl: emit({ stdout: { response: '{}' }, captureInto: (c) => (cap = c) }) });
      expect(cap.opts.shell).toBe(true);

      process.env.DIYSHED_GEMINI_BIN = 'C:\\g\\gemini.exe';
      resetResolvedGeminiBin();
      await geminiProvider.run('x', { spawnImpl: emit({ stdout: { response: '{}' }, captureInto: (c) => (cap = c) }) });
      expect(cap.opts.shell).toBe(false);
    } finally {
      Object.defineProperty(process, 'platform', { value: orig });
    }
  });
});
