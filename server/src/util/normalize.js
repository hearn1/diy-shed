export function normalizeName(s) {
  return String(s).trim().toLowerCase().replace(/\s+/g, ' ');
}
