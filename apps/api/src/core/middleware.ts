import type { MiddlewareHandler } from "hono";
import { getCookie, setCookie } from "hono/cookie";
import { COOKIE, IDLE_SECONDS, issue, read } from "./session";
import { HttpError } from "./errors";
import type { Config } from "./config";

export type AppEnv = { Variables: { userId: string; email: string } };

export const cookieOptions = (secure: boolean) =>
  ({ httpOnly: true, secure, sameSite: "Strict", path: "/", maxAge: IDLE_SECONDS }) as const;

/** Every data route sits behind this. The user id comes ONLY from the verified cookie, never from the request. */
export const requireUser = (config: Config): MiddlewareHandler<AppEnv> => async (c, next) => {
  const token = getCookie(c, COOKIE);
  const session = token ? await read(config.sessionSecret, token) : null;
  if (!session) throw new HttpError(401, "Session expired");
  c.set("userId", session.user.id);
  c.set("email", session.user.email);
  // Sliding idle timeout: any request extends the session, up to the 8-hour cap.
  setCookie(c, COOKIE, await issue(config.sessionSecret, session.user, session.authTime), cookieOptions(config.secureCookies));
  await next();
};

/** CSRF: browsers always send Origin on POST; refuse anything not from our own web app. */
export const originCheck = (config: Config): MiddlewareHandler => async (c, next) => {
  if (!["GET", "HEAD", "OPTIONS"].includes(c.req.method)) {
    const origin = c.req.header("origin");
    if (origin && origin !== config.allowedOrigin) throw new HttpError(403, "Forbidden");
  }
  await next();
};
