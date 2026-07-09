export function tokens(normalizedName) {
  return String(normalizedName ?? '')
    .split(/\s+/)
    .filter((t) => t.length > 0);
}

function isSubset(a, b) {
  if (a.length === 0) return false;
  const set = new Set(b);
  return a.every((t) => set.has(t));
}

export function isFuzzyMatch(itemNorm, invNorm) {
  const itemTokens = tokens(itemNorm);
  const invTokens = tokens(invNorm);
  return isSubset(itemTokens, invTokens) || isSubset(invTokens, itemTokens);
}

export function findInventoryMatch(item, inventory) {
  const candidates = inventory
    .filter((row) => row.type === item.type && isFuzzyMatch(item.normalized_name, row.normalized_name))
    .sort((a, b) => a.id - b.id);
  return candidates.length > 0 ? candidates[0] : null;
}
