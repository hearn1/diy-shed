import { useEffect, useState } from 'react';
import { NavLink, Outlet, Link } from 'react-router-dom';
import { getHealth } from '../api/client.js';

export default function Layout() {
  const [health, setHealth] = useState(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    getHealth()
      .then(setHealth)
      .catch(() => setHealth(null));
  }, []);

  const noProvider = health ? !health.selectedProvider : false;

  return (
    <div className="app">
      <header className="app-header">
        <h1 className="app-title">diy-shed</h1>
        <nav className="app-nav">
          <NavLink to="/" end>
            Projects
          </NavLink>
          <NavLink to="/inventory">Inventory</NavLink>
        </nav>
      </header>
      {noProvider && !dismissed && (
        <div className="banner" role="alert">
          <span>
            <strong>Finish setting up AI research.</strong> No provider is selected
            yet, so automated project research is off - you can still add projects
            and enter tools, materials, and effort manually.{' '}
            <Link to="/setup">Set up AI research</Link>.
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
