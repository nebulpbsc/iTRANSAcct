import { useEffect, useState } from "react";
import { api } from "../api/client";

function HeadRow({ head, accounts, mapping, onSaveMap, onUnmap, onEdit, onDelete }) {
  const [accountId, setAccountId] = useState(mapping ? mapping.account_id : "");
  const [saving, setSaving] = useState(false);

  useEffect(() => setAccountId(mapping ? mapping.account_id : ""), [mapping]);

  async function save() {
    setSaving(true);
    try {
      await onSaveMap(head.id, accountId || null);
    } catch (e) {
      alert(e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <tr>
      <td>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ fontWeight: 700 }}>{head.name}</div>
          <div style={{ color: "#666" }}>{head.description}</div>
        </div>
      </td>
      <td>
        <select value={accountId || ""} onChange={(e) => setAccountId(e.target.value)}>
          <option value="">(not mapped)</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>{a.name} — {a.group}</option>
          ))}
        </select>
      </td>
      <td className="right">
        <button className="btn btn-ghost btn-sm" onClick={save} disabled={saving}>{saving ? "Saving…" : "Save"}</button>
        <button className="btn btn-ghost btn-sm" style={{ marginLeft: 8 }} onClick={() => onEdit(head)}>Edit</button>
        <button className="btn btn-ghost btn-sm" style={{ marginLeft: 8 }} onClick={() => onDelete(head)}>Delete</button>
      </td>
    </tr>
  );
}

function AccountRow({ acct, onEdit, onDelete }) {
  return (
    <tr>
      <td>{acct.name}</td>
      <td>{acct.group}</td>
      <td className="right">
        <button className="btn btn-ghost btn-sm" onClick={() => onEdit(acct)}>Edit</button>
        <button className="btn btn-ghost btn-sm" style={{ marginLeft: 8 }} onClick={() => onDelete(acct)} disabled={acct.is_system} title={acct.is_system ? "System accounts cannot be deleted" : undefined}>Delete</button>
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

  const [editingHead, setEditingHead] = useState(null);
  const [creatingHead, setCreatingHead] = useState(false);
  const [editingAccount, setEditingAccount] = useState(null);

  async function loadAll() {
    setLoading(true);
    try {
      const [h, a, m] = await Promise.all([api.accountHeads(), api.accounts(), api.accountMappings()]);
      setHeads(h);
      setAccounts(a);
      setMappings(m);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadAll(); }, []);

  function findMapping(headId) {
    return mappings.find((mm) => mm.head_id === headId) || null;
  }

  async function handleSaveMap(head_id, account_id) {
    if (!account_id) {
      throw new Error("To change mapping, select an account. Unsetting is not supported.");
    }
    await api.setAccountMapping({ head_id, account_id });
    const updated = await api.accountMappings();
    setMappings(updated);
  }

  async function handleDeleteMapping(mapping_id) {
    try {
      await api.deleteAccountMapping(mapping_id);
      const updated = await api.accountMappings();
      setMappings(updated);
    } catch (e) {
      setError(e.message);
    }
  }

  // Heads CRUD
  async function createHead(payload) {
    const h = await api.createHead(payload);
    setHeads((prev) => [h, ...prev]);
  }

  async function updateHead(id, payload) {
    const h = await api.updateHead(id, payload);
    setHeads((prev) => prev.map((x) => x.id === h.id ? h : x));
  }

  async function deleteHead(head) {
    if (!confirm(`Delete account head "${head.name}"? This cannot be undone.`)) return;
    try {
      await api.deleteHead(head.id);
      setHeads((prev) => prev.filter((h) => h.id !== head.id));
    } catch (e) {
      setError(e.message);
    }
  }

  // Accounts CRUD
  async function createAccount(payload) {
    await api.createAccount(payload);
    const updated = await api.accounts();
    setAccounts(updated);
  }

  async function updateAccount(id, payload) {
    await api.updateAccount(id, payload);
    const updated = await api.accounts();
    setAccounts(updated);
  }

  async function deleteAccountRow(acct) {
    if (!confirm(`Delete account "${acct.name}"? This cannot be undone.`)) return;
    try {
      await api.deleteAccount(acct.id);
      setAccounts((prev) => prev.filter((a) => a.id !== acct.id));
    } catch (e) {
      setError(e.message);
    }
  }

  if (loading) return <div>Loading…</div>;
  if (error) return <div className="alert alert-error">{error}</div>;

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Account Heads & Accounts</div>
          <div className="page-subtitle">Manage account heads and your chart of accounts.</div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 420px', gap: 16 }}>
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h4>Account Heads</h4>
            <div>
              <button className="btn btn-primary" onClick={() => setCreatingHead(true)}>+ New Head</button>
            </div>
          </div>

          <table style={{ width: '100%', marginTop: 12 }}>
            <thead>
              <tr><th>Head</th><th>Mapped Account</th><th></th></tr>
            </thead>
            <tbody>
              {heads.map((h) => (
                <HeadRow key={h.id} head={h} accounts={accounts} mapping={findMapping(h.id)} onSaveMap={handleSaveMap} onUnmap={handleDeleteMapping} onEdit={(hh) => setEditingHead(hh)} onDelete={deleteHead} />
              ))}
            </tbody>
          </table>

          {creatingHead && (
            <div style={{ marginTop: 12 }}>
              <HeadEditor onCancel={() => setCreatingHead(false)} onSave={async (p) => { await createHead(p); setCreatingHead(false); }} />
            </div>
          )}

          {editingHead && (
            <div style={{ marginTop: 12 }}>
              <HeadEditor head={editingHead} onCancel={() => setEditingHead(null)} onSave={async (p) => { await updateHead(editingHead.id, p); setEditingHead(null); }} />
            </div>
          )}
        </div>

        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h4>Your Accounts</h4>
            <div>
              <AccountQuickCreate onCreate={createAccount} />
            </div>
          </div>

          <table style={{ width: '100%', marginTop: 12 }}>
            <thead>
              <tr><th>Name</th><th>Group</th><th></th></tr>
            </thead>
            <tbody>
              {accounts.map((a) => (
                <AccountRow key={a.id} acct={a} onEdit={(ac) => setEditingAccount(ac)} onDelete={deleteAccountRow} />
              ))}
            </tbody>
          </table>

          {editingAccount && (
            <div style={{ marginTop: 12 }}>
              <AccountEditor account={editingAccount} onCancel={() => setEditingAccount(null)} onSave={async (p) => { await updateAccount(editingAccount.id, p); setEditingAccount(null); }} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function HeadEditor({ head = null, onCancel, onSave }) {
  const [name, setName] = useState(head ? head.name : "");
  const [desc, setDesc] = useState(head ? head.description : "");
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      await onSave({ name, description: desc });
    } catch (e) {
      alert(e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
      <input placeholder="Head name" value={name} onChange={(e) => setName(e.target.value)} />
      <input placeholder="Description (optional)" value={desc} onChange={(e) => setDesc(e.target.value)} />
      <button className="btn btn-primary" onClick={save} disabled={saving || !name}>{saving ? 'Saving…' : 'Save'}</button>
      <button className="btn btn-ghost" onClick={onCancel}>Cancel</button>
    </div>
  );
}

function AccountQuickCreate({ onCreate }) {
  const [name, setName] = useState("");
  const [group, setGroup] = useState("ASSET");
  const [saving, setSaving] = useState(false);

  async function create() {
    setSaving(true);
    try {
      await onCreate({ name, group });
      setName("");
      setGroup("ASSET");
    } catch (e) {
      alert(e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
      <input placeholder="New account name" value={name} onChange={(e) => setName(e.target.value)} />
      <select value={group} onChange={(e) => setGroup(e.target.value)}>
        <option value="ASSET">ASSET</option>
        <option value="LIABILITY">LIABILITY</option>
        <option value="INCOME">INCOME</option>
        <option value="EXPENSE">EXPENSE</option>
        <option value="EQUITY">EQUITY</option>
      </select>
      <button className="btn btn-primary" onClick={create} disabled={saving || !name}>{saving ? 'Creating…' : '+ Add'}</button>
    </div>
  );
}

function AccountEditor({ account, onCancel, onSave }) {
  const [name, setName] = useState(account.name);
  const [group, setGroup] = useState(account.group);
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      await onSave({ name, group });
    } catch (e) {
      alert(e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
      <input value={name} onChange={(e) => setName(e.target.value)} />
      <select value={group} onChange={(e) => setGroup(e.target.value)}>
        <option value="ASSET">ASSET</option>
        <option value="LIABILITY">LIABILITY</option>
        <option value="INCOME">INCOME</option>
        <option value="EXPENSE">EXPENSE</option>
        <option value="EQUITY">EQUITY</option>
      </select>
      <button className="btn btn-primary" onClick={save} disabled={saving || !name}>{saving ? 'Saving…' : 'Save'}</button>
      <button className="btn btn-ghost" onClick={onCancel}>Cancel</button>
    </div>
  );
}
