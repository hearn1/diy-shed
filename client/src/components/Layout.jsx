import { useEffect, useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { getHealth } from '../api/client.js';

export default function Layout() {
  const [cliMissing, setCliMissing] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    getHealth()
      .then((health) => setCliMissing(health?.claude?.available === false))
      .catch(() => setCliMissing(false));
  }, []);

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
      {cliMissing && !dismissed && (
        <div className="banner" role="alert">
          <span>
            <strong>Claude Code CLI not found.</strong> Automated project research
            is disabled — you can still add projects and enter tools, materials,
            and effort manually. To enable research, install the Claude Code CLI,
            run <code>claude login</code>, and make sure <code>claude</code> is on
            your PATH.
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
