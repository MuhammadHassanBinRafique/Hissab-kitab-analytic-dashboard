import { Hono, type Context } from "hono";
import { bodyLimit } from "hono/body-limit";
import { logger } from "hono/logger";
import { requestId } from "hono/request-id";
import { secureHeaders } from "hono/secure-headers";
import type { Db } from "./core/db";
import type { Config } from "./core/config";
import type { CredentialVerifier } from "./core/supabase-auth";
import { RateLimiter } from "./core/rate-limit";
import { describe, type ErrorCode } from "./core/errors";
import { enforceHttps, originCheck, readOnly, requireUser, type AppEnv } from "./core/middleware";
import { authRoutes } from "./modules/auth/routes";
import { overviewRoutes } from "./modules/overview/routes";
import { transactionsRoutes } from "./modules/transactions/routes";
import { accountsRoutes } from "./modules/accounts/routes";
import { savingsRoutes } from "./modules/savings/routes";
import { recurringRoutes } from "./modules/recurring/routes";
import { activityLogRoutes } from "./modules/activity-log/routes";

export type AppDeps = { db: Db; verifier: CredentialVerifier; config: Config; limiter?: RateLimiter; log?: boolean };

// One shape for every error: { error: <safe message>, code: <dedicated code>, requestId: <for support> }
const fail = (c: Context<AppEnv>, status: number, code: ErrorCode, message: string) =>
  c.json({ error: message, code, requestId: c.get("requestId") }, status as 400);

/** Wires the modules together. Adding a feature = a new folder in modules/ + one line here. */
export function createApp({ db, verifier, config, limiter = new RateLimiter(), log = false }: AppDeps) {
  const app = new Hono<AppEnv>();
  app.use("*", requestId());
  if (log) app.use("*", logger());
  if (config.secureCookies) app.use("*", enforceHttps());
  app.use("*", secureHeaders({
    contentSecurityPolicy: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] }, // the API only ever returns JSON
    xFrameOptions: "DENY", referrerPolicy: "no-referrer", crossOriginResourcePolicy: "same-origin",
  }));
  app.use("*", async (c, next) => { await next(); c.header("Cache-Control", "private, no-store"); });
  app.use("/api/*", originCheck(config));
  app.use("/api/auth/*", bodyLimit({ maxSize: 2 * 1024, onError: (c) => fail(c as Context<AppEnv>, 413, "PAYLOAD_TOO_LARGE", "The request is too large.") }));

  app.get("/api/health", (c) => c.json({ ok: true }));
  app.route("/api/auth", authRoutes({ config, verifier, limiter }));

  const secured = new Hono<AppEnv>();
  secured.use("*", requireUser(config)); // unauthenticated callers get 401 for everything below, so routes cannot be probed
  secured.use("*", readOnly());
  secured.route("/overview", overviewRoutes(db));
  secured.route("/transactions", transactionsRoutes(db));
  secured.route("/accounts", accountsRoutes(db));
  secured.route("/savings", savingsRoutes(db));
  secured.route("/recurring", recurringRoutes(db));
  secured.route("/activity-log", activityLogRoutes(db));
  app.route("/api", secured);

  // Anything else: API paths get a JSON 404; browser pages are sent to the dashboard's front door.
  app.notFound((c) => {
    const path = new URL(c.req.url).pathname;
    if (!path.startsWith("/api/") && ["GET", "HEAD"].includes(c.req.method)) return c.redirect(config.allowedOrigin, 302);
    return fail(c, 404, "NOT_FOUND", "This address does not exist.");
  });

  // The single global error handler: every thrown error ends up here, and only a safe description leaves.
  app.onError((err, c) => {
    const e = describe(err);
    if (e.status >= 500) {
      const cause = err as { name?: string; code?: string; message?: string };
      // Full detail goes to the server log only (never the request body, password or cookie).
      console.error(JSON.stringify({ level: "error", requestId: c.get("requestId"), method: c.req.method, path: new URL(c.req.url).pathname, status: e.status, code: e.code, cause: { name: cause?.name, code: cause?.code, message: String(cause?.message ?? "").slice(0, 300) } }));
    }
    for (const [k, v] of Object.entries(e.headers)) c.header(k, v);
    return fail(c, e.status, e.code, e.message);
  });
  return app;
}
