const TOKEN_KEY = "itransacct_token";

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

async function request(path, { method = "GET", body, auth = true } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (auth) {
    const token = getToken();
    if (token) headers["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(`/api${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    let detail = res.statusText;
    try {
      const data = await res.json();
      detail = data.detail || detail;
    } catch (_) {
      /* no JSON body */
    }
    if (res.status === 401) setToken(null);
    throw new Error(typeof detail === "string" ? detail : JSON.stringify(detail));
  }

  if (res.status === 204) return null;
  return res.json();
}

export const api = {
  register: (payload) => request("/auth/register", { method: "POST", body: payload, auth: false }),
  login: (payload) => request("/auth/login", { method: "POST", body: payload, auth: false }),
  me: () => request("/auth/me"),

  connections: () => request("/companies/connections"),
  connect: (connect_code) => request("/companies/connect", { method: "POST", body: { connect_code } }),

  accounts: () => request("/accounts"),
  createAccount: (payload) => request("/accounts", { method: "POST", body: payload }),

  createTransaction: (payload) => request("/transactions", { method: "POST", body: payload }),
  sendTransaction: (id) => request(`/transactions/${id}/send`, { method: "POST" }),
  takeTransaction: (id, payload = {}) => request(`/transactions/${id}/take`, { method: "POST", body: payload }),
  rejectTransaction: (id, payload = {}) => request(`/transactions/${id}/reject`, { method: "POST", body: payload }),
  outbox: (state) => request(`/transactions/outbox${state ? `?state=${state}` : ""}`),
  inbox: (state) => request(`/transactions/inbox${state ? `?state=${state}` : ""}`),
  getTransaction: (id) => request(`/transactions/${id}`),

  ledger: (accountId, params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request(`/reports/ledger/${accountId}${qs ? `?${qs}` : ""}`);
  },
  trialBalance: (as_of) => request(`/reports/trial-balance${as_of ? `?as_of=${as_of}` : ""}`),
  reconciliation: (counterpartyId) => request(`/reports/reconciliation/${counterpartyId}`),
  receivablesPayables: () => request(`/reports/receivables-payables`),
};
