import { Hono } from "hono";
import type { Db } from "../../core/db";
import type { AppEnv } from "../../core/middleware";
import { listRecurring } from "./repository";

export function recurringRoutes(db: Db) {
  const r = new Hono<AppEnv>();
  r.get("/", async (c) => c.json({ recurring: await db.asUser(c.get("userId"), listRecurring) }));
  return r;
}
