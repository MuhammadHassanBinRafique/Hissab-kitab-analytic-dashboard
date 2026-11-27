import { Hono } from "hono";
import type { Db } from "../../core/db";
import type { AppEnv } from "../../core/middleware";
import { getNotifications } from "./repository";

export function notificationsRoutes(db: Db) {
  const r = new Hono<AppEnv>();
  r.get("/", async (c) => c.json(await db.asUser(c.get("userId"), getNotifications)));
  return r;
}
