import { describe, it, expect } from 'vitest';
import { isKeptOnRerun, mergeStepsForRerun } from './steps.js';

function step(overrides) {
  return { id: 1, text: 'Do it', done: 0, source: 'research', position: 0, ...overrides };
}

describe('isKeptOnRerun', () => {
  it('keeps manual steps regardless of done state', () => {
    expect(isKeptOnRerun(step({ source: 'manual', done: 0 }))).toBe(true);
    expect(isKeptOnRerun(step({ source: 'manual', done: 1 }))).toBe(true);
  });

  it('keeps completed research steps', () => {
    expect(isKeptOnRerun(step({ source: 'research', done: 1 }))).toBe(true);
  });

  it('does not keep incomplete, untouched research steps', () => {
    expect(isKeptOnRerun(step({ source: 'research', done: 0 }))).toBe(false);
  });
});

describe('mergeStepsForRerun', () => {
  it('with no existing steps, plans every new step as an insert from position 0', () => {
    const { keptPlan, replacedIds, insertPlan } = mergeStepsForRerun([], ['Cut lumber', 'Assemble walls']);
    expect(keptPlan).toEqual([]);
    expect(replacedIds).toEqual([]);
    expect(insertPlan).toEqual([
      { text: 'Cut lumber', position: 0 },
      { text: 'Assemble walls', position: 1 }
    ]);
  });

  it('keeps manual steps, completed research steps and edited (now-manual) steps; replaces incomplete untouched ones', () => {
    // Mirrors acceptance scenario 7: a manual step, a completed AI step, an
    // incomplete untouched AI step, and an AI step whose text was edited
    // (which the route already flipped to source='manual').
    const existing = [
      step({ id: 1, text: 'My own prep step', done: 0, source: 'manual', position: 0 }),
      step({ id: 2, text: 'Mark out the frame', done: 1, source: 'research', position: 1 }),
      step({ id: 3, text: 'Cut the lumber', done: 0, source: 'research', position: 2 }),
      step({ id: 4, text: 'Assemble the walls (edited)', done: 0, source: 'manual', position: 3 })
    ];
    const newStepTexts = ['Mark out the frame', 'Cut the lumber to size', 'Raise the frame', 'Add the roof'];

    const { keptPlan, replacedIds, insertPlan } = mergeStepsForRerun(existing, newStepTexts);

    expect(keptPlan).toEqual([
      { id: 1, position: 0 },
      { id: 2, position: 1 },
      { id: 4, position: 2 }
    ]);
    expect(replacedIds).toEqual([3]);
    expect(insertPlan).toEqual([
      { text: 'Mark out the frame', position: 3 },
      { text: 'Cut the lumber to size', position: 4 },
      { text: 'Raise the frame', position: 5 },
      { text: 'Add the roof', position: 6 }
    ]);
  });

  it('preserves the relative order of kept steps even when interleaved with replaced ones', () => {
    const existing = [
      step({ id: 1, done: 0, source: 'research', position: 0 }), // replaced
      step({ id: 2, done: 1, source: 'research', position: 1 }), // kept
      step({ id: 3, done: 0, source: 'research', position: 2 }), // replaced
      step({ id: 4, done: 0, source: 'manual', position: 3 }) // kept
    ];
    const { keptPlan, replacedIds } = mergeStepsForRerun(existing, []);
    expect(keptPlan.map((p) => p.id)).toEqual([2, 4]);
    expect(replacedIds).toEqual([1, 3]);
  });

  it('replaces every step when nothing was manual or completed', () => {
    const existing = [step({ id: 1, done: 0, source: 'research' }), step({ id: 2, done: 0, source: 'research' })];
    const { keptPlan, replacedIds, insertPlan } = mergeStepsForRerun(existing, ['New step']);
    expect(keptPlan).toEqual([]);
    expect(replacedIds).toEqual([1, 2]);
    expect(insertPlan).toEqual([{ text: 'New step', position: 0 }]);
  });

  it('keeps everything and inserts nothing when the new research produced no distinct steps beyond what is kept', () => {
    const existing = [step({ id: 1, done: 1, source: 'research' })];
    const { keptPlan, replacedIds, insertPlan } = mergeStepsForRerun(existing, []);
    expect(keptPlan).toEqual([{ id: 1, position: 0 }]);
    expect(replacedIds).toEqual([]);
    expect(insertPlan).toEqual([]);
  });
});
