import type { LedgerResponse, LedgerRow } from "@insights/contracts";
import { iso, type Query } from "../../core/db";

// The portal's "unified ledger": regular transactions plus savings deposits/withdrawals (SAVING rows).
const LEDGER = `
WITH ledger AS (
  SELECT t.id, t.type::text AS type, t.amount::float8 AS amount, t."date" AS d, t."createdAt" AS c,
         COALESCE(t.description, '') AS description, COALESCE(t.notes, '') AS notes,
         t."accountId", a.name AS "accountName", cat.name AS "categoryName",
         t."fromAccountId", fa.name AS "fromAccountName", t."toAccountId", ta.name AS "toAccountName"
    FROM transactions t
    LEFT JOIN accounts a ON a.id = t."accountId" LEFT JOIN categories cat ON cat.id = t."categoryId"
    LEFT JOIN accounts fa ON fa.id = t."fromAccountId" LEFT JOIN accounts ta ON ta.id = t."toAccountId"
   WHERE t."userId" = app_user_id()
  UNION ALL
  SELECT st.id, 'SAVING', st.amount::float8, st."date", st."createdAt",
         COALESCE(st.description, ''), '', st."accountId", a.name, s.name, NULL::text, NULL::text, NULL::text, NULL::text
    FROM saving_transactions st JOIN savings s ON s.id = st."savingId" JOIN accounts a ON a.id = st."accountId"
   WHERE s."userId" = app_user_id()
)`;
const FILTER = `WHERE ($1::text IS NULL OR type = $1)
   AND ($2::text IS NULL OR "accountId" = $2 OR "fromAccountId" = $2 OR "toAccountId" = $2)
   AND ($3::timestamp IS NULL OR (d >= $3::timestamp AND d < $3::timestamp + interval '1 month'))`;

export type LedgerFilters = { type?: string; accountId?: string; monthStart: string; limit: number; offset: number };

export async function queryLedger(q: Query, f: LedgerFilters): Promise<LedgerResponse> {
  const base = [f.type ?? null, f.accountId ?? null, f.monthStart];
  const rowsQuery = q<LedgerRow>(
    `${LEDGER} SELECT id, type, amount, ${iso("d")} AS date, description, notes, "accountId", "accountName",
            "categoryName", "fromAccountName", "toAccountName"
       FROM ledger ${FILTER} ORDER BY d DESC, c DESC, id LIMIT $4 OFFSET $5`, [...base, f.limit, f.offset]);
  // Totals cover the WHOLE filtered set, so they stay correct beyond one page (the portal caps lists at 200 rows).
  const summaryQuery = q<{ total: number; income: number; expenses: number }>(
    `${LEDGER} SELECT COUNT(*)::int AS total,
            COALESCE(SUM(amount) FILTER (WHERE type = 'INCOME'), 0)::float8 AS income,
            COALESCE(SUM(amount) FILTER (WHERE type = 'EXPENSE'), 0)::float8 AS expenses
       FROM ledger ${FILTER}`, base);
  const [rows, [s]] = await Promise.all([rowsQuery, summaryQuery]); // one round trip instead of two
  return { rows, total: s.total, summary: { income: s.income, expenses: s.expenses } };
}
