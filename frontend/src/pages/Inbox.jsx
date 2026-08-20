import { useEffect, useState, Fragment } from "react";
import { api } from "../api/client";
import Modal from "../components/Modal";
import StateStamp from "../components/StateStamp";

function fmt(n) {
  return Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const FILTERS = ["ALL", "SENT", "TAKEN", "REJECTED"];

export default function Inbox() {
  const [filter, setFilter] = useState("SENT");
  const [txns, setTxns] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [heads, setHeads] = useState([]);
  const [mappings, setMappings] = useState([]);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState(null);
  const [pickingCashFor, setPickingCashFor] = useState(null);
  const [chosenCash, setChosenCash] = useState("");
  const [pickingPurchaseFor, setPickingPurchaseFor] = useState(null);
  const [chosenPurchaseAccount, setChosenPurchaseAccount] = useState("");
  const [viewing, setViewing] = useState(null);
  const [viewBusy, setViewBusy] = useState(false);
  const [viewError, setViewError] = useState("");
  const [lineAccountSelections, setLineAccountSelections] = useState({});

  function load() {
    api.inbox(filter === "ALL" ? undefined : filter).then(setTxns).catch((e) => setError(e.message));
  }

  useEffect(load, [filter]);
  useEffect(() => { api.accounts().then(setAccounts).catch(() => {}); api.accountHeads().then(setHeads).catch(()=>{}); api.accountMappings().then(setMappings).catch(()=>{}); }, []);

  const cashAccounts = accounts.filter((a) => a.type === "STANDARD" && a.group === "ASSET");
  const purchaseAccounts = accounts.filter((a) => a.type === "STANDARD" && a.group === "EXPENSE");

  async function viewTxn(id) {
    setViewError("");
    // immediately open modal in loading state so user sees feedback
    setViewing({ id: "__loading__", type: null, state: "LOADING", sender_company_name: "", txn_date: "", lines: [] });
    setViewBusy(true);
    try {
      const t = await api.getTransaction(id);
      setViewing(t);
      const initial = {};
      (t.lines || []).forEach((l) => { initial[l.id] = l.account_id || ""; });
      setLineAccountSelections(initial);
    } catch (err) {
      setViewError(err.message);
      // keep modal open to show error
    } finally {
      setViewBusy(false);
    }
  }

  async function take(t) {
    // For payments, offer a chance to pick which of our accounts received the funds.
    if (t.type === "PAYMENT_RECEIPT" && pickingCashFor !== t.id) {
      setPickingCashFor(t.id);
      setChosenCash("");
      return;
    }
    // For sale/purchase, allow choosing which Purchase account to post to.
    if (t.type === "SALE_PURCHASE" && pickingPurchaseFor !== t.id) {
      setPickingPurchaseFor(t.id);
      setChosenPurchaseAccount("");
      return;
    }
    setBusyId(t.id);
    setError("");
    try {
      const payload = t.type === "PAYMENT_RECEIPT"
        ? { recipient_cash_account_id: chosenCash || undefined }
        : t.type === "SALE_PURCHASE"
          ? { recipient_purchase_account_id: chosenPurchaseAccount || undefined }
          : {};
      await api.takeTransaction(t.id, payload);
      setPickingCashFor(null);
      setPickingPurchaseFor(null);
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
                          <button className="btn btn-ghost btn-sm" onClick={() => viewTxn(t.id)}>
                            View
                          </button>
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

                  {pickingPurchaseFor === t.id && (
                    <tr>
                      <td colSpan={7} style={{ background: "var(--brand-tint)" }}>
                        <div className="flex-gap">
                          <span className="text-muted" style={{ fontSize: 12.5 }}>Post to Purchase account:</span>
                          <select className="input" style={{ maxWidth: 260 }} value={chosenPurchaseAccount} onChange={(e) => setChosenPurchaseAccount(e.target.value)}>
                            <option value="">Purchase Account (default)</option>
                            {purchaseAccounts.map((a) => (
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

      {viewing && (
        <Modal onClose={() => setViewing(null)}>
          <button className="btn btn-ghost" onClick={() => setViewing(null)} disabled={viewBusy} style={{ position: "absolute", right: 12, top: 12 }}>Close</button>
          <div style={{ marginBottom: 8 }}>
            <div style={{ fontSize: 18, fontWeight: 700 }}>{viewing.state === 'LOADING' ? 'Loading…' : 'Transaction details'}</div>
            {viewing.state !== 'LOADING' && <div className="text-muted">{viewing.type === "SALE_PURCHASE" ? "Purchase" : "Receipt"} — {viewing.state}</div>}
          </div>
          {viewError && <div className="alert alert-error">{viewError}</div>}
          {viewing.state === 'LOADING' ? (
            <div>Loading transaction…</div>
          ) : (
            <>
              <div style={{ marginTop: 12 }}>
                <div><strong>From:</strong> {viewing.sender_company_name}</div>
                <div><strong>Date:</strong> <span className="mono">{viewing.txn_date}</span></div>
                {viewing.narration && <div><strong>Narration:</strong> {viewing.narration}</div>}
              </div>
              {viewing.lines && viewing.lines.length > 0 && (
                <table className="line-items-table mt-12">
                  <thead>
                    <tr>
                      <th>Item</th><th className="right">Qty</th><th>Account</th><th className="right">Rate</th><th className="right">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {viewing.lines.map((l) => (
                      <tr key={l.id}>
                        <td>{l.item_name}</td>
                        <td className="num">{Number(l.quantity).toFixed(2)}</td>
                        <td>
                          <select className="input" value={lineAccountSelections[l.id] || (l.account_id || "")} onChange={(e) => setLineAccountSelections((prev) => ({ ...prev, [l.id]: e.target.value }))}>
                            <option value="">(use default mapping)</option>
                            {accounts.filter((a) => a.type === "STANDARD").map((a) => (
                              <option key={a.id} value={a.id}>{a.name} — {a.group}</option>
                            ))}
                          </select>
                        </td>
                        <td className="num">{Number(l.rate).toFixed(2)}</td>
                        <td className="num">{Number(l.amount).toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              <div style={{ display: "flex", gap: 12, marginTop: 12 }}>
                <button className="btn btn-primary" onClick={async () => {
                  setViewBusy(true);
                  setViewError("");
                  try {
                    const assignments = Object.entries(lineAccountSelections).map(([line_id, account_id]) => ({ line_id, account_id: account_id || undefined }));
                    await api.takeTransaction(viewing.id, { line_account_assignments: assignments });
                    setViewing(null);
                    load();
                  } catch (err) {
                    setViewError(err.message);
                  } finally {
                    setViewBusy(false);
                  }
                }} disabled={viewBusy}>{viewBusy ? "Taking…" : "Take transaction"}</button>
                <button className="btn btn-ghost" onClick={() => setViewing(null)} disabled={viewBusy}>Cancel</button>
              </div>
            </>
          )}
        </Modal>
      )}
    </div>
  );
}
