import { Hono } from "hono";
import type { Db } from "../../core/db";
import type { AppEnv } from "../../core/middleware";
import { listGoals, recentAllocations } from "./repository";

export function savingsRoutes(db: Db) {
  const r = new Hono<AppEnv>();
  r.get("/", async (c) =>
    c.json(await db.asUser(c.get("userId"), async (q) => ({ goals: await listGoals(q), recentAllocations: await recentAllocations(q) }))));
  return r;
}
