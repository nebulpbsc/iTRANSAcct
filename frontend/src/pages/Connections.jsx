import { useEffect, useState } from "react";
import { api } from "../api/client";
import { useAuth } from "../context/AuthContext";

export default function Connections() {
  const { company } = useAuth();
  const [connections, setConnections] = useState([]);
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [busy, setBusy] = useState(false);

  function load() {
    api.connections().then(setConnections).catch((e) => setError(e.message));
  }

  useEffect(load, []);

  async function submit(e) {
    e.preventDefault();
    setError("");
    setSuccess("");
    setBusy(true);
    try {
      const other = await api.connect(code.trim());
      setSuccess(`Connected to ${other.name}. You can now send them transactions.`);
      setCode("");
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Connections</div>
          <div className="page-subtitle">
            Two companies must connect once before they can transact — this prevents unsolicited postings to your books.
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-pad">
          <div className="alert alert-info" style={{ marginBottom: 20 }}>
            Share your connect code with a counterparty so they can link to you:{" "}
            <strong className="mono">{company?.connect_code}</strong>
          </div>

          {error && <div className="alert alert-error">{error}</div>}
          {success && <div className="alert alert-success">{success}</div>}

          <form onSubmit={submit} className="flex-gap" style={{ alignItems: "flex-end" }}>
            <div className="field" style={{ marginBottom: 0, flex: 1 }}>
              <label>Counterparty's connect code</label>
              <input className="input" value={code} onChange={(e) => setCode(e.target.value)} required />
            </div>
            <button className="btn btn-primary" disabled={busy}>{busy ? "Connecting…" : "Connect"}</button>
          </form>
        </div>
      </div>

      <div className="card">
        <div className="card-header"><h3>Connected companies</h3></div>
        {connections.length === 0 ? (
          <div className="empty-state">No connections yet. Add one above to start transacting.</div>
        ) : (
          <table>
            <thead><tr><th>Company</th><th>Connect code</th></tr></thead>
            <tbody>
              {connections.map((c) => (
                <tr key={c.id}>
                  <td>{c.name}</td>
                  <td className="mono">{c.connect_code}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
