import { NavLink, Outlet } from "react-router-dom";

/** App shell: a full-width top nav shared across the archive and sources pages. */
export function Layout() {
  return (
    <>
      <nav className="top-nav">
        <div className="top-nav-inner">
          <span className="top-nav-brand">Competitor Intelligence</span>
          <div className="top-nav-links">
            <NavLink to="/" end className={navClass}>
              Feed
            </NavLink>
            <NavLink to="/competitors" className={navClass}>
              Competitors
            </NavLink>
            <NavLink to="/categories" className={navClass}>
              Categories
            </NavLink>
            <NavLink to="/training" className={navClass}>
              Training
            </NavLink>
            <NavLink to="/sources" className={navClass}>
              Sources
            </NavLink>
          </div>
        </div>
      </nav>
      <Outlet />
    </>
  );
}

function navClass({ isActive }: { isActive: boolean }): string {
  return isActive ? "top-nav-link active" : "top-nav-link";
}
