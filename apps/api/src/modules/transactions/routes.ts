import { Hono } from "hono";
import { ledgerQuerySchema } from "@insights/contracts";
import type { Db } from "../../core/db";
import type { AppEnv } from "../../core/middleware";
import { parse } from "../../core/errors";
import { currentMonthPK, monthStart } from "../../core/dates";
import { queryLedger } from "./repository";

export function transactionsRoutes(db: Db) {
  const r = new Hono<AppEnv>();
  r.get("/", async (c) => {
    const f = parse(ledgerQuerySchema, c.req.query());
    return c.json(await db.asUser(c.get("userId"), (q) =>
      queryLedger(q, { type: f.type, accountId: f.accountId, monthStart: monthStart(f.month ?? currentMonthPK()), limit: f.limit, offset: f.offset })));
  });
  return r;
}
