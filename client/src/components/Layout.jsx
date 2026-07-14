import { useEffect, useState } from 'react';
import { NavLink, Outlet, Link } from 'react-router-dom';
import { getHealth } from '../api/client.js';
import { PROVIDER_META, providerEntry, deriveStatus, statusHint } from '../providerMeta.js';

// Maps the provider-aware health payload to the one banner (if any) to show:
// no provider selected, or the selected provider not installed / signed out.
function bannerFor(health) {
  if (!health) return null;
  const id = health.selectedProvider;
  if (!id) {
    return {
      lead: 'Finish setting up AI research.',
      body: 'No provider is selected yet, so automated project research is off - you can still add projects and enter tools, materials, and effort manually.',
      to: '/setup',
      linkText: 'Set up AI research'
    };
  }
  const meta = PROVIDER_META[id];
  const label = meta?.label ?? id;
  const status = deriveStatus(providerEntry(health, id));
  if (status === 'not_installed') {
    return {
      lead: `${label} is not installed.`,
      body: `${statusHint(id, status)} Automated research is off until then - you can still enter everything manually.`,
      to: '/settings',
      linkText: 'Open Settings'
    };
  }
  if (status === 'signed_out') {
    return {
      lead: `Sign in to ${label} to enable research.`,
      body: `${statusHint(id, status)} You can still enter tools, materials, and effort manually.`,
      to: '/settings',
      linkText: 'Open Settings'
    };
  }
  return null;
}

export default function Layout() {
  const [health, setHealth] = useState(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    getHealth()
      .then(setHealth)
      .catch(() => setHealth(null));
  }, []);

  const banner = bannerFor(health);

  return (
    <div className="app">
      <header className="app-header">
        <h1 className="app-title">diy-shed</h1>
        <nav className="app-nav">
          <NavLink to="/" end>
            Projects
          </NavLink>
          <NavLink to="/inventory">Inventory</NavLink>
          <NavLink to="/settings">Settings</NavLink>
        </nav>
      </header>
      {banner && !dismissed && (
        <div className="banner" role="alert">
          <span>
            <strong>{banner.lead}</strong> {banner.body} <Link to={banner.to}>{banner.linkText}</Link>.
          </span>
          <button type="button" onClick={() => setDismissed(true)} aria-label="Dismiss">
            Dismiss
          </button>
        </div>
      )}
      <main className="app-main">
        <Outlet />
      </main>
    </div>
  );
}
