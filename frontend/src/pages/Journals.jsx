import { useEffect, useState } from "react";
import { api } from "../api/client";

function fmt(n) { return Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

export default function Journals() {
  const [entries, setEntries] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [lines, setLines] = useState([{ account_id: "", debit: 0.0, credit: 0.0 }]);
  const [voucherType, setVoucherType] = useState("JOURNAL");
  const [narration, setNarration] = useState("");
  const [error, setError] = useState("");

  useEffect(() => { load(); api.accounts().then(setAccounts).catch(()=>{}); }, []);
  function load(){ api.journals().then(setEntries).catch((e)=>setError(e.message)); }

  function updateLine(i, field, value){ setLines(prev => prev.map((l,idx) => idx===i ? { ...l, [field]: value } : l)); }
  function addLine(){ setLines(prev => [...prev, { account_id:"", debit:0.0, credit:0.0 }]); }
  function removeLine(i){ setLines(prev => prev.filter((_,idx)=>idx!==i)); }

  async function submit(e){ e.preventDefault(); setError(""); try{
    const payload = { voucher_type: voucherType, narration, lines: lines.map(l=>({ account_id: l.account_id, debit: Number(l.debit)||0, credit: Number(l.credit)||0 })) };
    await api.createJournal(payload);
    setLines([{ account_id:"", debit:0.0, credit:0.0 }]); setNarration(""); load();
  }catch(err){ setError(err.message); }}

  return (
    <div>
      <div className="page-header"><div><div className="page-title">Journals</div><div className="page-subtitle">Create manual journal entries</div></div></div>
      <div className="card">
        {error && <div className="alert alert-error">{error}</div>}
        <form onSubmit={submit}>
          <div style={{ display:'flex', gap:8, marginBottom:8 }}>
            <select value={voucherType} onChange={(e)=>setVoucherType(e.target.value)}>
              <option value="JOURNAL">Journal</option>
              <option value="ADJUSTMENT">Adjustment</option>
            </select>
            <input className="input" placeholder="Narration" value={narration} onChange={(e)=>setNarration(e.target.value)} style={{ flex:1 }} />
          </div>
          <table className="line-items-table">
            <thead><tr><th>Account</th><th className="right">Debit</th><th className="right">Credit</th><th></th></tr></thead>
            <tbody>
              {lines.map((l,idx)=> (
                <tr key={idx}>
                  <td>
                    <select className="input" value={l.account_id} onChange={(e)=>updateLine(idx,'account_id', e.target.value)}>
                      <option value="">Select account</option>
                      {accounts.map(a=> <option key={a.id} value={a.id}>{a.name} — {a.group}</option>)}
                    </select>
                  </td>
                  <td className="num"><input className="input" value={l.debit} onChange={(e)=>updateLine(idx,'debit', e.target.value)} style={{ width:120, textAlign:'right' }} /></td>
                  <td className="num"><input className="input" value={l.credit} onChange={(e)=>updateLine(idx,'credit', e.target.value)} style={{ width:120, textAlign:'right' }} /></td>
                  <td>{lines.length>1 && <button type="button" className="btn btn-ghost" onClick={()=>removeLine(idx)}>Remove</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ marginTop:8 }}>
            <button type="button" className="btn btn-ghost" onClick={addLine}>+ Add line</button>
            <button type="submit" className="btn btn-primary" style={{ marginLeft:8 }}>Save Journal</button>
          </div>
        </form>
      </div>

      <div className="card mt-12">
        <h4>Recent journals</h4>
        <table>
          <thead><tr><th>Date</th><th>Type</th><th>Narration</th><th className="right">Lines</th></tr></thead>
          <tbody>
            {entries.map(e=> (
              <tr key={e.id}><td className="mono">{e.entry_date}</td><td>{e.voucher_type}</td><td>{e.narration}</td><td className="num">{e.lines.length}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
