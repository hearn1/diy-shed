import { describe, it, expect } from 'vitest';
import { createQueue } from './queue.js';

function deferred() {
  let resolve;
  const promise = new Promise((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

describe('createQueue', () => {
  it('never runs more jobs concurrently than the cap', async () => {
    const enqueue = createQueue(1);
    let active = 0;
    let maxActive = 0;
    const job = () =>
      new Promise((resolve) => {
        active += 1;
        maxActive = Math.max(maxActive, active);
        setTimeout(() => {
          active -= 1;
          resolve();
        }, 5);
      });
    await Promise.all([enqueue(job), enqueue(job), enqueue(job)]);
    expect(maxActive).toBe(1);
  });

  it('caps concurrency at 2 even if a larger value is requested', async () => {
    const enqueue = createQueue(5);
    let active = 0;
    let maxActive = 0;
    const gates = [deferred(), deferred(), deferred()];
    const results = gates.map((g, i) =>
      enqueue(async () => {
        active += 1;
        maxActive = Math.max(maxActive, active);
        await g.promise;
        active -= 1;
      })
    );
    await Promise.resolve();
    await Promise.resolve();
    expect(maxActive).toBe(2);
    gates.forEach((g) => g.resolve());
    await Promise.all(results);
  });

  it('preserves FIFO order at concurrency 1', async () => {
    const enqueue = createQueue(1);
    const order = [];
    await Promise.all([1, 2, 3].map((n) => enqueue(async () => order.push(n))));
    expect(order).toEqual([1, 2, 3]);
  });

  it('keeps draining after a job rejects', async () => {
    const enqueue = createQueue(1);
    const ran = [];
    const failing = enqueue(async () => {
      throw new Error('boom');
    });
    const following = enqueue(async () => ran.push('after'));
    await expect(failing).rejects.toThrow('boom');
    await following;
    expect(ran).toEqual(['after']);
  });
});
