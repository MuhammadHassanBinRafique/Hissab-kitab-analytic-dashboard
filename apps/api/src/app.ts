import { Hono } from "hono";
import { logger } from "hono/logger";
import { secureHeaders } from "hono/secure-headers";
import type { Db } from "./core/db";
import type { Config } from "./core/config";
import type { CredentialVerifier } from "./core/supabase-auth";
import { RateLimiter } from "./core/rate-limit";
import { HttpError } from "./core/errors";
import { originCheck, requireUser, type AppEnv } from "./core/middleware";
import { authRoutes } from "./modules/auth/routes";
import { overviewRoutes } from "./modules/overview/routes";
import { transactionsRoutes } from "./modules/transactions/routes";
import { accountsRoutes } from "./modules/accounts/routes";
import { savingsRoutes } from "./modules/savings/routes";
import { recurringRoutes } from "./modules/recurring/routes";
import { activityLogRoutes } from "./modules/activity-log/routes";

export type AppDeps = { db: Db; verifier: CredentialVerifier; config: Config; limiter?: RateLimiter; log?: boolean };

/** Wires the modules together. Adding a feature = a new folder in modules/ + one line here. */
export function createApp({ db, verifier, config, limiter = new RateLimiter(), log = false }: AppDeps) {
  const app = new Hono<AppEnv>();
  if (log) app.use("*", logger());
  app.use("*", secureHeaders());
  app.use("*", async (c, next) => { await next(); c.header("Cache-Control", "private, no-store"); });
  app.use("/api/*", originCheck(config));

  app.get("/api/health", (c) => c.json({ ok: true }));
  app.route("/api/auth", authRoutes({ config, verifier, limiter }));

  const secured = new Hono<AppEnv>();
  secured.use("*", requireUser(config));
  secured.route("/overview", overviewRoutes(db));
  secured.route("/transactions", transactionsRoutes(db));
  secured.route("/accounts", accountsRoutes(db));
  secured.route("/savings", savingsRoutes(db));
  secured.route("/recurring", recurringRoutes(db));
  secured.route("/activity-log", activityLogRoutes(db));
  app.route("/api", secured);

  app.onError((err, c) => {
    if (err instanceof HttpError) return c.json({ error: err.message, ...(err.code ? { code: err.code } : {}) }, err.status);
    console.error(err); // never leak internals to the client
    return c.json({ error: "Something went wrong" }, 500);
  });
  return app;
}
