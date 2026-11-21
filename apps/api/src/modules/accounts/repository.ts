import type { AccountRow } from "@insights/contracts";
import { iso, type Query } from "../../core/db";

export const listAccounts = (q: Query) =>
  q<AccountRow>(
    `SELECT id, name, type::text AS type, "openingBalance"::float8 AS "openingBalance",
            "currentBalance"::float8 AS "currentBalance", "isArchived", ${iso('"createdAt"')} AS "createdAt"
       FROM accounts WHERE "userId" = app_user_id() ORDER BY "isArchived", "createdAt"`);
