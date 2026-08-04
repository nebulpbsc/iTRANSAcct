import { useEffect, useState } from "react";
import { api } from "../api/client";

function fmt(n) {
  return Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function Ledger() {
  const [accounts, setAccounts] = useState([]);
  const [accountId, setAccountId] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [report, setReport] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api.accounts().then((accts) => {
      setAccounts(accts);
      if (accts.length && !accountId) setAccountId(accts[0].id);
    }).catch((e) => setError(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!accountId) return;
    const params = {};
    if (fromDate) params.from_date = fromDate;
    if (toDate) params.to_date = toDate;
    api.ledger(accountId, params).then(setReport).catch((e) => setError(e.message));
  }, [accountId, fromDate, toDate]);

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Ledger</div>
          <div className="page-subtitle">Live-computed from auto-posted journal entries — never edited by hand.</div>
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      <div className="card card-pad">
        <div className="form-row">
          <div className="field">
            <label>Account</label>
            <select className="input" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>From</label>
            <input className="input" type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
          </div>
          <div className="field">
            <label>To</label>
            <input className="input" type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
          </div>
        </div>
      </div>

      {report && (
        <div className="card">
          <div className="card-header">
            <h3>{report.account_name}</h3>
            <span className="mono text-muted">Opening: {fmt(report.opening_balance)}</span>
          </div>
          {report.lines.length === 0 ? (
            <div className="empty-state">No entries in this period.</div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Date</th><th>Voucher</th><th>Narration</th>
                  <th className="right">Debit</th><th className="right">Credit</th><th className="right">Balance</th>
                </tr>
              </thead>
              <tbody>
                {report.lines.map((l, i) => (
                  <tr key={i}>
                    <td className="mono">{l.date}</td>
                    <td className="mono">{l.voucher_type} {l.voucher_no}</td>
                    <td className="text-muted">{l.narration}</td>
                    <td className="num">{l.debit ? fmt(l.debit) : ""}</td>
                    <td className="num">{l.credit ? fmt(l.credit) : ""}</td>
                    <td className="num" style={{ fontWeight: 600 }}>{fmt(l.balance)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <div className="card-header" style={{ borderTop: "1px solid var(--line)", borderBottom: "none" }}>
            <span></span>
            <span className="mono" style={{ fontWeight: 700 }}>Closing: {fmt(report.closing_balance)}</span>
          </div>
        </div>
      )}
    </div>
  );
}
