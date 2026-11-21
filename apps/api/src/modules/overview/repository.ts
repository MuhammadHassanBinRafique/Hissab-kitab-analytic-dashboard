import type { Query } from "../../core/db";

export type MonthRow = { ym: string; type: "INCOME" | "EXPENSE"; category: string; amount: number };

// Totals are computed by the database: one grouped query instead of shipping every transaction.
export const monthlyByCategory = (q: Query, from: string, to: string) =>
  q<MonthRow>(
    `SELECT to_char(t."date", 'YYYY-MM') AS ym, t.type::text AS type,
            COALESCE(c.name, 'Uncategorized') AS category, SUM(t.amount)::float8 AS amount
       FROM transactions t LEFT JOIN categories c ON c.id = t."categoryId"
      WHERE t."userId" = app_user_id() AND t.type IN ('INCOME', 'EXPENSE')
        AND t."date" >= $1::timestamp AND t."date" < $2::timestamp
      GROUP BY 1, 2, 3`, [from, to]);

export const savedByMonth = (q: Query, from: string, to: string) =>
  q<{ ym: string; amount: number }>(
    `SELECT to_char(st."date", 'YYYY-MM') AS ym, SUM(st.amount)::float8 AS amount
       FROM saving_transactions st JOIN savings s ON s.id = st."savingId"
      WHERE s."userId" = app_user_id() AND st."date" >= $1::timestamp AND st."date" < $2::timestamp
      GROUP BY 1`, [from, to]);

export const activeBalance = async (q: Query) =>
  (await q<{ total: number }>(
    `SELECT COALESCE(SUM("currentBalance"), 0)::float8 AS total FROM accounts WHERE "userId" = app_user_id() AND NOT "isArchived"`))[0].total;

export const activeGoals = (q: Query) =>
  q<{ id: string; name: string; target: number; current: number; targetDate: string | null }>(
    `SELECT id, name, "targetAmount"::float8 AS target, "currentAmount"::float8 AS current,
            to_char("targetDate", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "targetDate"
       FROM savings WHERE "userId" = app_user_id() AND status = 'ACTIVE' ORDER BY "createdAt"`);
