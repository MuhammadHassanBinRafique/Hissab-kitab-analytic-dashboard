import { Hono } from "hono";
import type { Db } from "../../core/db";
import type { AppEnv } from "../../core/middleware";
import { listAccounts } from "./repository";

export function accountsRoutes(db: Db) {
  const r = new Hono<AppEnv>();
  r.get("/", async (c) => c.json({ accounts: await db.asUser(c.get("userId"), listAccounts) }));
  return r;
}
