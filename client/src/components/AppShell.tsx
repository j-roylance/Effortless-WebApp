import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

/** Main chrome: header, bottom tabs, FAB on task and vision list routes only. */
export function AppShell() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const isTasksList = location.pathname === "/";
  const isVisionsList = location.pathname === "/visions";

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

      {isVisionsList && (
        <NavLink to="/visions/new" className="fab" aria-label="Add vision">
          +
        </NavLink>
      )}

      <nav className="tab-bar tab-bar--six">
        <NavLink to="/" end className={({ isActive }) => (isActive ? "active" : "")}>
          Tasks
        </NavLink>
        <NavLink to="/calendar" className={({ isActive }) => (isActive ? "active" : "")}>
          Calendar
        </NavLink>
        <NavLink to="/likes" className={({ isActive }) => (isActive ? "active" : "")}>
          Likes
        </NavLink>
        <NavLink to="/daily-settings" className={({ isActive }) => (isActive ? "active" : "")}>
          Settings
        </NavLink>
        <NavLink to="/visions" className={({ isActive }) => (isActive ? "active" : "")}>
          Vision
        </NavLink>
        <NavLink to="/ai" className={({ isActive }) => (isActive ? "active" : "")}>
          AI
        </NavLink>
      </nav>
    </div>
  );
}
