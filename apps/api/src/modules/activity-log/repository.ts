import type { AuditResponse, AuditRow } from "@insights/contracts";
import { iso, type Query } from "../../core/db";

export const AUDIT_PAGE_SIZE = 30; // same as the portal
export type AuditFilters = { event?: string; status?: "success" | "failed"; from?: string; to?: string; cursor?: string };

// Pakistan is UTC+5 with no daylight saving, so a Pakistan day starts at 19:00 UTC the day before.
export async function queryAudit(q: Query, f: AuditFilters): Promise<AuditResponse> {
  const rows = await q<AuditRow>(
    `SELECT id, ${iso('"createdAt"')} AS "createdAt", event, success, "statusCode", response, method, path
       FROM audit_logs
      WHERE "userId" = app_user_id()
        AND ($1::text IS NULL OR event = $1)
        AND ($2::text IS NULL OR success = ($2 = 'success'))
        AND ($3::date IS NULL OR "createdAt" >= $3::date::timestamp - interval '5 hours')
        AND ($4::date IS NULL OR "createdAt" < ($4::date + 1)::timestamp - interval '5 hours')
        AND ($5::text IS NULL OR ("createdAt", id) < (SELECT "createdAt", id FROM audit_logs WHERE id = $5 AND "userId" = app_user_id()))
      ORDER BY "createdAt" DESC, id DESC LIMIT $6`,
    [f.event ?? null, f.status ?? null, f.from ?? null, f.to ?? null, f.cursor ?? null, AUDIT_PAGE_SIZE + 1]);
  const page = rows.slice(0, AUDIT_PAGE_SIZE);
  return { rows: page, nextCursor: rows.length > AUDIT_PAGE_SIZE ? page[page.length - 1].id : null };
}
