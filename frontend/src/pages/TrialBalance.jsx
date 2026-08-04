import { useEffect, useState } from "react";
import { api } from "../api/client";

function fmt(n) {
  return Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function TrialBalance() {
  const [asOf, setAsOf] = useState(() => new Date().toISOString().slice(0, 10));
  const [report, setReport] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api.trialBalance(asOf).then(setReport).catch((e) => setError(e.message));
  }, [asOf]);

  const balanced = report && Math.abs(report.total_debit - report.total_credit) < 0.005;

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Trial Balance</div>
          <div className="page-subtitle">Net debit/credit across every account, derived live from posted journals.</div>
        </div>
        <div className="field" style={{ marginBottom: 0 }}>
          <input className="input" type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} />
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {report && (
        <div className="card">
          {report.rows.length === 0 ? (
            <div className="empty-state">No postings yet as of this date.</div>
          ) : (
            <table>
              <thead>
                <tr><th>Account</th><th>Group</th><th className="right">Debit</th><th className="right">Credit</th></tr>
              </thead>
              <tbody>
                {report.rows.map((r) => (
                  <tr key={r.account_id}>
                    <td>{r.account_name}</td>
                    <td className="text-muted">{r.group}</td>
                    <td className="num">{r.debit ? fmt(r.debit) : ""}</td>
                    <td className="num">{r.credit ? fmt(r.credit) : ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <div className="card-header" style={{ borderTop: "1px solid var(--line)" }}>
            <span style={{ fontWeight: 600 }}>
              {balanced ? "✓ Balanced" : "⚠ Out of balance — check postings"}
            </span>
            <span className="mono" style={{ fontWeight: 700 }}>
              Dr {fmt(report.total_debit)} &nbsp;·&nbsp; Cr {fmt(report.total_credit)}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
