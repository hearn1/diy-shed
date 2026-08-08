// Pure planning logic for merging freshly researched steps into an existing
// checklist on re-run. Kept free of the db so the re-run preservation rules
// can be unit tested without a transaction:
//   - steps the user added, or whose text the user edited (source flipped to
//     'manual' by the route on edit), are always kept as-is;
//   - AI-generated steps the user has already checked off are kept, still done;
//   - AI-generated steps that are incomplete and untouched are replaced.
// Kept steps keep their existing position; newly researched steps are
// appended after them in the order the provider returned them.
export function planStepMerge(existingSteps, newStepTexts) {
  const keep = existingSteps.filter((s) => s.source === 'manual' || (s.source === 'research' && !!s.done));
  const removeIds = existingSteps
    .filter((s) => !(s.source === 'manual' || (s.source === 'research' && !!s.done)))
    .map((s) => s.id);

  const maxPosition = keep.reduce((max, s) => Math.max(max, s.position), -1);
  const toInsert = newStepTexts.map((text, i) => ({ text, position: maxPosition + 1 + i }));

  return { removeIds, toInsert };
}
