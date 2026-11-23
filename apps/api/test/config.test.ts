import { describe, expect, it, vi } from "vitest";
import { loadConfig } from "../src/core/config";
import { createApp } from "../src/app";

const env = { SUPABASE_URL: "https://a.supabase.co", SUPABASE_ANON_KEY: "k".repeat(30), ANALYTICS_DATABASE_URL: "postgresql://u:p@h:6543/postgres", SESSION_SECRET: "s".repeat(40) };

describe("ALLOWED_ORIGIN is forgiving about how it is typed", () => {
  it.each([
    ["https://site.vercel.app/", "https://site.vercel.app"],
    ["https://Site.Vercel.App", "https://site.vercel.app"],
    ["https://site.vercel.app/login", "https://site.vercel.app"],
    ["http://localhost:3000/", "http://localhost:3000"],
  ])("%s -> %s", (typed, expected) => {
    expect(loadConfig({ ...env, ALLOWED_ORIGIN: typed }).allowedOrigin).toBe(expected);
  });
  it("still refuses a value that is not a URL", () => {
    expect(() => loadConfig({ ...env, ALLOWED_ORIGIN: "site.vercel.app" })).toThrow();
  });
  it("a login from the typed-with-slash site works in production; the log says what mismatched when it does not", async () => {
    const config = { ...loadConfig({ ...env, ALLOWED_ORIGIN: "https://site.vercel.app/" }), secureCookies: true };
    const verifier = { verify: async () => ({ id: "u", email: "a@x.com" }) };
    const app = createApp({ db: { asUser: async () => { throw new Error("unused"); }, close: async () => {} }, verifier, config });
    const post = (origin: string) => app.request("/api/auth/login", { method: "POST", headers: { "content-type": "application/json", origin }, body: JSON.stringify({ email: "a@x.com", password: "x" }) });
    expect((await post("https://site.vercel.app")).status).toBe(200);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const res = await post("https://other-name.vercel.app");
    expect(res.status).toBe(403);
    expect(await res.text()).not.toContain("other-name"); // the response stays generic
    expect(String(warn.mock.calls[0][0])).toContain("https://other-name.vercel.app"); // the log is specific
    warn.mockRestore();
  });
});
