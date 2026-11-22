import { Hono } from "hono";
import { deleteCookie, setCookie } from "hono/cookie";
import { loginSchema } from "@insights/contracts";
import { cookieName, issue } from "../../core/session";
import { cookieOptions, requireUser, type AppEnv } from "../../core/middleware";
import { HttpError, parse } from "../../core/errors";
import { RateLimiter } from "../../core/rate-limit";
import { EmailNotConfirmedError, type CredentialVerifier } from "../../core/supabase-auth";
import type { Config } from "../../core/config";

export function authRoutes(d: { config: Config; verifier: CredentialVerifier; limiter: RateLimiter }) {
  const r = new Hono<AppEnv>();
  const perEmail = new RateLimiter(20, 15 * 60_000); // also counts per email, so rotating the IP header does not help an attacker
  const name = cookieName(d.config.secureCookies);

  r.post("/login", async (c) => {
    const { email, password } = parse(loginSchema, await c.req.json().catch(() => null));
    const ip = c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
    const ipKey = `${ip}|${email.toLowerCase()}`;
    const emailKey = email.toLowerCase();
    const okIp = d.limiter.hit(ipKey);
    const okEmail = perEmail.hit(emailKey);
    if (!okIp || !okEmail) {
      const wait = Math.max(!okIp ? d.limiter.retryAfter(ipKey) : 0, !okEmail ? perEmail.retryAfter(emailKey) : 0);
      throw new HttpError(429, "TOO_MANY_ATTEMPTS", "Too many sign-in attempts. Please wait a few minutes and try again.", { "Retry-After": String(wait) });
    }

    let user;
    try {
      user = await d.verifier.verify(email, password);
    } catch (e) {
      if (e instanceof EmailNotConfirmedError) {
        throw new HttpError(403, "EMAIL_NOT_CONFIRMED", "Please confirm your email first. Open the confirmation link we sent when you signed up to Hisab-Kitab.");
      }
      throw e;
    }
    if (!user) throw new HttpError(401, "INVALID_CREDENTIALS", "Invalid email or password"); // same message for wrong email and wrong password
    d.limiter.reset(ipKey);
    perEmail.reset(emailKey);
    setCookie(c, name, await issue(d.config.sessionSecret, user), cookieOptions(d.config.secureCookies));
    return c.json({ user });
  });

  r.post("/logout", (c) => { deleteCookie(c, name, { path: "/", secure: d.config.secureCookies }); return c.body(null, 204); });
  r.get("/me", requireUser(d.config), (c) => c.json({ user: { id: c.get("userId"), email: c.get("email") } }));
  return r;
}
