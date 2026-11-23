import type { MiddlewareHandler } from "hono";
import { getCookie, setCookie } from "hono/cookie";
import { cookieName, IDLE_SECONDS, issue, read } from "./session";
import { HttpError } from "./errors";
import type { Config } from "./config";

export type AppEnv = { Variables: { userId: string; email: string; requestId: string } };

export const cookieOptions = (secure: boolean) =>
  ({ httpOnly: true, secure, sameSite: "Strict", path: "/", maxAge: IDLE_SECONDS }) as const;

/** Every data route sits behind this. The user id comes ONLY from the verified cookie, never from the request. */
export const requireUser = (config: Config): MiddlewareHandler<AppEnv> => async (c, next) => {
  const name = cookieName(config.secureCookies);
  const token = getCookie(c, name);
  const session = token ? await read(config.sessionSecret, token) : null;
  if (!session) throw new HttpError(401, "SESSION_EXPIRED", "Your session has expired. Please sign in again.");
  c.set("userId", session.user.id);
  c.set("email", session.user.email);
  // Sliding idle timeout: any request extends the session, up to the 8-hour cap.
  setCookie(c, name, await issue(config.sessionSecret, session.user, session.authTime), cookieOptions(config.secureCookies));
  await next();
};

/** This app only reads. Any attempt to write is refused before it can reach any handler. */
export const readOnly = (): MiddlewareHandler => async (c, next) => {
  if (!["GET", "HEAD"].includes(c.req.method)) {
    throw new HttpError(405, "METHOD_NOT_ALLOWED", "This dashboard is view-only.", { Allow: "GET, HEAD" });
  }
  await next();
};

/** CSRF: browsers always send Origin on POST; refuse anything not from our own web app. In production it is mandatory. */
export const originCheck = (config: Config): MiddlewareHandler => async (c, next) => {
  if (!["GET", "HEAD", "OPTIONS"].includes(c.req.method)) {
    const origin = c.req.header("origin") ?? (config.secureCookies ? "" : config.allowedOrigin);
    if (origin !== config.allowedOrigin) {
      console.warn(JSON.stringify({ level: "warn", code: "FORBIDDEN_ORIGIN", received: origin || "(none)", expected: config.allowedOrigin, hint: "Set ALLOWED_ORIGIN to the received value (https://host, no trailing slash)" }));
      throw new HttpError(403, "FORBIDDEN_ORIGIN", "This request was not allowed.");
    }
  }
  await next();
};

/** Behind a proxy/load balancer: plain-http requests are sent to the https address. */
export const enforceHttps = (): MiddlewareHandler => async (c, next) => {
  if (c.req.header("x-forwarded-proto") === "http") {
    const u = new URL(c.req.url);
    return c.redirect(`https://${u.host}${u.pathname}${u.search}`, 308);
  }
  await next();
};
