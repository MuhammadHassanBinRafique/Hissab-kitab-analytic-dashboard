import type { RecurringRow } from "@insights/contracts";
import { iso, type Query } from "../../core/db";

export const listRecurring = (q: Query) =>
  q<RecurringRow>(
    `SELECT r.id, r.type::text AS type, r.amount::float8 AS amount, COALESCE(r.description, '') AS description,
            r.frequency::text AS frequency, r."dayOfMonth", ${iso('r."nextRunDate"')} AS "nextRunDate", r."isActive",
            a.name AS "accountName", c.name AS "categoryName"
       FROM recurring_transactions r LEFT JOIN accounts a ON a.id = r."accountId" LEFT JOIN categories c ON c.id = r."categoryId"
      WHERE r."userId" = app_user_id() ORDER BY r."isActive" DESC, r."nextRunDate"`);
