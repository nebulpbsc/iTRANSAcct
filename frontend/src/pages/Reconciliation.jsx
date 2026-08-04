import { useEffect, useState } from "react";
import { api } from "../api/client";
import StateStamp from "../components/StateStamp";

function fmt(n) {
  return Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function Reconciliation() {
  const [connections, setConnections] = useState([]);
  const [counterpartyId, setCounterpartyId] = useState("");
  const [report, setReport] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api.connections().then((c) => {
      setConnections(c);
      if (c.length) setCounterpartyId(c[0].id);
    }).catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    if (!counterpartyId) return;
    api.reconciliation(counterpartyId).then(setReport).catch((e) => setError(e.message));
  }, [counterpartyId]);

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Reconciliation</div>
          <div className="page-subtitle">
            Compares your books against the counterparty's — no manual matching, since both sides post the
            same mirrored figures.
          </div>
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      <div className="card card-pad">
        <div className="field" style={{ marginBottom: 0, maxWidth: 320 }}>
          <label>Counterparty</label>
          <select className="input" value={counterpartyId} onChange={(e) => setCounterpartyId(e.target.value)}>
            {connections.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
      </div>

      {report && (
        <>
          <div className="stat-grid">
            <div className="stat-card">
              <div className="stat-label">As per our books</div>
              <div className={`stat-value ${report.our_balance >= 0 ? "positive" : "negative"}`}>
                {fmt(report.our_balance)}
              </div>
              <div className="text-muted mt-8" style={{ fontSize: 11.5 }}>
                {report.our_balance >= 0 ? "They owe us" : "We owe them"}
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Mirrored on their books</div>
              <div className={`stat-value ${report.their_balance_mirrored >= 0 ? "positive" : "negative"}`}>
                {fmt(report.their_balance_mirrored)}
              </div>
              <div className="text-muted mt-8" style={{ fontSize: 11.5 }}>
                Should equal the exact opposite of our balance
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-header"><h3>{report.counterparty_name} — transaction history</h3></div>
            {report.rows.length === 0 ? (
              <div className="empty-state">No transactions with this company yet.</div>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Date</th><th>Voucher</th><th>Type</th>
                    <th className="right">Our books</th><th className="right">Their books</th><th>State</th>
                  </tr>
                </thead>
                <tbody>
                  {report.rows.map((r) => (
                    <tr key={r.transaction_id}>
                      <td className="mono">{r.txn_date}</td>
                      <td className="mono">{r.voucher_no || "—"}</td>
                      <td>{r.type === "SALE_PURCHASE" ? "Sale / Purchase" : "Payment / Receipt"}</td>
                      <td className="num">{r.amount_our_books ? fmt(r.amount_our_books) : "—"}</td>
                      <td className="num">{r.amount_their_books ? fmt(r.amount_their_books) : "—"}</td>
                      <td><StateStamp state={r.state} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </div>
  );
}
