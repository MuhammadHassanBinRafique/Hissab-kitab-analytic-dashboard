// The only file that talks to the server. Same origin in dev (CRA proxy -> :8787) and in production
// (serve the web app and /api from one host); set REACT_APP_API_URL only if they are on different hosts.
const BASE = process.env.REACT_APP_API_URL || "";

async function request(path, { method = "GET", body } = {}) {
  let res;
  try {
    res = await fetch(`${BASE}${path}`, {
      method, credentials: "include",
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new Error("Cannot reach the server. Check your connection and try again.");
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const err = new Error(data?.error || "Something went wrong. Please try again.");
    err.status = res.status;
    err.code = data?.code;
    err.requestId = data?.requestId;
    if (res.status >= 500 && data?.requestId) err.message += ` (Reference: ${String(data.requestId).slice(0, 8)})`;
    throw err;
  }
  return data;
}
const qs = (o) => new URLSearchParams(Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== "")).toString();

export async function login(email, password) {
  try { return (await request("/api/auth/login", { method: "POST", body: { email, password } })).user; }
  catch (err) { if (err.status === 401) err.message = "Invalid email or password"; throw err; }
}
export async function getSession() {
  try { return (await request("/api/auth/me")).user; }
  catch (err) { if (err.status === 401) return null; throw err; }
}
export const logout = () => request("/api/auth/logout", { method: "POST" });

// Read-only: there is deliberately no function here that writes data.
export const getOverview = (month) => request(`/api/overview?${qs({ month })}`);
export const getLedger = (params) => request(`/api/transactions?${qs(params)}`);
export const getAccounts = () => request("/api/accounts");
export const getSavings = () => request("/api/savings");
export const getRecurring = () => request("/api/recurring");
export const getActivity = (params) => request(`/api/activity-log?${qs(params)}`);
