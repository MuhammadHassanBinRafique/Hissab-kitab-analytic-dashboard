import type { SavingAllocation, SavingGoal } from "@insights/contracts";
import { iso, type Query } from "../../core/db";

export const listGoals = (q: Query) =>
  q<SavingGoal>(
    `SELECT id, name, "targetAmount"::float8 AS "targetAmount", "currentAmount"::float8 AS "currentAmount",
            ${iso('"targetDate"')} AS "targetDate", status::text AS status
       FROM savings WHERE "userId" = app_user_id()
      ORDER BY (status = 'ACTIVE') DESC, "createdAt"`);

export const recentAllocations = (q: Query, limit = 20) =>
  q<SavingAllocation>(
    `SELECT st.id, st."savingId", s.name AS "savingName", a.name AS "accountName",
            st.amount::float8 AS amount, ${iso('st."date"')} AS date, COALESCE(st.description, '') AS description
       FROM saving_transactions st JOIN savings s ON s.id = st."savingId" JOIN accounts a ON a.id = st."accountId"
      WHERE s."userId" = app_user_id() ORDER BY st."date" DESC, st."createdAt" DESC LIMIT $1`, [limit]);
