import { Hono } from "hono";
import { z } from "zod";
import { monthSchema } from "@insights/contracts";
import type { Db } from "../../core/db";
import type { AppEnv } from "../../core/middleware";
import { parse } from "../../core/errors";
import { currentMonthPK } from "../../core/dates";
import { buildOverview } from "./service";

export function overviewRoutes(db: Db) {
  const r = new Hono<AppEnv>();
  r.get("/", async (c) => {
    const { month } = parse(z.object({ month: monthSchema.optional() }), c.req.query());
    return c.json(await db.asUser(c.get("userId"), (q) => buildOverview(q, month ?? currentMonthPK())));
  });
  return r;
}
