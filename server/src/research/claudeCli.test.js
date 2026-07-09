import { describe, it, expect, beforeEach } from 'vitest';
import { EventEmitter } from 'node:events';
import { runClaude, isClaudeAvailable, resetClaudeAvailabilityCache } from './claudeCli.js';
import { resolveClaudeBin } from './resolveBin.js';

function fakeChild() {
  const child = new EventEmitter();
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.stdinData = '';
  child.stdin = {
    end: (data) => {
      if (data !== undefined) child.stdinData += data;
      child.stdinEnded = true;
    },
    write: (data) => {
      child.stdinData += data;
    }
  };
  child.kill = () => {
    child.killed = true;
  };
  return child;
}

describe('runClaude', () => {
  it('spawns claude headless with fixed flags and sends the prompt via stdin', async () => {
    let captured;
    let child;
    const spawnImpl = (bin, args, opts) => {
      child = fakeChild();
      captured = { bin, args, opts };
      queueMicrotask(() => {
        child.stdout.emit('data', JSON.stringify({ result: '{"summary":"ok"}' }));
        child.emit('close', 0);
      });
      return child;
    };
    const res = await runClaude('build a shed', { spawnImpl });
    expect(captured.bin).toBe(resolveClaudeBin());
    expect(captured.args).toEqual(['-p', '--allowedTools', 'WebSearch,WebFetch', '--output-format', 'json']);
    expect(captured.args).not.toContain('build a shed');
    expect(child.stdinData).toBe('build a shed');
    expect(child.stdinEnded).toBe(true);
    expect(res).toEqual(expect.objectContaining({ ok: true, json: { summary: 'ok' } }));
  });

  it('parses the JSON envelope result field into json', async () => {
    const spawnImpl = () => {
      const child = fakeChild();
      queueMicrotask(() => {
        child.stdout.emit('data', JSON.stringify({ type: 'result', result: '{"a":1}' }));
        child.emit('close', 0);
      });
      return child;
    };
    const res = await runClaude('x', { spawnImpl });
    expect(res.ok).toBe(true);
    expect(res.json).toEqual({ a: 1 });
  });

  it('resolves ok:false on a non-zero exit and never throws', async () => {
    const spawnImpl = () => {
      const child = fakeChild();
      queueMicrotask(() => {
        child.stderr.emit('data', 'boom');
        child.emit('close', 1);
      });
      return child;
    };
    const res = await runClaude('x', { spawnImpl });
    expect(res.ok).toBe(false);
    expect(res.error).toContain('boom');
  });

  it('surfaces the JSON envelope error message on a non-zero exit', async () => {
    const spawnImpl = () => {
      const child = fakeChild();
      queueMicrotask(() => {
        child.stdout.emit(
          'data',
          JSON.stringify({ type: 'result', is_error: true, result: 'Not logged in · Please run /login' })
        );
        child.emit('close', 1);
      });
      return child;
    };
    const res = await runClaude('x', { spawnImpl });
    expect(res.ok).toBe(false);
    expect(res.error).toBe('Not logged in · Please run /login');
  });

  it('kills the child and resolves ok:false error:timeout on timeout', async () => {
    let killed = false;
    const spawnImpl = () => {
      const child = fakeChild();
      child.kill = () => {
        killed = true;
      };
      return child; // never emits close
    };
    const res = await runClaude('x', { spawnImpl, timeoutMs: 10 });
    expect(res).toEqual({ ok: false, error: 'timeout' });
    expect(killed).toBe(true);
  });

  it('resolves ok:false when the child cannot be spawned', async () => {
    const spawnImpl = () => {
      throw new Error('spawn ENOENT');
    };
    const res = await runClaude('x', { spawnImpl });
    expect(res).toEqual({ ok: false, error: 'spawn ENOENT' });
  });
});

describe('isClaudeAvailable', () => {
  beforeEach(() => {
    resetClaudeAvailabilityCache();
  });

  it('returns true when claude --version exits 0', async () => {
    const spawnImpl = () => {
      const child = fakeChild();
      queueMicrotask(() => child.emit('close', 0));
      return child;
    };
    expect(await isClaudeAvailable({ spawnImpl })).toBe(true);
  });

  it('returns false (does not throw) when claude is absent', async () => {
    const spawnImpl = () => {
      const child = fakeChild();
      queueMicrotask(() => child.emit('error', new Error('ENOENT')));
      return child;
    };
    expect(await isClaudeAvailable({ spawnImpl })).toBe(false);
  });

  it('caches the result per process', async () => {
    let calls = 0;
    const spawnImpl = () => {
      calls += 1;
      const child = fakeChild();
      queueMicrotask(() => child.emit('close', 0));
      return child;
    };
    await isClaudeAvailable({ spawnImpl });
    await isClaudeAvailable({ spawnImpl });
    expect(calls).toBe(1);
  });
});
