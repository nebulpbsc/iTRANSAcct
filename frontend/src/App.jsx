import { Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "./context/AuthContext";
import Layout from "./components/Layout";

import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Connections from "./pages/Connections";
import NewTransaction from "./pages/NewTransaction";
import Outbox from "./pages/Outbox";
import Inbox from "./pages/Inbox";
import Ledger from "./pages/Ledger";
import TrialBalance from "./pages/TrialBalance";
import Reconciliation from "./pages/Reconciliation";
import ReceivablesPayables from "./pages/ReceivablesPayables";
import AccountHeads from "./pages/AccountHeads";

function Protected({ children }) {
  const { company, loading } = useAuth();
  if (loading) return <div className="auth-shell" />;
  if (!company) return <Navigate to="/login" replace />;
  return children;
}

export default function App() {
  const { company, loading } = useAuth();

  return (
    <Routes>
      <Route
        path="/login"
        element={loading ? null : company ? <Navigate to="/" replace /> : <Login />}
      />

      <Route
        path="/"
        element={
          <Protected>
            <Layout />
          </Protected>
        }
      >
        <Route index element={<Dashboard />} />
        <Route path="connections" element={<Connections />} />
        <Route path="new" element={<NewTransaction />} />
        <Route path="outbox" element={<Outbox />} />
        <Route path="inbox" element={<Inbox />} />
        <Route path="reports/ledger" element={<Ledger />} />
        <Route path="reports/trial-balance" element={<TrialBalance />} />
        <Route path="reports/reconciliation" element={<Reconciliation />} />
        <Route path="reports/receivables-payables" element={<ReceivablesPayables />} />
        <Route path="settings/account-heads" element={<AccountHeads />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
