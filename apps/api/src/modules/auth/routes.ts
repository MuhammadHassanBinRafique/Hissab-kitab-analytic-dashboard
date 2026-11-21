import { Hono } from "hono";
import { deleteCookie, setCookie } from "hono/cookie";
import { loginSchema } from "@insights/contracts";
import { COOKIE, issue } from "../../core/session";
import { cookieOptions, requireUser, type AppEnv } from "../../core/middleware";
import { HttpError, parse } from "../../core/errors";
import { EmailNotConfirmedError, type CredentialVerifier } from "../../core/supabase-auth";
import type { RateLimiter } from "../../core/rate-limit";
import type { Config } from "../../core/config";

export function authRoutes(d: { config: Config; verifier: CredentialVerifier; limiter: RateLimiter }) {
  const r = new Hono<AppEnv>();

  r.post("/login", async (c) => {
    const { email, password } = parse(loginSchema, await c.req.json().catch(() => null));
    const ip = c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
    const key = `${ip}|${email.toLowerCase()}`;
    if (!d.limiter.hit(key)) throw new HttpError(429, "Too many attempts. Try again in a few minutes.");

    let user;
    try {
      user = await d.verifier.verify(email, password);
    } catch (e) {
      if (e instanceof EmailNotConfirmedError) {
        throw new HttpError(403, "Please confirm your email first. Open the confirmation link we sent when you signed up to Hisab-Kitab.", "email_not_confirmed");
      }
      throw e;
    }
    if (!user) throw new HttpError(401, "Invalid email or password"); // same message for wrong email and wrong password
    d.limiter.reset(key);
    setCookie(c, COOKIE, await issue(d.config.sessionSecret, user), cookieOptions(d.config.secureCookies));
    return c.json({ user });
  });

  r.post("/logout", (c) => { deleteCookie(c, COOKIE, { path: "/" }); return c.body(null, 204); });
  r.get("/me", requireUser(d.config), (c) => c.json({ user: { id: c.get("userId"), email: c.get("email") } }));
  return r;
}
