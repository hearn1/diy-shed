import { describe, it, expect } from 'vitest';
import { EventEmitter } from 'node:events';

// Shared contract suite every provider must pass, so Claude, Gemini, and future
// providers stay behaviorally interchangeable. Each provider supplies its own
// fake stdout fixtures (a Claude `--output-format json` envelope vs a Gemini
// `{response,...}` envelope); the child-process machinery lives here.

function fakeChild() {
  const child = new EventEmitter();
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.stdinData = '';
  child.stdin = {
    end: (data) => {
      if (data !== undefined) child.stdinData += data;
    }
  };
  child.kill = () => {
    child.killed = true;
  };
  return child;
}

function emitter({ stdout, stderr, code }) {
  return () => {
    const child = fakeChild();
    queueMicrotask(() => {
      if (stdout !== undefined) child.stdout.emit('data', stdout);
      if (stderr !== undefined) child.stderr.emit('data', stderr);
      child.emit('close', code);
    });
    return child;
  };
}

export function hasProviderShape(provider) {
  return Boolean(
    provider &&
      typeof provider.id === 'string' &&
      provider.id.length > 0 &&
      typeof provider.label === 'string' &&
      typeof provider.resolveBin === 'function' &&
      typeof provider.isAvailable === 'function' &&
      typeof provider.run === 'function'
  );
}

// fixtures = {
//   expectedJson,                          // parsed model object for success
//   successStdout,                         // stdout for the success case (exit 0)
//   errorStdout?, errorStderr?, errorCode?,// CLI error / non-zero exit case
//   invalidStdout                          // non-JSON / non-model output (exit 0)
// }
export function runProviderContractTests(makeProvider, fixtures) {
  const provider = makeProvider();

  describe(`provider contract: ${provider.id}`, () => {
    it('has the required shape', () => {
      expect(hasProviderShape(provider)).toBe(true);
    });

    it('run success → { ok:true, json } with the parsed model object', async () => {
      const res = await provider.run('prompt', { spawnImpl: emitter({ stdout: fixtures.successStdout, code: 0 }) });
      expect(res.ok).toBe(true);
      expect(res.json).toEqual(fixtures.expectedJson);
    });

    it('run on CLI error / non-zero exit → { ok:false, error } and never throws', async () => {
      const res = await provider.run('prompt', {
        spawnImpl: emitter({
          stdout: fixtures.errorStdout,
          stderr: fixtures.errorStderr,
          code: fixtures.errorCode ?? 1
        })
      });
      expect(res.ok).toBe(false);
      expect(typeof res.error).toBe('string');
      expect(res.error.length).toBeGreaterThan(0);
    });

    it('run on invalid / non-JSON output → { ok:false } and never throws', async () => {
      const res = await provider.run('prompt', { spawnImpl: emitter({ stdout: fixtures.invalidStdout, code: 0 }) });
      expect(res.ok).toBe(false);
      expect(res.error).toBeTruthy();
    });

    it('run respects the timeout → { ok:false, error:timeout } and kills the child', async () => {
      let killed = false;
      const spawnImpl = () => {
        const child = fakeChild();
        child.kill = () => {
          killed = true;
        };
        return child;
      };
      const res = await provider.run('prompt', { spawnImpl, timeoutMs: 10 });
      expect(res).toEqual({ ok: false, error: 'timeout' });
      expect(killed).toBe(true);
    });

    it('isAvailable resolves { available:boolean } and never throws when the binary is missing', async () => {
      const spawnImpl = () => {
        const child = fakeChild();
        queueMicrotask(() => child.emit('error', new Error('ENOENT')));
        return child;
      };
      const res = await provider.isAvailable({ spawnImpl });
      expect(typeof res.available).toBe('boolean');
      expect(res.available).toBe(false);
    });
  });
}
