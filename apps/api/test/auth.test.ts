import { describe, expect, it, vi } from "vitest";
import { EmailNotConfirmedError, supabaseVerifier } from "../src/core/supabase-auth";
import { RateLimiter } from "../src/core/rate-limit";
import { issue, read } from "../src/core/session";
import { currentMonthPK, addMonths } from "../src/core/dates";

const res = (status: number, body: unknown = {}) => new Response(status === 204 ? null : JSON.stringify(body), { status });

describe("Supabase credential check", () => {
  it("returns the user on success and revokes only that one Supabase session", async () => {
    const f = vi.fn().mockResolvedValueOnce(res(200, { access_token: "tok", user: { id: "u1", email: "a@x.com" } })).mockResolvedValueOnce(res(204));
    const user = await supabaseVerifier("https://p.supabase.co", "anon", f as any).verify("a@x.com", "pw");
    expect(user).toEqual({ id: "u1", email: "a@x.com" });
    expect(f.mock.calls[0][0]).toBe("https://p.supabase.co/auth/v1/token?grant_type=password");
    expect(f.mock.calls[1][0]).toBe("https://p.supabase.co/auth/v1/logout?scope=local"); // local: the portal session survives
    expect(f.mock.calls[1][1].headers.Authorization).toBe("Bearer tok");
  });
  it("says so when the password is right but the email was never confirmed", async () => {
    const f = (async () => res(400, { error_code: "email_not_confirmed", msg: "Email not confirmed" })) as any;
    await expect(supabaseVerifier("https://p", "k", f).verify("new@x.com", "pw")).rejects.toBeInstanceOf(EmailNotConfirmedError);
  });
  it("returns null for wrong credentials and throws when Supabase is down", async () => {
    expect(await supabaseVerifier("https://p", "k", (async () => res(400, { error: "invalid_grant" })) as any).verify("a@x.com", "bad")).toBeNull();
    await expect(supabaseVerifier("https://p", "k", (async () => res(503)) as any).verify("a@x.com", "pw")).rejects.toThrow();
  });
});

describe("session token", () => {
  it("round-trips, and is rejected with another secret", async () => {
    const t = await issue("s".repeat(40), { id: "u1", email: "a@x.com" });
    expect((await read("s".repeat(40), t))?.user).toEqual({ id: "u1", email: "a@x.com" });
    expect(await read("z".repeat(40), t)).toBeNull();
  });
});

describe("helpers", () => {
  it("rate limiter resets after its window", () => {
    const l = new RateLimiter(2, 1000);
    expect([l.hit("k", 0), l.hit("k", 1), l.hit("k", 2), l.hit("k", 1500)]).toEqual([true, true, false, true]);
  });
  it("months roll over year boundaries; 'now' is decided in Pakistan time", () => {
    expect(addMonths("2026-01", -2)).toBe("2025-11");
    expect(addMonths("2026-12", 1)).toBe("2027-01");
    expect(currentMonthPK(new Date("2026-11-30T20:00:00Z"))).toBe("2026-12"); // already 1 Dec in Pakistan (UTC+5)
  });
});
