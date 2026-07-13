import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getHealth, setProvider } from '../api/client.js';
import ProviderPicker from '../components/ProviderPicker.jsx';
import ProviderStatus from '../components/ProviderStatus.jsx';
import { PROVIDER_META, providerEntry, deriveStatus } from '../providerMeta.js';

export default function SetupPage() {
  const navigate = useNavigate();
  const [selected, setSelected] = useState(null);
  const [entry, setEntry] = useState(null);
  const [status, setStatus] = useState(null);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState(null);
  const [saved, setSaved] = useState(false);

  function pick(id) {
    setSelected(id);
    setEntry(null);
    setStatus(null);
    setError(null);
    setSaved(false);
  }

  async function testConnection() {
    setTesting(true);
    setError(null);
    try {
      const health = await getHealth();
      const found = providerEntry(health, selected);
      const derived = deriveStatus(found);
      setEntry(found);
      setStatus(derived);
      if (derived === 'ready') {
        await setProvider(selected);
        setSaved(true);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setTesting(false);
    }
  }

  const meta = selected && selected !== 'none' ? PROVIDER_META[selected] : null;

  return (
    <section className="setup">
      <h2>Set up AI research</h2>
      <p className="setup-intro">
        diy-shed can research each project on the web to work out the tools, materials, effort, and cost.
        Choose how to power that - or continue entering everything yourself. Nothing is selected until you
        pick one, so no research runs until you finish here.
      </p>

      <ProviderPicker selected={selected} onSelect={pick} />

      {selected === 'none' && (
        <div className="setup-step">
          <p>No problem - you can set this up any time from Settings.</p>
          <button type="button" className="primary" onClick={() => navigate('/')}>
            Continue without AI
          </button>
        </div>
      )}

      {meta && (
        <div className="setup-step">
          <h3>Sign in to {meta.label}</h3>
          <p>{meta.signInSteps}</p>
          <button type="button" onClick={testConnection} disabled={testing}>
            {testing ? 'Testing...' : 'Test connection'}
          </button>
          {error && <p className="error">Could not test the connection: {error}</p>}
          {status && <ProviderStatus entry={entry} providerId={selected} />}
          {saved && (
            <div className="setup-done">
              <p className="setup-ready">You are ready - start adding projects.</p>
              <button type="button" className="primary" onClick={() => navigate('/')}>
                Go to projects
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
