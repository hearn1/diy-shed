import { describe, it, expect } from 'vitest';
import { rankProjects } from './score.js';

function ids(ranked) {
  return ranked.map((p) => p.id);
}

describe('rankProjects', () => {
  it('ranks urgent_fix above dreams when otherwise identical (divide-not-multiply)', () => {
    const ranked = rankProjects(
      [
        { id: 1, priority: 'dreams', effort_level: 'Low', est_cost: 10 },
        { id: 2, priority: 'urgent_fix', effort_level: 'Low', est_cost: 10 }
      ],
      0.5
    );
    expect(ids(ranked)).toEqual([2, 1]);
    expect(ranked[0].rank).toBe(1);
    expect(ranked[1].rank).toBe(2);
  });

  it('ignores cost when wEffort = 1', () => {
    const ranked = rankProjects(
      [
        { id: 1, priority: 'slightly_desired', effort_level: 'High', est_cost: 0 },
        { id: 2, priority: 'slightly_desired', effort_level: 'Low', est_cost: 1000 }
      ],
      1
    );
    // effort only: Low (2) beats High (1); cost is ignored despite being huge
    expect(ids(ranked)).toEqual([2, 1]);
  });

  it('ignores effort when wEffort = 0', () => {
    const ranked = rankProjects(
      [
        { id: 1, priority: 'slightly_desired', effort_level: 'High', est_cost: 0 },
        { id: 2, priority: 'slightly_desired', effort_level: 'Low', est_cost: 1000 }
      ],
      0
    );
    // cost only: cheaper (id 1) ranks higher; effort ignored
    expect(ids(ranked)).toEqual([1, 2]);
  });

  it('normalizes cost against the set max with no divide-by-zero when all costs are 0', () => {
    const ranked = rankProjects(
      [
        { id: 1, priority: 'slightly_desired', effort_level: 'Low', est_cost: 0 },
        { id: 2, priority: 'slightly_desired', effort_level: 'High', est_cost: 0 }
      ],
      0
    );
    expect(ranked.every((p) => p.cost_norm === 0)).toBe(true);
    expect(ranked.every((p) => Number.isFinite(p.final_score))).toBe(true);
  });

  it('scores unknown/missing effort as Medium and unknown priority as slightly_desired', () => {
    const ranked = rankProjects([{ id: 1, priority: 'bogus', effort_level: null, est_cost: 30 }], 1);
    expect(ranked[0].effort_norm).toBeCloseTo(2 / 3);
    // slightly_desired weight 0.3 → final = base / 0.3
    expect(ranked[0].final_score).toBeCloseTo(ranked[0].base_score / 0.3);
  });

  it('produces a deterministic full ordering for a mixed set', () => {
    const ranked = rankProjects(
      [
        { id: 1, priority: 'dreams', effort_level: 'Low', est_cost: 0 },
        { id: 2, priority: 'urgent_fix', effort_level: 'High', est_cost: 500 },
        { id: 3, priority: 'highly_desired', effort_level: 'Medium', est_cost: 100 },
        { id: 4, priority: 'slightly_desired', effort_level: 'Low', est_cost: 50 }
      ],
      0.5
    );
    // final scores: id3≈0.578, id4≈0.722, id2=1.0, id1≈3.333 (dreams sinks despite $0/Low)
    expect(ids(ranked)).toEqual([3, 4, 2, 1]);
    ranked.forEach((p, i) => expect(p.rank).toBe(i + 1));
  });

  it('breaks ties deterministically by priority_weight, then cost, then id', () => {
    const a = rankProjects(
      [
        { id: 5, priority: 'slightly_desired', effort_level: 'Low', est_cost: 0 },
        { id: 3, priority: 'slightly_desired', effort_level: 'Low', est_cost: 0 }
      ],
      0.5
    );
    expect(ids(a)).toEqual([3, 5]);
  });

  it('does not mutate the input projects', () => {
    const input = [{ id: 1, priority: 'dreams', effort_level: 'Low', est_cost: 10 }];
    rankProjects(input, 0.5);
    expect(input[0]).toEqual({ id: 1, priority: 'dreams', effort_level: 'Low', est_cost: 10 });
  });

  it('clamps wEffort outside [0,1]', () => {
    const high = rankProjects([{ id: 1, priority: 'urgent_fix', effort_level: 'High', est_cost: 100 }], 5);
    const one = rankProjects([{ id: 1, priority: 'urgent_fix', effort_level: 'High', est_cost: 100 }], 1);
    expect(high[0].base_score).toBeCloseTo(one[0].base_score);
  });
});
