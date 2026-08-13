import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function Login() {
  const [tab, setTab] = useState("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [gstin, setGstin] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const { login, register } = useAuth();
  const navigate = useNavigate();

  async function submit(e) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      if (tab === "login") {
        await login(email, password);
      } else {
        await register(name, email, password, gstin);
      }
      navigate("/");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-shell">
      <div className="auth-card">
        <div className="auth-brand">
          <div className="brand-mark">iT</div>
          <div>
            <div className="brand-name" style={{ color: "var(--text)" }}>
              iTRANSAcct
            </div>
            <div className="text-muted" style={{ fontSize: 12 }}>
              Single data entry. Dual bookkeeping.
            </div>
          </div>
        </div>

        <div className="auth-tabs">
          <button className={tab === "login" ? "active" : ""} onClick={() => setTab("login")} type="button">
            Sign in
          </button>
          <button className={tab === "register" ? "active" : ""} onClick={() => setTab("register")} type="button">
            Register company
          </button>
        </div>

        {error && <div className="alert alert-error">{error}</div>}

        <form onSubmit={submit}>
          {tab === "register" && (
            <div className="field">
              <label>Company name</label>
              <input className="input" value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
          )}
          <div className="field">
            <label>Work email</label>
            <input
              className="input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div className="field">
            <label>Password</label>
            <input
              className="input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={6}
              required
            />
          </div>
          {tab === "register" && (
            <div className="field">
              <label>GSTIN / Tax ID (optional)</label>
              <input className="input" value={gstin} onChange={(e) => setGstin(e.target.value)} />
            </div>
          )}

          <button className="btn btn-primary" style={{ width: "100%", justifyContent: "center" }} disabled={busy}>
            {busy ? "Please wait…" : tab === "login" ? "Sign in" : "Create company account"}
          </button>
        </form>
      </div>
    </div>
  );
}
