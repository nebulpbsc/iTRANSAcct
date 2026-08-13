import { useEffect, useState } from "react";
import { api } from "../api/client";
import StateStamp from "../components/StateStamp";
import Modal from "../components/Modal";

function fmt(n) {
  return Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const FILTERS = ["ALL", "DRAFT", "SENT", "TAKEN", "REJECTED"];

export default function Outbox() {
  const [filter, setFilter] = useState("ALL");
  const [txns, setTxns] = useState([]);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState(null);
  const [viewing, setViewing] = useState(null);
  const [viewError, setViewError] = useState("");
  const [viewBusy, setViewBusy] = useState(false);
  const [accounts, setAccounts] = useState([]);
  const [selectedSenderCash, setSelectedSenderCash] = useState("");
  const [selectedSenderSales, setSelectedSenderSales] = useState("");

  function load() {
    api.outbox(filter === "ALL" ? undefined : filter).then(setTxns).catch((e) => setError(e.message));
  }

  async function viewTxn(id) {
    setViewError("");
    setViewBusy(true);
    try {
      const t = await api.getTransaction(id);
      setViewing(t);
      // set default selection for sender cash account if available
      setSelectedSenderCash(t.sender_cash_account_id || "");
    } catch (err) {
      setViewError(err.message);
    } finally {
      setViewBusy(false);
    }
  }

  useEffect(load, [filter]);
  useEffect(() => { api.accounts().then(setAccounts).catch(() => {}); }, []);

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
                    <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                      <button className="btn btn-ghost btn-sm" onClick={() => viewTxn(t.id)}>
                        View
                      </button>
                      {t.state === "DRAFT" && (
                        <button className="btn btn-primary btn-sm" onClick={() => viewTxn(t.id)} disabled={busyId === t.id}>
                          {busyId === t.id ? "Sending…" : "Send"}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {viewing && (
        <Modal onClose={() => setViewing(null)}>
          <button className="btn btn-ghost" onClick={() => setViewing(null)} disabled={viewBusy} style={{ position: "absolute", right: 12, top: 12 }}>Close</button>
          <div style={{ marginBottom: 8 }}>
            <div style={{ fontSize: 18, fontWeight: 700 }}>Transaction details</div>
            <div className="text-muted">{viewing.type === "SALE_PURCHASE" ? "Sale" : "Payment"} — {viewing.state}</div>
          </div>
          {viewError && <div className="alert alert-error">{viewError}</div>}
          <div style={{ marginTop: 12 }}>
            <div><strong>To:</strong> {viewing.recipient_company_name}</div>
            <div><strong>Date:</strong> <span className="mono">{viewing.txn_date}</span></div>
            {viewing.narration && <div><strong>Narration:</strong> {viewing.narration}</div>}
          </div>
          {viewing.lines && viewing.lines.length > 0 && (
            <table className="line-items-table mt-12">
              <thead>
                <tr>
                  <th>Item</th><th className="right">Qty</th><th className="right">Rate</th><th className="right">GST%</th><th className="right">Tax</th><th className="right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {viewing.lines.map((l) => (
                  <tr key={l.id}>
                    <td>{l.item_name}</td>
                    <td className="num">{Number(l.quantity).toFixed(2)}</td>
                    <td className="num">{Number(l.rate).toFixed(2)}</td>
                    <td className="num">{(Number(l.gst_percent) || 0).toFixed(2)}</td>
                    <td className="num">{(Number(l.gst_amount) || 0).toFixed(2)}</td>
                    <td className="num">{(Number(l.amount) || 0).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <div style={{ display: "flex", gap: 12, alignItems: "center", marginTop: 12 }}>
            {viewing.type === "PAYMENT_RECEIPT" && (
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12 }} className="text-muted">Send from account</div>
                <select className="input" value={selectedSenderCash} onChange={(e) => setSelectedSenderCash(e.target.value)}>
                  <option value="">Cash Account (default)</option>
                  {accounts.filter((a) => a.type === "STANDARD" && a.group === "ASSET").map((a) => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </select>
              </div>
            )}
            {viewing.type === "SALE_PURCHASE" && (
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12 }} className="text-muted">Post to Sales account</div>
                <select className="input" value={selectedSenderSales} onChange={(e) => setSelectedSenderSales(e.target.value)}>
                  <option value="">Sales Account (default)</option>
                  {accounts.filter((a) => a.type === "STANDARD" && a.group === "INCOME").map((a) => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </select>
              </div>
            )}
            <div style={{ marginLeft: "auto", textAlign: "right" }}>
              <div className="right mono" style={{ fontSize: 16, fontWeight: 600 }}>Total: {fmt(viewing.total_amount)}</div>
              {viewing.state === "DRAFT" && (
                <div style={{ marginTop: 8 }}>
                  <button
                    className="btn btn-primary"
                      onClick={async () => {
                        setViewBusy(true);
                        try {
                          const payload = {};
                          if (selectedSenderCash) payload.sender_cash_account_id = selectedSenderCash;
                          if (selectedSenderSales) payload.sender_sales_account_id = selectedSenderSales;
                          await api.sendTransaction(viewing.id, Object.keys(payload).length ? payload : undefined);
                          setViewing(null);
                          load();
                        } catch (err) {
                          setViewError(err.message);
                        } finally {
                          setViewBusy(false);
                        }
                      }}
                    disabled={viewBusy}
                  >
                    {viewBusy ? "Sending…" : "Send transaction"}
                  </button>
                </div>
              )}
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
