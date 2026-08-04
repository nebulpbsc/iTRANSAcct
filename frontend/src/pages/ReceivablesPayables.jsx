import { useEffect, useState } from "react";
import { api } from "../api/client";

function fmt(n) {
  return Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function ReceivablesPayables() {
  const [report, setReport] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api.receivablesPayables().then(setReport).catch((e) => setError(e.message));
  }, []);

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Receivables &amp; Payables</div>
          <div className="page-subtitle">Outstanding party balances, netted live from every posted voucher.</div>
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {report && (
        <>
          <div className="stat-grid">
            <div className="stat-card">
              <div className="stat-label">Total Receivable</div>
              <div className="stat-value positive">{fmt(report.total_receivable)}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Total Payable</div>
              <div className="stat-value negative">{fmt(report.total_payable)}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Net position</div>
              <div className={`stat-value ${report.total_receivable - report.total_payable >= 0 ? "positive" : "negative"}`}>
                {fmt(report.total_receivable - report.total_payable)}
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-header"><h3>Receivables (they owe us)</h3></div>
            {report.receivables.length === 0 ? (
              <div className="empty-state">Nothing outstanding.</div>
            ) : (
              <table>
                <thead><tr><th>Company</th><th className="right">Balance</th></tr></thead>
                <tbody>
                  {report.receivables.map((r) => (
                    <tr key={r.company_id}>
                      <td>{r.company_name}</td>
                      <td className="num">{fmt(r.balance)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="card">
            <div className="card-header"><h3>Payables (we owe them)</h3></div>
            {report.payables.length === 0 ? (
              <div className="empty-state">Nothing outstanding.</div>
            ) : (
              <table>
                <thead><tr><th>Company</th><th className="right">Balance</th></tr></thead>
                <tbody>
                  {report.payables.map((r) => (
                    <tr key={r.company_id}>
                      <td>{r.company_name}</td>
                      <td className="num">{fmt(-r.balance)}</td>
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
