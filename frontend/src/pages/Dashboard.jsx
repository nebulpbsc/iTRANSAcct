import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import { useAuth } from "../context/AuthContext";
import StateStamp from "../components/StateStamp";

function fmt(n) {
  return Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function Dashboard() {
  const { company } = useAuth();
  const [rp, setRp] = useState(null);
  const [inbox, setInbox] = useState([]);
  const [drafts, setDrafts] = useState([]);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([
      api.receivablesPayables(),
      api.inbox("SENT"),
      api.outbox("DRAFT"),
    ])
      .then(([rpData, inboxData, draftsData]) => {
        setRp(rpData);
        setInbox(inboxData);
        setDrafts(draftsData);
      })
      .catch((e) => setError(e.message));
  }, []);

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Welcome back, {company?.name}</div>
          <div className="page-subtitle">Everything here is auto-posted — no journal entry screen exists.</div>
        </div>
        <Link to="/new" className="btn btn-primary">+ New Transaction</Link>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      <div className="stat-grid">
        <div className="stat-card">
          <div className="stat-label">Total Receivable</div>
          <div className="stat-value positive">{rp ? fmt(rp.total_receivable) : "—"}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Total Payable</div>
          <div className="stat-value negative">{rp ? fmt(rp.total_payable) : "—"}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Awaiting your acknowledgment</div>
          <div className="stat-value">{inbox.length}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Unsent drafts</div>
          <div className="stat-value">{drafts.length}</div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h3>Pending in your Inbox</h3>
          <Link to="/inbox" className="btn btn-ghost btn-sm">View all</Link>
        </div>
        {inbox.length === 0 ? (
          <div className="empty-state">Nothing waiting on you right now.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>From</th><th>Type</th><th>Voucher</th><th className="right">Amount</th><th>State</th>
              </tr>
            </thead>
            <tbody>
              {inbox.slice(0, 5).map((t) => (
                <tr key={t.id}>
                  <td>{t.sender_company_name}</td>
                  <td>{t.type === "SALE_PURCHASE" ? "Purchase (their Sale)" : "Receipt (their Payment)"}</td>
                  <td className="mono">{t.voucher_no}</td>
                  <td className="num">{fmt(t.total_amount)}</td>
                  <td><StateStamp state={t.state} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card">
        <div className="card-header">
          <h3>Your unsent drafts</h3>
          <Link to="/outbox" className="btn btn-ghost btn-sm">View all</Link>
        </div>
        {drafts.length === 0 ? (
          <div className="empty-state">No drafts waiting to be sent.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>To</th><th>Type</th><th className="right">Amount</th><th>State</th>
              </tr>
            </thead>
            <tbody>
              {drafts.slice(0, 5).map((t) => (
                <tr key={t.id}>
                  <td>{t.recipient_company_name}</td>
                  <td>{t.type === "SALE_PURCHASE" ? "Sale" : "Payment"}</td>
                  <td className="num">{fmt(t.total_amount)}</td>
                  <td><StateStamp state={t.state} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
