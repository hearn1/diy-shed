// Re-running research must never silently destroy checklist work. A step
// survives a re-run if the user owns it — either because they added it
// themselves, or because they have already checked it off (the ProjectSteps
// route flips a research step's source to 'manual' the moment its text is
// edited, so "owns it" is fully captured by `source`). Everything else —
// research-sourced steps still incomplete and untouched — is replaced.
export function partitionStepsForRerun(steps) {
  const keep = [];
  const remove = [];
  for (const step of steps) {
    const owned = step.source === 'manual' || (step.source === 'research' && !!step.done);
    (owned ? keep : remove).push(step);
  }
  return { keep, remove };
}
