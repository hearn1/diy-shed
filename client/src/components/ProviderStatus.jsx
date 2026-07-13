import { PROVIDER_META, STATUS_LABEL, deriveStatus, statusHint } from '../providerMeta.js';

// Shared status line for a provider's /api/health entry: a colored state label
// plus the provider-specific fix hint. Reused by the wizard, settings, and the
// banner so their copy stays identical.
export default function ProviderStatus({ entry, providerId }) {
  const id = providerId ?? entry?.id;
  const status = deriveStatus(entry);
  const meta = PROVIDER_META[id];
  const hint = statusHint(id, status);
  return (
    <div className={`provider-status status-${status}`} role="status">
      <strong>
        {meta?.label ?? id}: {STATUS_LABEL[status]}
      </strong>
      {status === 'ready' && <span className="provider-hint"> Signed in and ready to research.</span>}
      {hint && <span className="provider-hint"> {hint}</span>}
    </div>
  );
}
