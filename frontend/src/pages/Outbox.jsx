import { useEffect, useState } from "react";
import { api } from "../api/client";
import StateStamp from "../components/StateStamp";

function fmt(n) {
  return Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const FILTERS = ["ALL", "DRAFT", "SENT", "TAKEN", "REJECTED"];

export default function Outbox() {
  const [filter, setFilter] = useState("ALL");
  const [txns, setTxns] = useState([]);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState(null);

  function load() {
    api.outbox(filter === "ALL" ? undefined : filter).then(setTxns).catch((e) => setError(e.message));
  }

  useEffect(load, [filter]);

  async function send(id) {
    setBusyId(id);
    setError("");
    try {
      await api.sendTransaction(id);
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Outbox</div>
          <div className="page-subtitle">Everything you've initiated — drafts, sent, and acknowledged.</div>
        </div>
      </div>

      <div className="pill-select" style={{ marginBottom: 16 }}>
        {FILTERS.map((f) => (
          <button key={f} className={filter === f ? "active" : ""} onClick={() => setFilter(f)}>
            {f === "ALL" ? "All" : f.charAt(0) + f.slice(1).toLowerCase()}
          </button>
        ))}
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      <div className="card">
        {txns.length === 0 ? (
          <div className="empty-state">Nothing here yet.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Date</th><th>To</th><th>Type</th><th>Voucher</th>
                <th className="right">Amount</th><th>State</th><th></th>
              </tr>
            </thead>
            <tbody>
              {txns.map((t) => (
                <tr key={t.id}>
                  <td className="mono">{t.txn_date}</td>
                  <td>{t.recipient_company_name}</td>
                  <td>{t.type === "SALE_PURCHASE" ? "Sale" : "Payment"}</td>
                  <td className="mono">{t.voucher_no || "—"}</td>
                  <td className="num">{fmt(t.total_amount)}</td>
                  <td><StateStamp state={t.state} /></td>
                  <td className="right">
                    {t.state === "DRAFT" && (
                      <button className="btn btn-primary btn-sm" onClick={() => send(t.id)} disabled={busyId === t.id}>
                        {busyId === t.id ? "Sending…" : "Send"}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
