import type { NotificationRow, NotificationsResponse } from "@insights/contracts";
import { iso, type Query } from "../../core/db";
import { toNotification } from "./format";

// What the user asked to be told about. Sign-in/out and everything else stay in the Activity Log only.
// (A constant list from this file, never user input, so it is safe to put in the SQL text.)
const EVENTS = ["transaction.create", "transfer.create", "account.create", "saving.deposit", "saving.withdraw", "auth.password_change"];
const IN_LIST = EVENTS.map((e) => `'${e}'`).join(", ");
export const NOTIFICATION_DAYS = 30;
export const NOTIFICATION_LIMIT = 30;

export async function getNotifications(q: Query): Promise<NotificationsResponse> {
  // Read only the user's own successful actions. Names are looked up from the ids in the stored response, and the
  // amount of a goal deposit comes from the savings row written in the same moment (the response only has the new total).
  const [rows, [clock]] = await Promise.all([
    q(
      `SELECT al.id, ${iso('al."createdAt"')} AS at, al.event, al.response,
              acc.name AS "accountName", cat.name AS "categoryName", fa.name AS "fromName", ta.name AS "toName",
              st.amount::float8 AS "savedAmount"
         FROM audit_logs al
         LEFT JOIN accounts   acc ON acc.id = al.response->>'accountId'
         LEFT JOIN categories cat ON cat.id = al.response->>'categoryId'
         LEFT JOIN accounts   fa  ON fa.id  = al.response->>'fromAccountId'
         LEFT JOIN accounts   ta  ON ta.id  = al.response->>'toAccountId'
         LEFT JOIN LATERAL (
              SELECT x.amount FROM saving_transactions x
               WHERE al.event IN ('saving.deposit', 'saving.withdraw') AND x."savingId" = al.response->>'id'
                 AND abs(extract(epoch FROM (x."createdAt" - al."createdAt"))) < 60
               ORDER BY abs(extract(epoch FROM (x."createdAt" - al."createdAt"))) LIMIT 1) st ON true
        WHERE al."userId" = app_user_id() AND al.success AND al.event IN (${IN_LIST})
          AND al."createdAt" >= (now() AT TIME ZONE 'UTC') - interval '${NOTIFICATION_DAYS} days'
        ORDER BY al."createdAt" DESC, al.id DESC LIMIT ${NOTIFICATION_LIMIT}`),
    q<{ now: string }>(`SELECT ${iso("(now() AT TIME ZONE 'UTC')")} AS now`),
  ]);
  return {
    notifications: rows.map(toNotification).filter((n): n is NotificationRow => n !== null),
    serverTime: clock.now,
  };
}
