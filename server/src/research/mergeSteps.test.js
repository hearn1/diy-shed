import { describe, it, expect } from 'vitest';
import { partitionStepsForRerun } from './mergeSteps.js';

function step(overrides) {
  return { id: 1, text: 'Do it', done: false, source: 'manual', position: 0, ...overrides };
}

describe('partitionStepsForRerun', () => {
  it('keeps a manually-added step regardless of done state', () => {
    const incomplete = step({ id: 1, source: 'manual', done: false });
    const complete = step({ id: 2, source: 'manual', done: true });
    const { keep, remove } = partitionStepsForRerun([incomplete, complete]);
    expect(keep).toEqual([incomplete, complete]);
    expect(remove).toEqual([]);
  });

  it('keeps a completed research step', () => {
    const s = step({ id: 1, source: 'research', done: true });
    const { keep, remove } = partitionStepsForRerun([s]);
    expect(keep).toEqual([s]);
    expect(remove).toEqual([]);
  });

  it('removes an incomplete, untouched research step', () => {
    const s = step({ id: 1, source: 'research', done: false });
    const { keep, remove } = partitionStepsForRerun([s]);
    expect(keep).toEqual([]);
    expect(remove).toEqual([s]);
  });

  it('keeps a research step whose text was edited, because that flips its source to manual', () => {
    // ProjectSteps route is responsible for the flip; this function only
    // trusts whatever source is on the row it's given.
    const edited = step({ id: 1, source: 'manual', done: false });
    const { keep } = partitionStepsForRerun([edited]);
    expect(keep).toEqual([edited]);
  });

  it('preserves relative order of kept steps and drops removed ones from the middle', () => {
    const manual = step({ id: 1, source: 'manual', done: false, position: 0 });
    const untouched = step({ id: 2, source: 'research', done: false, position: 1 });
    const completed = step({ id: 3, source: 'research', done: true, position: 2 });
    const { keep, remove } = partitionStepsForRerun([manual, untouched, completed]);
    expect(keep.map((s) => s.id)).toEqual([1, 3]);
    expect(remove.map((s) => s.id)).toEqual([2]);
  });

  it('handles an empty list', () => {
    expect(partitionStepsForRerun([])).toEqual({ keep: [], remove: [] });
  });
});
