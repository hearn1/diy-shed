import { describe, it, expect } from 'vitest';
import { EventEmitter } from 'node:events';
import { claudeProvider, useShellFor } from './claude.js';
import { resolveClaudeBin } from '../resolveBin.js';

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

describe('claudeProvider', () => {
  it('has the contract shape', () => {
    expect(claudeProvider.id).toBe('claude');
    expect(claudeProvider.label).toBe('Claude Code');
    expect(typeof claudeProvider.resolveBin).toBe('function');
    expect(typeof claudeProvider.isAvailable).toBe('function');
    expect(typeof claudeProvider.run).toBe('function');
  });

  it('run delegates to the moved Claude logic: fixed flags, prompt over stdin', async () => {
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
    const res = await claudeProvider.run('build a shed', { spawnImpl });
    expect(captured.bin).toBe(resolveClaudeBin());
    expect(captured.args).toEqual(['-p', '--allowedTools', 'WebSearch,WebFetch', '--output-format', 'json']);
    expect(child.stdinData).toBe('build a shed');
    expect(res).toEqual(expect.objectContaining({ ok: true, json: { summary: 'ok' } }));
  });

  it('isAvailable returns the { available } object shape (authenticated undefined)', async () => {
    const spawnImpl = () => {
      const child = fakeChild();
      queueMicrotask(() => child.emit('close', 0));
      return child;
    };
    const res = await claudeProvider.isAvailable({ spawnImpl });
    expect(res).toEqual({ available: true });
    expect(res.authenticated).toBeUndefined();
  });

  it('isAvailable resolves { available:false } (never throws) when the CLI is absent', async () => {
    const spawnImpl = () => {
      const child = fakeChild();
      queueMicrotask(() => child.emit('error', new Error('ENOENT')));
      return child;
    };
    expect(await claudeProvider.isAvailable({ spawnImpl })).toEqual({ available: false });
  });
});

describe('useShellFor', () => {
  it('is false for a concrete .exe path', () => {
    expect(useShellFor('C:\\bin\\claude.exe')).toBe(false);
  });
});
