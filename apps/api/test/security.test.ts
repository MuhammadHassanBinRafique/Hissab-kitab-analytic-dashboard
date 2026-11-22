import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { sign } from "hono/jwt";
import type { PGlite } from "@electric-sql/pglite";
import { createApp } from "../src/app";
import { AuthServiceError } from "../src/core/errors";
import { RateLimiter } from "../src/core/rate-limit";
import type { CredentialVerifier } from "../src/core/supabase-auth";
import type { Db } from "../src/core/db";
import { makeTestDb } from "./helpers";

const ORIGIN = "https://insights.example.com";
const base = { supabaseUrl: "http://x", supabaseAnonKey: "k".repeat(30), databaseUrl: "postgres://x", sessionSecret: "s".repeat(40), allowedOrigin: ORIGIN, secureCookies: false, port: 0 };
const USERS: Record<string, { pw: string; id: string }> = { "a@x.com": { pw: "secret-a", id: "user-a" }, "b@x.com": { pw: "secret-b", id: "user-b" } };
const verifier: CredentialVerifier = { verify: async (e, p) => (USERS[e]?.pw === p ? { id: USERS[e].id, email: e } : null) };

let db: Db; let pg: PGlite;
beforeAll(async () => { ({ db, pg } = await makeTestDb()); });
afterAll(async () => { await db.close(); });

const mk = (o: { config?: Partial<typeof base>; db?: Db; verifier?: CredentialVerifier } = {}) =>
  createApp({ db: o.db ?? db, verifier: o.verifier ?? verifier, config: { ...base, ...o.config }, limiter: new RateLimiter() });
type App = ReturnType<typeof mk>;
const headers = (extra: Record<string, string> = {}) => ({ "content-type": "application/json", origin: ORIGIN, ...extra });
const login = (app: App, email = "a@x.com", password = USERS[email]?.pw ?? "x", extra: Record<string, string> = {}) =>
  app.request("/api/auth/login", { method: "POST", headers: headers(extra), body: JSON.stringify({ email, password }) });
async function signIn(app: App, email = "a@x.com") {
  const res = await login(app, email);
  return res.headers.get("set-cookie")!.split(";")[0];
}
const get = (app: App, path: string, cookie?: string) => app.request(path, { headers: cookie ? { cookie } : {} });
const rowCount = async () => (await pg.query<{ n: number }>(`SELECT ((SELECT count(*) FROM transactions) + (SELECT count(*) FROM accounts) + (SELECT count(*) FROM audit_logs))::int AS n`)).rows[0].n;
const failingDb = (code: string): Db => ({ asUser: async () => { throw Object.assign(new Error(`connect ${code} 10.0.0.5:6543 postgres://analytics_ro:hunter2@db`), { code }); }, close: async () => {} });
const LEAKS = /stack|postgres|password authentication|node_modules|\/src\/|select |ECONNREFUSED|supabase|hunter2|10\.0\.0\.5|analytics_ro|at .*\(.*:\d+:\d+\)/i;

describe("endpoint inventory", () => {
  const PUBLIC = ["GET /api/health", "POST /api/auth/login", "POST /api/auth/logout"];
  const DATA = ["/api/accounts", "/api/activity-log", "/api/overview", "/api/recurring", "/api/savings", "/api/transactions"];
  const endpoints = () => [...new Set(mk().routes.filter((r) => r.method !== "ALL" && !r.path.includes("*")).map((r) => `${r.method} ${r.path.replace(/\/$/, "")}`))].sort();

  it("exposes exactly the endpoints we expect (a new, unreviewed route fails this test)", () => {
    expect(endpoints()).toEqual([...PUBLIC, "GET /api/auth/me", ...DATA.map((p) => `GET ${p}`)].sort());
  });
  it("every endpoint except the 3 public ones answers 401 without a session", async () => {
    const app = mk();
    for (const e of endpoints().filter((e) => !PUBLIC.includes(e))) {
      const [method, path] = e.split(" ");
      const res = await app.request(path, { method, headers: headers() });
      expect(res.status, e).toBe(401);
      expect(((await res.json()) as any).code).toBe("SESSION_EXPIRED");
    }
  });
  it("nothing can write: POST/PUT/PATCH/DELETE are refused (401 signed out, 405 signed in) and the database is untouched", async () => {
    const app = mk(); const cookie = await signIn(app); const before = await rowCount();
    for (const path of DATA) for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
      expect((await app.request(path, { method, headers: headers(), body: "{}" })).status).toBe(401);
      const res = await app.request(path, { method, headers: headers({ cookie }), body: JSON.stringify({ name: "x" }) });
      expect(res.status, `${method} ${path}`).toBe(405);
      expect(res.headers.get("allow")).toContain("GET");
      expect(((await res.json()) as any).code).toBe("METHOD_NOT_ALLOWED");
    }
    expect(await rowCount()).toBe(before);
  });
});

describe("injection and malformed input", () => {
  const EVIL = ["' OR '1'='1", "'; DROP TABLE transactions; --", "1 UNION SELECT * FROM users", "../../etc/passwd", "%00", "a".repeat(5000)];
  const PARAMS: [string, string][] = [["/api/transactions", "accountId"], ["/api/transactions", "month"], ["/api/transactions", "type"], ["/api/transactions", "limit"], ["/api/transactions", "offset"],
    ["/api/activity-log", "cursor"], ["/api/activity-log", "event"], ["/api/activity-log", "status"], ["/api/activity-log", "from"], ["/api/activity-log", "to"], ["/api/overview", "month"]];

  it("hostile values in every query parameter get a clean 400, never a 500, and never change data", async () => {
    const app = mk(); const cookie = await signIn(app); const before = await rowCount();
    for (const [path, param] of PARAMS) for (const evil of EVIL) {
      const res = await get(app, `${path}?${param}=${encodeURIComponent(evil)}`, cookie);
      expect(res.status, `${param}=${evil.slice(0, 20)}`).toBe(400);
      expect(((await res.json()) as any).code).toBe("INVALID_REQUEST");
    }
    expect((await get(app, "/api/transactions?accountId=%00", cookie)).status).toBe(400);
    expect(await rowCount()).toBe(before);
  });
  it("another user's ids give nothing back", async () => {
    const app = mk(); const cookie = await signIn(app, "a@x.com");
    const l = (await (await get(app, "/api/transactions?month=2026-11&accountId=b-acc", cookie)).json()) as any;
    expect(l.total).toBe(0);
    const a = (await (await get(app, "/api/activity-log?cursor=log-b", cookie)).json()) as any;
    expect(a.rows).toEqual([]);
  });
  it("login: malformed JSON, wrong types and oversized bodies are rejected with the right code", async () => {
    const app = mk();
    const bad = (body: string) => app.request("/api/auth/login", { method: "POST", headers: headers(), body });
    expect((await bad("{not json")).status).toBe(400);
    expect((await bad(JSON.stringify({ email: 123, password: ["x"] }))).status).toBe(400);
    expect((await bad(JSON.stringify({ email: "a@x.com" }))).status).toBe(400);
    const big = await bad(JSON.stringify({ email: "a@x.com", password: "p".repeat(5000) }));
    expect(big.status).toBe(413);
    expect(((await big.json()) as any).code).toBe("PAYLOAD_TOO_LARGE");
  });
});

describe("session forgery", () => {
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  const claims = { sub: "user-b", em: "b@x.com", iat: now, at: now, exp: now + 900 };
  it("rejects tokens with alg none, a wrong secret, missing claims, or garbage", async () => {
    const app = mk();
    const tokens = [
      `${b64({ alg: "none", typ: "JWT" })}.${b64(claims)}.`,
      await sign(claims, "x".repeat(40), "HS256"),
      await sign({ sub: "user-b", iat: now, exp: now + 900 }, base.sessionSecret, "HS256"), // right secret, no email claim
      "garbage", "a.b.c", "x".repeat(10_000), "",
    ];
    for (const t of tokens) expect((await get(app, "/api/accounts", `hk_insights=${t}`)).status, t.slice(0, 15)).toBe(401);
  });
});

describe("errors are dedicated, safe and traceable", () => {
  it("unknown API paths: JSON 404 with a code; unknown pages: redirected to the dashboard's front door", async () => {
    const app = mk(); const cookie = await signIn(app);
    const nf = await get(app, "/api/does-not-exist", cookie);
    expect(nf.status).toBe(404);
    expect(((await nf.json()) as any).code).toBe("NOT_FOUND");
    const page = await get(app, "/admin/.env");
    expect(page.status).toBe(302);
    expect(page.headers.get("location")).toBe(ORIGIN);
    expect((await app.request("/wp-login.php", { method: "POST" })).status).toBe(404); // writes to unknown pages are not redirected
  });
  it("every error carries a requestId that matches the X-Request-Id header", async () => {
    const res = await get(mk(), "/api/accounts");
    const body = (await res.json()) as any;
    expect(body.requestId).toBeTruthy();
    expect(res.headers.get("x-request-id")).toBe(body.requestId);
  });
  it("database down / slow, sign-in service down, and unexpected bugs each get their own code and leak nothing", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const cases: [string, App, string, number][] = [
      ["db refused", mk({ db: failingDb("ECONNREFUSED") }), "DATABASE_UNAVAILABLE", 503],
      ["db statement timeout", mk({ db: failingDb("57014") }), "DATABASE_UNAVAILABLE", 503],
      ["db tenant not found", mk({ db: failingDb("XX000") }), "DATABASE_UNAVAILABLE", 503],
      ["unexpected bug", mk({ db: failingDb("SOMETHING_ELSE") }), "INTERNAL_ERROR", 500],
    ];
    for (const [name, app, code, status] of cases) {
      const res = await get(app, "/api/accounts", await signIn(app));
      const text = await res.text();
      expect(res.status, name).toBe(status);
      expect(JSON.parse(text).code, name).toBe(code);
      expect(text, name).not.toMatch(LEAKS);
    }
    const down = mk({ verifier: { verify: async () => { throw new AuthServiceError("Supabase Auth responded 503 https://abc.supabase.co"); } } });
    const res = await login(down);
    const text = await res.text();
    expect(res.status).toBe(503);
    expect(JSON.parse(text).code).toBe("AUTH_SERVICE_UNAVAILABLE");
    expect(text).not.toMatch(LEAKS);
    // the real detail is in the server log, with the requestId, but never the password or the cookie
    const logged = spy.mock.calls.map((c) => String(c[0])).join("\n");
    expect(logged).toContain("requestId");
    expect(logged).not.toContain("secret-a");
    expect(logged).not.toContain("hk_insights");
    spy.mockRestore();
  });
  it("a missing/expired session, wrong password, and unconfirmed email have different codes", async () => {
    const app = mk();
    expect(((await (await login(app, "a@x.com", "nope")).json()) as any).code).toBe("INVALID_CREDENTIALS");
    expect(((await (await get(app, "/api/accounts")).json()) as any).code).toBe("SESSION_EXPIRED");
    const res = await login(mk({ verifier: { verify: async () => { const { EmailNotConfirmedError } = await import("../src/core/supabase-auth"); throw new EmailNotConfirmedError(); } } }));
    expect(((await res.json()) as any).code).toBe("EMAIL_NOT_CONFIRMED");
  });
});

describe("brute force", () => {
  it("is blocked even when the attacker changes the X-Forwarded-For header every time, and says when to retry", async () => {
    const app = mk(); const statuses: number[] = [];
    let last: Response | undefined;
    for (let i = 0; i < 25; i++) { last = await login(app, "a@x.com", "wrong", { "x-forwarded-for": `10.1.1.${i}` }); statuses.push(last.status); }
    expect(statuses.filter((s) => s === 401).length).toBeLessThanOrEqual(20);
    expect(statuses.at(-1)).toBe(429);
    expect(Number(last!.headers.get("retry-after"))).toBeGreaterThan(0);
    expect(((await last!.json()) as any).code).toBe("TOO_MANY_ATTEMPTS");
  });
});

describe("transport and headers", () => {
  it("sends hardening headers and never caches", async () => {
    const h = (await mk().request("/api/health")).headers;
    expect(h.get("x-content-type-options")).toBe("nosniff");
    expect(h.get("x-frame-options")).toBe("DENY");
    expect(h.get("content-security-policy")).toContain("default-src 'none'");
    expect(h.get("referrer-policy")).toBe("no-referrer");
    expect(h.get("strict-transport-security")).toBeTruthy();
    expect(h.get("cache-control")).toContain("no-store");
    expect(h.get("x-powered-by")).toBeNull();
  });
  it("allows no cross-site reads (no CORS headers, even for a preflight)", async () => {
    const app = mk();
    const a = await app.request("/api/health", { headers: { origin: "https://evil.example" } });
    expect(a.headers.get("access-control-allow-origin")).toBeNull();
    const p = await app.request("/api/accounts", { method: "OPTIONS", headers: { origin: "https://evil.example", "access-control-request-method": "GET" } });
    expect(p.headers.get("access-control-allow-origin")).toBeNull();
  });
  it("production: cookie is __Host- prefixed, Secure, HttpOnly, SameSite=Strict, Path=/, no Domain", async () => {
    const app = mk({ config: { secureCookies: true } });
    const res = await login(app);
    const c = res.headers.get("set-cookie")!;
    expect(c).toMatch(/^__Host-hk_insights=/);
    for (const f of [/Secure/i, /HttpOnly/i, /SameSite=Strict/i, /Path=\//i]) expect(c).toMatch(f);
    expect(c).not.toMatch(/Domain=/i);
    expect((await get(app, "/api/accounts", c.split(";")[0])).status).toBe(200);
  });
  it("production: a login without an Origin header is refused; with the right one it works", async () => {
    const app = mk({ config: { secureCookies: true } });
    const noOrigin = await app.request("/api/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: "a@x.com", password: "secret-a" }) });
    expect(noOrigin.status).toBe(403);
    expect(((await noOrigin.json()) as any).code).toBe("FORBIDDEN_ORIGIN");
    expect((await login(app)).status).toBe(200);
  });
  it("production: plain http is redirected to https; https passes through", async () => {
    const app = mk({ config: { secureCookies: true } });
    const r = await app.request("http://insights.example.com/api/overview?month=2026-11", { headers: { "x-forwarded-proto": "http" } });
    expect(r.status).toBe(308);
    expect(r.headers.get("location")).toBe("https://insights.example.com/api/overview?month=2026-11");
    expect((await app.request("https://insights.example.com/api/health", { headers: { "x-forwarded-proto": "https" } })).status).toBe(200);
  });
});
