import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

const nav = [
  { group: "Overview", items: [{ to: "/", label: "Dashboard", end: true }] },
  {
    group: "Transact",
    items: [
      { to: "/new", label: "New Transaction" },
      { to: "/outbox", label: "Outbox" },
      { to: "/inbox", label: "Inbox" },
      { to: "/connections", label: "Connections" },
    ],
  },
  {
    group: "Reports",
    items: [
      { to: "/reports/ledger", label: "Ledger" },
      { to: "/reports/trial-balance", label: "Trial Balance" },
      { to: "/reports/reconciliation", label: "Reconciliation" },
      { to: "/reports/receivables-payables", label: "Receivables / Payables" },
    ],
  },
];

export default function Layout() {
  const { company, logout } = useAuth();

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">iT</div>
          <div>
            <div className="brand-name">iTransAcct</div>
            <div className="brand-tagline">single entry · dual books</div>
          </div>
        </div>

        {company && (
          <div className="company-card">
            <div className="name">{company.name}</div>
            <div className="code">code: {company.connect_code}</div>
          </div>
        )}

        <nav className="nav" style={{ flex: 1 }}>
          {nav.map((section) => (
            <div key={section.group}>
              <div className="nav-group-label">{section.group}</div>
              {section.items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) => (isActive ? "active" : "")}
                >
                  {item.label}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>

        <div className="sidebar-footer">
          <button className="logout-btn" onClick={logout}>
            Sign out
          </button>
        </div>
      </aside>

      <main className="main">
        <Outlet />
      </main>
    </div>
  );
}
