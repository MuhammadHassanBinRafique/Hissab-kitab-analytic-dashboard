// Turns one audit row into a friendly notification. Pure, so it is easy to test.
// Amounts stay numbers (never baked into text) so the web app can hide them like everywhere else.
import type { AmountLine, NotificationRow, NotificationKind } from "@insights/contracts";
import type { Row } from "../../core/db";

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v); // the portal stores money as Decimal, which JSON turns into a string like "5000"
  return Number.isFinite(n) ? n : null;
};
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
const make = (r: Row, kind: NotificationKind, parts: AmountLine): NotificationRow => ({ id: r.id, at: r.at, kind, parts });
const tail = (prefix: string, v: string | null): string[] => (v ? [`${prefix}${v}`] : []);

/** Returns null for a row that cannot be described properly: better no notification than a half-empty one. */
export function toNotification(r: Row): NotificationRow | null {
  if (r.event === "auth.password_change") return make(r, "password", ["Your password was changed."]);
  const resp = r.response && typeof r.response === "object" && !Array.isArray(r.response) ? (r.response as Record<string, unknown>) : null;
  if (!resp) return null;
  const amount = num(resp.amount);

  switch (r.event) {
    case "transaction.create":
      if (amount === null) return null;
      if (resp.type === "INCOME") return make(r, "income", ["Income of ", { amount }, " added", ...tail(" to ", r.accountName), ...tail(" · ", r.categoryName)]);
      if (resp.type === "EXPENSE") return make(r, "expense", ["Expense of ", { amount }, ...tail(" on ", r.categoryName), ...tail(" from ", r.accountName)]);
      return null;
    case "transfer.create":
      if (amount === null) return null;
      return make(r, "transfer", ["Transferred ", { amount }, ...(r.fromName && r.toName ? [` from ${r.fromName} to ${r.toName}`] : [])]);
    case "account.create": {
      const name = str(resp.name);
      if (!name) return null;
      const opening = num(resp.openingBalance);
      return make(r, "account", [`New account “${name}” added`, ...(opening && opening > 0 ? [" with ", { amount: opening }] : [])]);
    }
    case "saving.deposit":
    case "saving.withdraw": {
      const name = str(resp.name), target = num(resp.targetAmount), current = num(resp.currentAmount);
      if (!name || target === null || current === null) return null;
      // The goal in the response is AFTER the change; the amount moved comes from the matching savings row (signed).
      const moved = num(r.savedAmount);
      const total: AmountLine = [`“${name}” · `, { amount: current }, " of ", { amount: target }, " saved"];
      if (r.event === "saving.deposit") {
        // "Reached" only on the deposit that crosses the target, not on every deposit after it.
        if (current >= target && (moved === null || current - moved < target)) {
          return make(r, "goal-reached", ["Goal reached! You saved ", { amount: target }, ` for “${name}”.`]);
        }
        return make(r, "goal-deposit", [...(moved !== null ? [{ amount: Math.abs(moved) }, " added to "] : ["Money added to "]), ...total]);
      }
      return make(r, "goal-withdraw", [...(moved !== null ? [{ amount: Math.abs(moved) }, " taken out of "] : ["Money taken out of "]), ...total]);
    }
  }
  return null;
}
