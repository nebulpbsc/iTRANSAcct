import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client";

function emptyLine() {
  return {
    item_name: "",
    quantity: 1,
    rate: 0,
    sgst_percent: 0,
    cgst_percent: 0,
    sgst_amount: 0,
    cgst_amount: 0,
    account_id: "",
  };
}

// Inline account creation removed from New Transaction UI per request.
// Created view unchanged; sendNow will be updated in a separate patch.

export default function NewTransaction() {
  const [type, setType] = useState("SALE_PURCHASE");
  const [connections, setConnections] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [heads, setHeads] = useState([]);
  const [mappings, setMappings] = useState([]);
  const [recipientId, setRecipientId] = useState("");
  const [narration, setNarration] = useState("");
  const [txnDate, setTxnDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [lines, setLines] = useState([emptyLine()]);
  const [amount, setAmount] = useState("");
  const [cashAccountId, setCashAccountId] = useState("");
  const [salesAccountId, setSalesAccountId] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    api.connections().then(setConnections).catch(() => {});
    api.accounts().then(setAccounts).catch(() => {});
    api.accountHeads().then(setHeads).catch(() => {});
    api.accountMappings().then(setMappings).catch(() => {});
  }, []);

  const total = lines.reduce((sum, l) => {
    const amount = (Number(l.quantity) || 0) * (Number(l.rate) || 0);
    const sgst = amount * ((Number(l.sgst_percent) || 0) / 100);
    const cgst = amount * ((Number(l.cgst_percent) || 0) / 100);
    return sum + amount + sgst + cgst;
  }, 0);
  const cashAccounts = accounts.filter((a) => a.type === "STANDARD" && a.group === "ASSET");
  const salesAccounts = accounts.filter((a) => a.type === "STANDARD" && a.group === "INCOME");

  function accountLabel(a) {
    if (!a) return "";
    const map = mappings.find((m) => m.account_id === a.id);
    const head = map ? heads.find((h) => h.id === map.head_id) : null;
    return head ? `${a.name} — ${head.name}` : `${a.name} — ${a.group}`;
  }

  function updateLine(idx, field, value) {
    setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, [field]: value } : l)));
  }

  function addLine() {
    setLines((prev) => [...prev, emptyLine()]);
  }

  function removeLine(idx) {
    setLines((prev) => prev.filter((_, i) => i !== idx));
  }

  async function submit(e) {
    e.preventDefault();
    setError("");
    if (!recipientId) {
      setError("Choose who you're transacting with.");
      return;
    }
    setBusy(true);
    try {
      const payload = {
        type,
        recipient_company_id: recipientId,
        txn_date: txnDate,
        narration: narration || undefined,
      };
      if (type === "SALE_PURCHASE") {
        payload.lines = lines
          .filter((l) => l.item_name.trim())
          .map((l) => {
            const quantity = Number(l.quantity);
            const rate = Number(l.rate);
            const amount = Math.round(quantity * rate * 100) / 100;
            const sgst_percent = Number(l.sgst_percent) || 0;
            const cgst_percent = Number(l.cgst_percent) || 0;
            const sgst_amount = Math.round(amount * (sgst_percent / 100) * 100) / 100;
            const cgst_amount = Math.round(amount * (cgst_percent / 100) * 100) / 100;
            return { item_name: l.item_name, quantity, rate, account_id: l.account_id || undefined, sgst_percent, cgst_percent, sgst_amount, cgst_amount };
          });
        if (payload.lines.length === 0) {
          setError("Add at least one item line.");
          setBusy(false);
          return;
        }
      } else {
        if (!amount || Number(amount) <= 0) {
          setError("Enter a payment amount greater than zero.");
          setBusy(false);
          return;
        }
        payload.amount = Number(amount);
        payload.sender_cash_account_id = cashAccountId || undefined;
      }

      // keep selected sales account in the frontend state; sending can include it

      const txn = await api.createTransaction(payload);
      setCreated(txn);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function sendNow() {
    setBusy(true);
    setError("");
    try {
      const payload = {};
      if (cashAccountId) payload.sender_cash_account_id = cashAccountId;
      if (salesAccountId) payload.sender_sales_account_id = salesAccountId;
      await api.sendTransaction(created.id, Object.keys(payload).length ? payload : undefined);
      navigate("/outbox");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (created) {
    return (
      <div>
        <div className="page-header">
          <div className="page-title">Draft saved</div>
        </div>
        <div className="card card-pad">
          <p>
            Your {type === "SALE_PURCHASE" ? "sale invoice" : "payment"} to{" "}
            <strong>{connections.find((c) => c.id === recipientId)?.name}</strong> for{" "}
            <strong className="mono">{Number(created.total_amount).toFixed(2)}</strong> is saved as a{" "}
            <strong>DRAFT</strong>. Nothing has posted to any books yet.
          </p>
          <p className="text-muted">
            Click <strong>Send</strong> to transmit it — this auto-posts the voucher to your own books and
            drops it into the counterparty's Inbox. They'll acknowledge it with one click; no data entry on
            their side.
          </p>
          {error && <div className="alert alert-error">{error}</div>}
          <div className="flex-gap mt-16">
            <button className="btn btn-primary" onClick={sendNow} disabled={busy}>
              {busy ? "Sending…" : "Send transaction"}
            </button>
            <button className="btn btn-ghost" onClick={() => navigate("/outbox")}>
              I'll send it later
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">New Transaction</div>
          <div className="page-subtitle">Type it once. Your counterparty only has to acknowledge it.</div>
        </div>
      </div>

      {connections.length === 0 && (
        <div className="alert alert-info">
          You're not connected to any company yet. Go to <strong>Connections</strong> and add a counterparty's
          connect code first.
        </div>
      )}

      {error && <div className="alert alert-error">{error}</div>}

      <form onSubmit={submit}>
        <div className="type-toggle">
          <button
            type="button"
            className={type === "SALE_PURCHASE" ? "active" : ""}
            onClick={() => setType("SALE_PURCHASE")}
          >
            <div className="tt-title">Sale → their Purchase</div>
            <div className="tt-desc">Invoice goods/services. Posts as a Sale for you, a Purchase for them.</div>
          </button>
          <button
            type="button"
            className={type === "PAYMENT_RECEIPT" ? "active" : ""}
            onClick={() => setType("PAYMENT_RECEIPT")}
          >
            <div className="tt-title">Payment → their Receipt</div>
            <div className="tt-desc">Send funds. Posts as a Payment for you, a Receipt for them.</div>
          </button>
        </div>

        <div className="card card-pad">
          <div className="form-row">
            <div className="field">
              <label>Send to</label>
              <select className="input" value={recipientId} onChange={(e) => setRecipientId(e.target.value)} required>
                <option value="">Choose a connected company…</option>
                {connections.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Date</label>
              <input className="input" type="date" value={txnDate} onChange={(e) => setTxnDate(e.target.value)} />
            </div>
          </div>

          {type === "SALE_PURCHASE" ? (
            <>
            <div className="field">
              <label>Sales account (optional)</label>
              <select className="input" value={salesAccountId} onChange={(e) => setSalesAccountId(e.target.value)}>
                <option value="">Sales Account (default)</option>
                {salesAccounts.map((a) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
              <div style={{ fontSize: 12 }} className="text-muted">Choose which income account to post the sale to (optional).</div>
              {/* inline account creation removed */}
            </div>
            <div className="field">
              <label>Items</label>
              <table className="line-items-table">
                <thead>
            <tr>
              <th style={{ width: "36%", textAlign: 'left' }}>Item</th>
              <th style={{ width: "8%", textAlign: 'right' }}>Qty</th>
              <th style={{ width: "24%", textAlign: 'left' }}>Account</th>
              <th style={{ width: "8%", textAlign: 'right' }}>Rate</th>
              <th style={{ width: "6%", textAlign: 'right' }}>SGST%</th>
              <th style={{ width: "6%", textAlign: 'right' }}>CGST%</th>
              <th style={{ width: "6%", textAlign: 'right' }}>SGST</th>
              <th style={{ width: "6%", textAlign: 'right' }}>CGST</th>
              <th style={{ width: "6%", textAlign: 'right' }}>Amount</th>
              <th style={{ width: "2%" }}></th>
            </tr>
                </thead>
                <tbody>
                  {lines.map((l, idx) => (
                    <tr key={idx}>
                      <td>
                        <input
                          className="input"
                          value={l.item_name}
                          onChange={(e) => updateLine(idx, "item_name", e.target.value)}
                          placeholder="Item or service"
                        />
                      </td>
                      <td>
                        <input
                          className="input"
                          type="number"
                          min="0"
                          step="1"
                          value={l.quantity}
                          onChange={(e) => updateLine(idx, "quantity", e.target.value)}
                          style={{ width: 64, textAlign: 'right' }}
                        />
                      </td>
                      <td>
                        <select
                          className="input"
                          value={l.account_id || ""}
                          onChange={(e) => updateLine(idx, "account_id", e.target.value)}
                          style={{ minWidth: 220 }}
                        >
                          <option value="">(select head/account)</option>
                          {heads.map((h) => (
                            <optgroup key={h.id} label={h.name}>
                              {mappings
                                .filter((m) => m.head_id === h.id)
                                .map((m) => {
                                  const a = accounts.find((ac) => ac.id === m.account_id);
                                  if (!a) return null;
                                  return (
                                    <option key={a.id} value={a.id}>{a.name} — {a.group}</option>
                                  );
                                })}
                            </optgroup>
                          ))}
                        </select>
                      </td>
                      <td>
                        <input
                          className="input"
                          type="number"
                          min="0"
                          step="0.01"
                          value={l.rate}
                          onChange={(e) => updateLine(idx, "rate", e.target.value)}
                          style={{ width: 90, textAlign: 'right' }}
                        />
                      </td>
                        <td>
                          <input
                            className="input"
                            type="number"
                            min="0"
                            step="0.01"
                            value={l.sgst_percent}
                            onChange={(e) => updateLine(idx, "sgst_percent", e.target.value)}
                            style={{ width: 64, textAlign: 'right' }}
                          />
                        </td>
                        <td>
                          <input
                            className="input"
                            type="number"
                            min="0"
                            step="0.01"
                            value={l.cgst_percent}
                            onChange={(e) => updateLine(idx, "cgst_percent", e.target.value)}
                            style={{ width: 64, textAlign: 'right' }}
                          />
                        </td>
                        <td className="num" style={{ textAlign: 'right', paddingRight: 8 }}>
                          {(
                            ((Number(l.quantity) || 0) * (Number(l.rate) || 0)) *
                            ((Number(l.sgst_percent) || 0) / 100)
                          ).toFixed(2)}
                        </td>
                        <td className="num" style={{ textAlign: 'right', paddingRight: 8 }}>
                          {(
                            ((Number(l.quantity) || 0) * (Number(l.rate) || 0)) *
                            ((Number(l.cgst_percent) || 0) / 100)
                          ).toFixed(2)}
                        </td>
                        <td className="num" style={{ textAlign: 'right', paddingRight: 8 }}>{((Number(l.quantity) || 0) * (Number(l.rate) || 0)).toFixed(2)}</td>
                      <td>
                        {lines.length > 1 && (
                          <button type="button" className="remove-line" onClick={() => removeLine(idx)}>×</button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <button type="button" className="btn btn-ghost btn-sm mt-8" onClick={addLine}>+ Add line</button>
              <div className="right mono mt-16" style={{ fontSize: 16, fontWeight: 600 }}>
                Total: {total.toFixed(2)}
              </div>
            </div>
            </>
          ) : (
            <div className="form-row">
              <div className="field">
                <label>Amount</label>
                <input
                  className="input"
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  required
                />
              </div>
              <div className="field">
                <label>Pay from</label>
                <select className="input" value={cashAccountId} onChange={(e) => setCashAccountId(e.target.value)}>
                  <option value="">Cash Account (default)</option>
                  {cashAccounts.map((a) => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </select>
                {/* inline account creation removed */}
              </div>
            </div>
          )}

          <div className="field">
            <label>Narration (optional)</label>
            <textarea
              className="input"
              rows={2}
              value={narration}
              onChange={(e) => setNarration(e.target.value)}
              placeholder="Reference note visible to both parties"
            />
          </div>

          <button className="btn btn-primary" disabled={busy}>
            {busy ? "Saving…" : "Save as draft"}
          </button>
        </div>
      </form>
    </div>
  );
}
