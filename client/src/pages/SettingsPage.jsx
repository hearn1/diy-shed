import { useEffect, useState } from 'react';
import { getHealth, setProvider } from '../api/client.js';
import ProviderPicker from '../components/ProviderPicker.jsx';
import ProviderStatus from '../components/ProviderStatus.jsx';
import { PROVIDER_META, providerEntry } from '../providerMeta.js';

export default function SettingsPage() {
  const [health, setHealth] = useState(null);
  const [current, setCurrent] = useState(null);
  const [choice, setChoice] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [message, setMessage] = useState(null);

  useEffect(() => {
    getHealth()
      .then((h) => {
        setHealth(h);
        setCurrent(h?.selectedProvider ?? null);
        setChoice(h?.selectedProvider ?? 'none');
      })
      .catch((err) => setError(err.message));
  }, []);

  async function testConnection() {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      setHealth(await getHealth());
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const res = await setProvider(choice === 'none' ? null : choice);
      setCurrent(res.ai_provider);
      setMessage(res.ai_provider ? 'Provider saved.' : 'Research turned off.');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const currentMeta = current ? PROVIDER_META[current] : null;
  const choiceEntry = choice && choice !== 'none' ? providerEntry(health, choice) : null;

  return (
    <section className="setup">
      <h2>Settings</h2>

      <h3>AI research provider</h3>
      <p className="setup-intro">
        Switching only affects future research - projects already researched keep the provider they were
        made with. Your data stays local; only the provider&apos;s web searches leave your machine.
      </p>

      <p>
        <strong>Current provider:</strong> {currentMeta ? currentMeta.label : 'None (manual entry only)'}
      </p>
      {current && <ProviderStatus entry={providerEntry(health, current)} providerId={current} />}

      <div className="setup-step">
        <h3>Switch provider</h3>
        <ProviderPicker selected={choice} onSelect={setChoice} />
        <p className="provider-blurb">
          Gemini is free for personal Google accounts (~60 requests/min, 1,000/day).
        </p>
        {choiceEntry && <ProviderStatus entry={choiceEntry} providerId={choice} />}
        <div className="actions">
          <button type="button" onClick={testConnection} disabled={busy}>
            {busy ? 'Working...' : 'Test connection'}
          </button>
          <button type="button" className="primary" onClick={save} disabled={busy || choice === null}>
            Save provider
          </button>
        </div>
        {message && <p className="setup-ready">{message}</p>}
        {error && <p className="error">{error}</p>}
      </div>
    </section>
  );
}
