// Pure rerun-merge logic for a project's execution checklist (project_steps).
// Kept separate from runner.js so the preservation rules can be unit tested
// without touching the database.
//
// Rerun preservation rules:
//  - a user-added step (source='manual') is always kept, with its done state
//    and its position relative to other kept steps.
//  - an AI-generated step (source='research') the user has already completed
//    is kept, still marked done.
//  - an AI-generated step that is incomplete and untouched is replaced by the
//    newly researched steps.
//  - editing an AI step's text flips its source to 'manual' (handled by the
//    steps route, not here), so from then on it is kept by the first rule.
//
// New steps are appended after the kept ones, in the order research returned
// them; the position field on the returned plan is what the caller should
// write, renumbered from 0.

export function isKeptOnRerun(step) {
  return step.source === 'manual' || !!step.done;
}

export function mergeStepsForRerun(existingSteps, newStepTexts) {
  const kept = existingSteps.filter(isKeptOnRerun);
  const replacedIds = existingSteps.filter((step) => !isKeptOnRerun(step)).map((step) => step.id);
  const keptPlan = kept.map((step, i) => ({ id: step.id, position: i }));
  const insertPlan = newStepTexts.map((text, i) => ({ text, position: kept.length + i }));
  return { keptPlan, replacedIds, insertPlan };
}
