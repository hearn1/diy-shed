import { NavLink, Outlet } from 'react-router-dom';

export default function Layout() {
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
      <main className="app-main">
        <Outlet />
      </main>
    </div>
  );
}
