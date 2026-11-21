// A real Postgres (PGlite) with the portal's schema + RLS and our analytics_ro role/policies.
// Test helper only; production uses createDb() (src/core/db.ts).
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import type { Db } from "../src/core/db";

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");

export async function createPgliteDb(seedSql: string) {
  const pg = new PGlite();
  await pg.exec(read("./fixtures/portal-schema.sql"));
  await pg.exec(read("../../../db/analytics_ro.sql"));
  await pg.exec(seedSql);
  // Same behaviour as createDb(): a READ ONLY transaction, as analytics_ro, with app.user_id set.
  const db: Db = {
    asUser: (userId, fn) =>
      pg.transaction(async (tx) => {
        await tx.exec("SET LOCAL ROLE analytics_ro; SET TRANSACTION READ ONLY");
        await tx.query("SELECT set_config('app.user_id', $1, true)", [userId]);
        return fn(async (text, params = []) => (await tx.query(text, params as any[])).rows as any);
      }),
    close: async () => { await pg.close(); },
  };
  return { pg, db };
}
