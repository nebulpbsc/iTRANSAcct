import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client";

function emptyLine() {
  return { item_name: "", quantity: 1, rate: 0, gst_percent: 0, gst_amount: 0 };
}

function InlineCreateAccount({ defaultGroup = "ASSET", onCreated }) {
  const [name, setName] = useState("");
  const [group, setGroup] = useState(defaultGroup);
  const [saving, setSaving] = useState(false);

  async function create() {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const acct = await api.createAccount({ name: name.trim(), group });
      onCreated && onCreated(acct);
      setName("");
      setGroup(defaultGroup);
    } catch (e) {
      // silent per small inline ux; could surface via parent
      alert(e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
      <input placeholder="New account name" value={name} onChange={(e) => setName(e.target.value)} />
      <select value={group} onChange={(e) => setGroup(e.target.value)}>
        <option value="ASSET">ASSET</option>
        <option value="LIABILITY">LIABILITY</option>
        <option value="INCOME">INCOME</option>
        <option value="EXPENSE">EXPENSE</option>
        <option value="EQUITY">EQUITY</option>
      </select>
      <button className="btn btn-ghost btn-sm" onClick={create} disabled={saving || !name.trim()}>
        {saving ? "Creating…" : "Create"}
      </button>
    </div>
  );
}
// Created view unchanged; sendNow will be updated in a separate patch.

export default function NewTransaction() {
  const [type, setType] = useState("SALE_PURCHASE");
  const [connections, setConnections] = useState([]);
  const [accounts, setAccounts] = useState([]);
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
  }, []);

  const total = lines.reduce((sum, l) => {
    const amount = (Number(l.quantity) || 0) * (Number(l.rate) || 0);
    const gst = amount * ((Number(l.gst_percent) || 0) / 100);
    return sum + amount + gst;
  }, 0);
  const cashAccounts = accounts.filter((a) => a.type === "STANDARD" && a.group === "ASSET");
  const salesAccounts = accounts.filter((a) => a.type === "STANDARD" && a.group === "INCOME");

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
            const gst_percent = Number(l.gst_percent) || 0;
            const gst_amount = Math.round(amount * (gst_percent / 100) * 100) / 100;
            return { item_name: l.item_name, quantity, rate, gst_percent, gst_amount };
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
              <div style={{ marginTop: 8 }}>
                <InlineCreateAccount defaultGroup="INCOME" onCreated={(acct) => { setAccounts((prev) => [acct, ...prev]); setSalesAccountId(acct.id); }} />
              </div>
            </div>
            <div className="field">
              <label>Items</label>
              <table className="line-items-table">
                <thead>
                  <tr>
                    <th style={{ width: "50%" }}>Item</th>
                    <th className="right">Qty</th>
                    <th className="right">Rate</th>
                    <th className="right">GST%</th>
                    <th className="right">Tax</th>
                    <th className="right">Amount</th>
                    <th></th>
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
                          step="0.01"
                          value={l.quantity}
                          onChange={(e) => updateLine(idx, "quantity", e.target.value)}
                        />
                      </td>
                      <td>
                        <input
                          className="input"
                          type="number"
                          min="0"
                          step="0.01"
                          value={l.rate}
                          onChange={(e) => updateLine(idx, "rate", e.target.value)}
                        />
                      </td>
                      <td>
                        <input
                          className="input"
                          type="number"
                          min="0"
                          step="0.01"
                          value={l.gst_percent}
                          onChange={(e) => updateLine(idx, "gst_percent", e.target.value)}
                        />
                      </td>
                      <td className="num">
                        {(
                          ((Number(l.quantity) || 0) * (Number(l.rate) || 0)) *
                          ((Number(l.gst_percent) || 0) / 100)
                        ).toFixed(2)}
                      </td>
                      <td className="num">{((Number(l.quantity) || 0) * (Number(l.rate) || 0)).toFixed(2)}</td>
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
                <div style={{ marginTop: 8 }}>
                  <InlineCreateAccount defaultGroup="ASSET" onCreated={(acct) => { setAccounts((prev) => [acct, ...prev]); setCashAccountId(acct.id); }} />
                </div>
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
