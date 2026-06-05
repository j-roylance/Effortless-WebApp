import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export function AppShell() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const isTasksList = location.pathname === "/";

  return (
    <div className="app-shell">
      <header
        style={{
          padding: "1rem",
          borderBottom: "1px solid var(--border)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <h1 className="logo" style={{ margin: 0, fontSize: "1rem", color: "var(--cyan)" }}>
          Effortless
        </h1>
        <button
          type="button"
          className="neon-btn neon-btn-sm"
          onClick={() => logout()}
          title={user?.email}
        >
          Log out
        </button>
      </header>

      <main className="main-content">
        <Outlet />
      </main>

      {isTasksList && (
        <NavLink to="/tasks/new" className="fab" aria-label="Add task">
          +
        </NavLink>
      )}

      <nav className="tab-bar">
        <NavLink to="/" end className={({ isActive }) => (isActive ? "active" : "")}>
          Tasks
        </NavLink>
        <NavLink to="/likes" className={({ isActive }) => (isActive ? "active" : "")}>
          Likes
        </NavLink>
      </nav>
    </div>
  );
}
