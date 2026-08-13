import { useEffect, useState } from "react";
import { api } from "../api/client";

function AccountHeadRow({ head, accounts, mapping, onSave, onUnmap }) {
  const [accountId, setAccountId] = useState(mapping ? mapping.account_id : "");
  const [saving, setSaving] = useState(false);

  useEffect(() => setAccountId(mapping ? mapping.account_id : ""), [mapping]);

  async function save() {
    setSaving(true);
    try {
      await onSave(head.id, accountId || null);
    } catch (e) {
      alert(e.message);
    } finally {
      setSaving(false);
    }
  }

  async function unmap() {
    if (!mapping) return;
    if (!confirm(`Unmap "${head.name}" from ${mapping.account_id}? This will remove the default mapping.`)) return;
    try {
      await onUnmap(mapping.id);
    } catch (e) {
      alert(e.message);
    }
  }

  return (
    <tr>
      <td>{head.name}</td>
      <td>{head.description || "—"}</td>
      <td>
        <select value={accountId || ""} onChange={(e) => setAccountId(e.target.value)}>
          <option value="">(not mapped)</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>{a.name} — {a.group}</option>
          ))}
        </select>
      </td>
      <td>
        <button className="btn btn-ghost btn-sm" onClick={save} disabled={saving}>
          {saving ? "Saving…" : "Save"}
        </button>
        {mapping && (
          <button className="btn btn-ghost btn-sm" style={{ marginLeft: 8 }} onClick={unmap}>
            Unmap
          </button>
        )}
      </td>
    </tr>
  );
}

export default function AccountHeads() {
  const [heads, setHeads] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [mappings, setMappings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    setLoading(true);
    Promise.all([api.accountHeads(), api.accounts(), api.accountMappings()])
      .then(([h, a, m]) => {
        setHeads(h);
        setAccounts(a);
        setMappings(m);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  async function handleSave(head_id, account_id) {
    // account_id may be null or empty string -> backend requires account_id string; skip if null
    if (!account_id) {
      // cannot unset mapping via API; show message
      throw new Error("To change mapping, select an account. Unsetting is not supported.");
    }
    const payload = { head_id, account_id };
    const res = await api.setAccountMapping(payload);
    // refresh mappings
    const updated = await api.accountMappings();
    setMappings(updated);
  }

  async function handleUnmap(mapping_id) {
    await api.deleteAccountMapping(mapping_id);
    const updated = await api.accountMappings();
    setMappings(updated);
  }

  function findMapping(headId) {
    return mappings.find((m) => m.head_id === headId) || null;
  }

  if (loading) return <div>Loading…</div>;
  if (error) return <div className="alert alert-error">{error}</div>;

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Account Heads & Default Mapping</div>
          <div className="page-subtitle">Map standard account heads to accounts in your chart of accounts.</div>
        </div>
      </div>

      <div className="card">
        <table>
          <thead>
            <tr><th>Head</th><th>Description</th><th>Mapped Account</th><th></th></tr>
          </thead>
          <tbody>
            {heads.map((h) => (
              <AccountHeadRow key={h.id} head={h} accounts={accounts} mapping={findMapping(h.id)} onSave={handleSave} onUnmap={handleUnmap} />
            ))}
          </tbody>
        </table>

        <div style={{ marginTop: 16 }}>
          <h4>Create a new account</h4>
          <QuickCreate accounts={accounts} setAccounts={setAccounts} setError={setError} />
        </div>
      </div>
    </div>
  );
}

function QuickCreate({ accounts, setAccounts, setError }) {
  const [name, setName] = useState("");
  const [group, setGroup] = useState("ASSET");
  const [saving, setSaving] = useState(false);

  async function create() {
    setError("");
    setSaving(true);
    try {
      const acct = await api.createAccount({ name, group });
      // refresh accounts list
      const updated = await api.accounts();
      setAccounts(updated);
      setName("");
      setGroup("ASSET");
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
      <input placeholder="Account name" value={name} onChange={(e) => setName(e.target.value)} />
      <select value={group} onChange={(e) => setGroup(e.target.value)}>
        <option value="ASSET">ASSET</option>
        <option value="LIABILITY">LIABILITY</option>
        <option value="INCOME">INCOME</option>
        <option value="EXPENSE">EXPENSE</option>
        <option value="EQUITY">EQUITY</option>
      </select>
      <button className="btn btn-primary" onClick={create} disabled={saving || !name}>
        {saving ? "Creating…" : "Create Account"}
      </button>
    </div>
  );
}
