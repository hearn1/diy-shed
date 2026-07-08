import { RESEARCH_CONCURRENCY } from '../env.js';

export function createQueue(concurrency = RESEARCH_CONCURRENCY) {
  const cap = Math.min(2, Math.max(1, concurrency));
  const pending = [];
  let active = 0;

  function pump() {
    while (active < cap && pending.length > 0) {
      const { fn, resolve, reject } = pending.shift();
      active += 1;
      Promise.resolve()
        .then(fn)
        .then(resolve, reject)
        .finally(() => {
          active -= 1;
          pump();
        });
    }
  }

  return function enqueue(fn) {
    return new Promise((resolve, reject) => {
      pending.push({ fn, resolve, reject });
      pump();
    });
  };
}

export const enqueue = createQueue();
