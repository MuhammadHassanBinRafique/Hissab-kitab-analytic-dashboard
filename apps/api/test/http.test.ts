import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sign } from "hono/jwt";
import type { Db } from "../src/core/db";
import { createApp } from "../src/app";
import { RateLimiter } from "../src/core/rate-limit";
import { EmailNotConfirmedError, type CredentialVerifier } from "../src/core/supabase-auth";
import { makeTestDb } from "./helpers";

const ORIGIN = "http://localhost:5173";
const config = { supabaseUrl: "http://x", supabaseAnonKey: "k".repeat(30), databaseUrl: "postgres://x", sessionSecret: "s".repeat(40), allowedOrigin: ORIGIN, secureCookies: false, port: 0 };
const USERS: Record<string, { pw: string; id: string }> = { "a@x.com": { pw: "secret-a", id: "user-a" }, "b@x.com": { pw: "secret-b", id: "user-b" } };
const verifier: CredentialVerifier = {
  verify: async (email, pw) => {
    if (email === "new@x.com") throw new EmailNotConfirmedError();
    return USERS[email]?.pw === pw ? { id: USERS[email].id, email } : null;
  },
};

let db: Db;
beforeAll(async () => { ({ db } = await makeTestDb()); });
afterAll(async () => { await db.close(); });

const mk = (over: Partial<Parameters<typeof createApp>[0]> = {}) => createApp({ db, verifier, config, limiter: new RateLimiter(), ...over });
const post = (app: ReturnType<typeof mk>, path: string, body: unknown, origin = ORIGIN) =>
  app.request(path, { method: "POST", headers: { "content-type": "application/json", origin }, body: JSON.stringify(body) });
async function signIn(app: ReturnType<typeof mk>, email = "a@x.com") {
  const res = await post(app, "/api/auth/login", { email, password: USERS[email].pw });
  return { res, cookie: res.headers.get("set-cookie")!.split(";")[0] };
}
const get = (app: ReturnType<typeof mk>, path: string, cookie?: string) => app.request(path, { headers: cookie ? { cookie } : {} });

describe("login and session", () => {
  it("signs in with the portal credentials and sets a locked-down cookie", async () => {
    const { res } = await signIn(mk());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ user: { id: "user-a", email: "a@x.com" } });
    const flags = res.headers.get("set-cookie")!;
    expect(flags).toMatch(/HttpOnly/i);
    expect(flags).toMatch(/SameSite=Strict/i);
    expect(flags).not.toContain("secret-a"); // the password is never stored
  });
  it("rejects a wrong password with a generic message", async () => {
    const res = await post(mk(), "/api/auth/login", { email: "a@x.com", password: "nope" });
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Invalid email or password" });
  });
  it("tells a not-yet-confirmed new user to confirm their email (not 'wrong password')", async () => {
    const res = await post(mk(), "/api/auth/login", { email: "new@x.com", password: "whatever" });
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: "email_not_confirmed" });
  });
  it("blocks brute force after 5 failed attempts", async () => {
    const app = mk({ limiter: new RateLimiter(5, 60_000) });
    for (let i = 0; i < 5; i++) expect((await post(app, "/api/auth/login", { email: "a@x.com", password: "bad" })).status).toBe(401);
    expect((await post(app, "/api/auth/login", { email: "a@x.com", password: "bad" })).status).toBe(429);
  });
  it("refuses a login coming from another website (CSRF)", async () => {
    expect((await post(mk(), "/api/auth/login", { email: "a@x.com", password: "secret-a" }, "https://evil.example")).status).toBe(403);
  });
  it("/me returns the user; logout clears the cookie", async () => {
    const app = mk();
    const { cookie } = await signIn(app);
    expect(await (await get(app, "/api/auth/me", cookie)).json()).toEqual({ user: { id: "user-a", email: "a@x.com" } });
    const out = await post(app, "/api/auth/logout", {});
    expect(out.status).toBe(204);
    expect(out.headers.get("set-cookie")).toMatch(/hk_insights=;|Max-Age=0/i);
  });
  it("every request extends the idle timeout (sliding session)", async () => {
    const app = mk();
    const { cookie } = await signIn(app);
    expect((await get(app, "/api/accounts", cookie)).headers.get("set-cookie")).toContain("hk_insights=");
  });
});

describe("every data route needs a valid session", () => {
  const routes = ["overview", "transactions", "accounts", "savings", "recurring", "activity-log"];
  it("401 without a cookie", async () => {
    const app = mk();
    for (const r of routes) expect((await get(app, `/api/${r}`)).status).toBe(401);
  });
  it("401 for a tampered or expired cookie", async () => {
    const app = mk();
    const { cookie } = await signIn(app);
    expect((await get(app, "/api/accounts", cookie.slice(0, -3) + "abc")).status).toBe(401);
    const old = Math.floor(Date.now() / 1000) - 60;
    const expired = await sign({ sub: "user-a", em: "a@x.com", iat: old - 900, at: old - 900, exp: old }, config.sessionSecret, "HS256");
    expect((await get(app, "/api/accounts", `hk_insights=${expired}`)).status).toBe(401);
    const forged = await sign({ sub: "user-b", em: "b@x.com", iat: old, at: old, exp: old + 900 }, "wrong-secret-wrong-secret-wrong-secret", "HS256");
    expect((await get(app, "/api/accounts", `hk_insights=${forged}`)).status).toBe(401);
  });
});

describe("each user sees only their own data over HTTP", () => {
  it("A and B get different results", async () => {
    const app = mk();
    const a = await signIn(app, "a@x.com");
    const b = await signIn(app, "b@x.com");
    const ao = await (await get(app, "/api/overview?month=2026-11", a.cookie)).json() as any;
    const bo = await (await get(app, "/api/overview?month=2026-11", b.cookie)).json() as any;
    expect(ao.kpis.income).toBe(60000.1);
    expect(bo.kpis.income).toBe(777);
    expect((await (await get(app, "/api/accounts", b.cookie)).json() as any).accounts).toHaveLength(1);
  });
  it("a user id in the URL or headers is ignored", async () => {
    const app = mk();
    const { cookie } = await signIn(app, "a@x.com");
    const res = await app.request("/api/accounts?userId=user-b", { headers: { cookie, "x-user-id": "user-b" } });
    expect(((await res.json()) as any).accounts).toHaveLength(3);
  });
});

describe("input validation and errors", () => {
  it("400 for a bad month, an unknown audit event or an absurd limit", async () => {
    const app = mk();
    const { cookie } = await signIn(app);
    for (const p of ["/api/overview?month=abc", "/api/activity-log?event=drop.table", "/api/transactions?limit=100000", "/api/transactions?type=HACK"]) {
      expect((await get(app, p, cookie)).status).toBe(400);
    }
  });
  it("a database failure returns a generic 500 and leaks nothing", async () => {
    const broken: Db = { asUser: async () => { throw new Error("password authentication failed for user analytics_ro @ 10.0.0.5"); }, close: async () => {} };
    const app = mk({ db: broken });
    const { cookie } = await signIn(app);
    const res = await get(app, "/api/accounts", cookie);
    expect(res.status).toBe(500);
    expect(await res.text()).not.toContain("10.0.0.5");
  });
  it("responses are never cached", async () => {
    const app = mk();
    const { cookie } = await signIn(app);
    expect((await get(app, "/api/accounts", cookie)).headers.get("cache-control")).toContain("no-store");
  });
});
