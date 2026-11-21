import { Hono } from "hono";
import { auditQuerySchema } from "@insights/contracts";
import type { Db } from "../../core/db";
import type { AppEnv } from "../../core/middleware";
import { parse } from "../../core/errors";
import { queryAudit } from "./repository";

export function activityLogRoutes(db: Db) {
  const r = new Hono<AppEnv>();
  r.get("/", async (c) => c.json(await db.asUser(c.get("userId"), (q) => queryAudit(q, parse(auditQuerySchema, c.req.query())))));
  return r;
}
