import defaultDb from '../db/index.js';
import { listProviders, getProviderAvailability } from './providers/index.js';
import { getSelectedProviderId } from './selection.js';

// Provider-aware health: the stored selection plus each registered provider's
// availability (probed in parallel, cached by the registry so this is cheap).
// A top-level `claude: { available }` mirror is kept for backward compatibility
// with Layout.jsx, which still reads it until M6b migrates the client.
export async function getHealthStatus(deps = {}) {
  const db = deps.db || defaultDb;
  const providers = await Promise.all(
    listProviders().map(async (p) => {
      const a = await getProviderAvailability(p.id);
      return {
        id: p.id,
        label: p.label,
        available: Boolean(a.available),
        authenticated: a.authenticated ?? null,
        error: a.error ?? null
      };
    })
  );
  const claude = providers.find((p) => p.id === 'claude');
  return {
    status: 'ok',
    selectedProvider: getSelectedProviderId(db),
    providers,
    claude: { available: claude ? claude.available : false }
  };
}
