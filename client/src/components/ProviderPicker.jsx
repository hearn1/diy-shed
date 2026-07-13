import { PROVIDER_META, PROVIDER_ORDER } from '../providerMeta.js';

// Reused by the first-run wizard (6.6) and the settings screen (6.7): a set of
// selectable provider cards plus an optional "Continue without AI" card.
export default function ProviderPicker({ selected, onSelect, includeNone = true }) {
  return (
    <div className="provider-picker" role="radiogroup" aria-label="AI research provider">
      {PROVIDER_ORDER.map((id) => {
        const meta = PROVIDER_META[id];
        return (
          <button
            type="button"
            key={id}
            role="radio"
            aria-checked={selected === id}
            className={`provider-card${selected === id ? ' selected' : ''}`}
            onClick={() => onSelect(id)}
          >
            <span className="provider-card-head">
              <span className="provider-name">{meta.label}</span>
              {meta.tagline && <span className="provider-tag">{meta.tagline}</span>}
            </span>
            <span className="provider-blurb">{meta.blurb}</span>
          </button>
        );
      })}
      {includeNone && (
        <button
          type="button"
          role="radio"
          aria-checked={selected === 'none'}
          className={`provider-card${selected === 'none' ? ' selected' : ''}`}
          onClick={() => onSelect('none')}
        >
          <span className="provider-card-head">
            <span className="provider-name">Continue without AI</span>
          </span>
          <span className="provider-blurb">
            Keep entering tools, materials, and effort manually. No research runs.
          </span>
        </button>
      )}
    </div>
  );
}
