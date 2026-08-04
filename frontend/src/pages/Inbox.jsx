import { useEffect, useState, Fragment } from "react";
import { api } from "../api/client";
import StateStamp from "../components/StateStamp";

function fmt(n) {
  return Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const FILTERS = ["ALL", "SENT", "TAKEN", "REJECTED"];

export default function Inbox() {
  const [filter, setFilter] = useState("SENT");
  const [txns, setTxns] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState(null);
  const [pickingCashFor, setPickingCashFor] = useState(null);
  const [chosenCash, setChosenCash] = useState("");

  function load() {
    api.inbox(filter === "ALL" ? undefined : filter).then(setTxns).catch((e) => setError(e.message));
  }

  useEffect(load, [filter]);
  useEffect(() => { api.accounts().then(setAccounts).catch(() => {}); }, []);

  const cashAccounts = accounts.filter((a) => a.type === "STANDARD" && a.group === "ASSET");

  async function take(t) {
    // For payments, offer a chance to pick which of our accounts received the funds.
    if (t.type === "PAYMENT_RECEIPT" && pickingCashFor !== t.id) {
      setPickingCashFor(t.id);
      setChosenCash("");
      return;
    }
    setBusyId(t.id);
    setError("");
    try {
      await api.takeTransaction(t.id, t.type === "PAYMENT_RECEIPT" ? { recipient_cash_account_id: chosenCash || undefined } : {});
      setPickingCashFor(null);
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  }

  async function reject(id) {
    setBusyId(id);
    setError("");
    try {
      await api.rejectTransaction(id, {});
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
          <div className="page-title">Inbox</div>
          <div className="page-subtitle">
            Acknowledge with one click — no data entry. Taking a Sale posts your Purchase voucher automatically;
            taking a Payment posts your Receipt voucher automatically.
          </div>
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
          <div className="empty-state">Nothing here.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Date</th><th>From</th><th>Type</th><th>Voucher</th>
                <th className="right">Amount</th><th>State</th><th></th>
              </tr>
            </thead>
            <tbody>
              {txns.map((t) => (
                <Fragment key={t.id}>
                  <tr>
                    <td className="mono">{t.txn_date}</td>
                    <td>{t.sender_company_name}</td>
                    <td>{t.type === "SALE_PURCHASE" ? "Purchase (their Sale)" : "Receipt (their Payment)"}</td>
                    <td className="mono">{t.voucher_no || "—"}</td>
                    <td className="num">{fmt(t.total_amount)}</td>
                    <td><StateStamp state={t.state} /></td>
                    <td className="right">
                      {t.state === "SENT" && (
                        <div className="flex-gap" style={{ justifyContent: "flex-end" }}>
                          <button className="btn btn-primary btn-sm" onClick={() => take(t)} disabled={busyId === t.id}>
                            {pickingCashFor === t.id ? "Confirm Take" : "Take"}
                          </button>
                          <button className="btn btn-danger btn-sm" onClick={() => reject(t.id)} disabled={busyId === t.id}>
                            Reject
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                  {pickingCashFor === t.id && (
                    <tr>
                      <td colSpan={7} style={{ background: "var(--brand-tint)" }}>
                        <div className="flex-gap">
                          <span className="text-muted" style={{ fontSize: 12.5 }}>Received into:</span>
                          <select className="input" style={{ maxWidth: 260 }} value={chosenCash} onChange={(e) => setChosenCash(e.target.value)}>
                            <option value="">Cash Account (default)</option>
                            {cashAccounts.map((a) => (
                              <option key={a.id} value={a.id}>{a.name}</option>
                            ))}
                          </select>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
