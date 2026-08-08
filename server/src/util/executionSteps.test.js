import { describe, it, expect } from 'vitest';
import { planStepMerge } from './executionSteps.js';

function step(overrides) {
  return { id: 1, text: 'Do a thing', done: 0, source: 'manual', position: 0, ...overrides };
}

describe('planStepMerge', () => {
  it('keeps manual steps and drops them from removeIds', () => {
    const existing = [step({ id: 1, source: 'manual', position: 0 })];
    const { removeIds, toInsert } = planStepMerge(existing, ['New AI step']);
    expect(removeIds).toEqual([]);
    expect(toInsert).toEqual([{ text: 'New AI step', position: 1 }]);
  });

  it('keeps completed research steps, still marked done, and does not re-insert them', () => {
    const existing = [step({ id: 2, source: 'research', done: 1, position: 0 })];
    const { removeIds, toInsert } = planStepMerge(existing, ['New AI step']);
    expect(removeIds).toEqual([]);
    expect(toInsert).toEqual([{ text: 'New AI step', position: 1 }]);
  });

  it('removes incomplete untouched research steps', () => {
    const existing = [step({ id: 3, source: 'research', done: 0, position: 0 })];
    const { removeIds } = planStepMerge(existing, ['New AI step']);
    expect(removeIds).toEqual([3]);
  });

  it('handles a mixed checklist: manual, completed AI, incomplete AI, edited-AI-now-manual', () => {
    const existing = [
      step({ id: 1, source: 'manual', position: 0 }), // user-added
      step({ id: 2, source: 'research', done: 1, position: 1 }), // completed AI step
      step({ id: 3, source: 'research', done: 0, position: 2 }), // incomplete untouched AI step
      step({ id: 4, source: 'manual', position: 3 }) // AI step whose text was edited (already flipped to manual)
    ];
    const { removeIds, toInsert } = planStepMerge(existing, ['Fresh step A', 'Fresh step B']);
    expect(removeIds).toEqual([3]);
    expect(toInsert).toEqual([
      { text: 'Fresh step A', position: 4 },
      { text: 'Fresh step B', position: 5 }
    ]);
  });

  it('starts new positions at 0 when nothing is kept', () => {
    const existing = [step({ id: 1, source: 'research', done: 0, position: 5 })];
    const { removeIds, toInsert } = planStepMerge(existing, ['Only step']);
    expect(removeIds).toEqual([1]);
    expect(toInsert).toEqual([{ text: 'Only step', position: 0 }]);
  });

  it('handles an empty existing checklist', () => {
    const { removeIds, toInsert } = planStepMerge([], ['A', 'B', 'C']);
    expect(removeIds).toEqual([]);
    expect(toInsert).toEqual([
      { text: 'A', position: 0 },
      { text: 'B', position: 1 },
      { text: 'C', position: 2 }
    ]);
  });

  it('inserts nothing when the new research produced no steps', () => {
    const existing = [step({ id: 1, source: 'manual', position: 0 })];
    const { removeIds, toInsert } = planStepMerge(existing, []);
    expect(removeIds).toEqual([]);
    expect(toInsert).toEqual([]);
  });
});
