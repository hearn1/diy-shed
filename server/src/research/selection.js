import { providerIds, getProvider, getProviderAvailability } from './providers/index.js';

const SETTING_KEY = 'ai_provider';

// The chosen provider id, or null when unset. M6 has no silent default: an
// unset selection means "not configured", not "fall back to Claude".
export function getSelectedProviderId(db) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(SETTING_KEY);
  return row && row.value ? row.value : null;
}

export function setSelectedProviderId(db, id) {
  if (id === null) {
    db.prepare('DELETE FROM settings WHERE key = ?').run(SETTING_KEY);
    return null;
  }
  if (!providerIds.includes(id)) throw new Error(`Unknown AI provider: ${id}`);
  db.prepare(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
  ).run(SETTING_KEY, id);
  return id;
}

// Whether the currently-selected provider is installed and runnable. Used to
// gate auto-research on create — mirrors the old isClaudeAvailable() gate.
export async function isSelectedProviderAvailable(db) {
  const id = getSelectedProviderId(db);
  if (!id || !getProvider(id)) return false;
  return Boolean((await getProviderAvailability(id)).available);
}
