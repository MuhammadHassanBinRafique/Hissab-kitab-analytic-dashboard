import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import type { Db } from "../src/core/db";
import { makeTestDb } from "./helpers";
import { buildOverview } from "../src/modules/overview/service";
import { listAccounts } from "../src/modules/accounts/repository";
import { listGoals, recentAllocations } from "../src/modules/savings/repository";
import { listRecurring } from "../src/modules/recurring/repository";
import { queryLedger } from "../src/modules/transactions/repository";
import { queryAudit } from "../src/modules/activity-log/repository";

let pg: PGlite; let db: Db;
beforeAll(async () => { ({ pg, db } = await makeTestDb()); });
afterAll(async () => { await db.close(); });

describe("security: the database itself enforces who sees what", () => {
  it("each user sees only their own accounts", async () => {
    expect((await db.asUser("user-a", listAccounts)).map((a) => a.name).sort()).toEqual(["Cash", "Meezan Bank", "Old wallet"]);
    expect((await db.asUser("user-b", listAccounts)).map((a) => a.name)).toEqual(["B Bank"]);
  });
  it("fails closed when no user is set", async () => {
    expect(await db.asUser("", listAccounts)).toEqual([]);
    expect((await db.asUser("", (q) => q("SELECT * FROM transactions"))).length).toBe(0);
  });
  it("cannot write anything (insert, update, delete)", async () => {
    const attempts = [
      `INSERT INTO accounts (id,"userId",name,"updatedAt") VALUES ('x','user-a','x',now())`,
      `UPDATE accounts SET name = 'hacked'`,
      `DELETE FROM transactions`,
      `UPDATE audit_logs SET success = false`,
    ];
    for (const sql of attempts) await expect(db.asUser("user-a", (q) => q(sql))).rejects.toThrow();
    const [{ n }] = await pg.query<{ n: number }>(`SELECT count(*)::int AS n FROM transactions`).then((r) => r.rows);
    expect(n).toBe(9); // portal data untouched
  });
  it("cannot read tables it was not granted (users, quotes)", async () => {
    await expect(db.asUser("user-a", (q) => q("SELECT email FROM users"))).rejects.toThrow(/permission denied/);
    await expect(db.asUser("user-a", (q) => q("SELECT * FROM quotes"))).rejects.toThrow(/permission denied/);
  });
  it("every granted table has a row policy", async () => {
    const granted = (await pg.query<{ t: string }>(`SELECT table_name AS t FROM information_schema.role_table_grants WHERE grantee = 'analytics_ro' AND privilege_type = 'SELECT'`)).rows.map((r) => r.t);
    const policies = (await pg.query<{ t: string }>(`SELECT tablename AS t FROM pg_policies WHERE roles = '{analytics_ro}'`)).rows.map((r) => r.t);
    expect(granted.length).toBe(7);
    expect(policies.sort()).toEqual([...granted].sort());
  });
});

describe("overview matches the portal's own numbers (November 2026)", () => {
  it("KPIs: transfers are excluded, savings are net of withdrawals, archived accounts are not in the balance", async () => {
    const o = await db.asUser("user-a", (q) => buildOverview(q, "2026-11"));
    expect(o.kpis).toEqual({ balance: 70200, income: 60000.1, expenses: 5700.2, saved: 4000, left: 50299.9 });
    expect(o.previous).toEqual({ income: 60000.1, expenses: 3000, saved: 5000, left: 52000.1 });
  });
  it("six-month trend, oldest first", async () => {
    const o = await db.asUser("user-a", (q) => buildOverview(q, "2026-11"));
    expect(o.trend.map((t) => t.month)).toEqual(["2026-06", "2026-07", "2026-08", "2026-09", "2026-10", "2026-11"]);
    expect(o.trend[2].income).toBe(1000.05);
    expect(o.trend[3].expenses).toBe(1000);
  });
  it("categories with percent and last month's amount; income sources", async () => {
    const o = await db.asUser("user-a", (q) => buildOverview(q, "2026-11"));
    expect(o.categories).toEqual([
      { name: "Bills", amount: 4500, percent: 78.9, previous: 0 },
      { name: "Food", amount: 1200.2, percent: 21.1, previous: 3000 },
    ]);
    expect(o.incomeSources).toEqual([{ name: "Salary", amount: 60000.1, percent: 100 }]);
  });
  it("SmartSpend advice and goal suggestion come from the portal's rules", async () => {
    const o = await db.asUser("user-a", (q) => buildOverview(q, "2026-11"));
    expect(o.smartspend.savingsTarget).toBe(12000); // 20% of income
    expect(JSON.stringify(o.smartspend.advice)).toContain("Aim to save");
    expect(o.smartspend.goals[0]).toMatchObject({ name: "Emergency fund", remaining: 95000 });
  });
  it("another user's overview contains only their data", async () => {
    const o = await db.asUser("user-b", (q) => buildOverview(q, "2026-11"));
    expect(o.kpis).toMatchObject({ balance: 777, income: 777, expenses: 0, saved: 0 });
    expect(o.categories).toEqual([{ name: "x", amount: 0, percent: 0, previous: 0 }].slice(1));
  });
  it("an empty month does not break", async () => {
    const o = await db.asUser("user-a", (q) => buildOverview(q, "2030-01"));
    expect(o.kpis).toMatchObject({ income: 0, expenses: 0, saved: 0, balance: 70200 });
  });
});

describe("ledger, accounts, savings, recurring", () => {
  const base = { monthStart: "2026-11-01", limit: 100, offset: 0 };
  it("merges savings into the ledger and totals the whole filtered set", async () => {
    const l = await db.asUser("user-a", (q) => queryLedger(q, base));
    expect(l.total).toBe(6);
    expect(l.summary).toEqual({ income: 60000.1, expenses: 5700.2 });
    expect(l.rows.map((r) => r.type).sort()).toEqual(["EXPENSE", "EXPENSE", "INCOME", "SAVING", "SAVING", "TRANSFER"]);
  });
  it("filters by type and account; totals ignore paging", async () => {
    const s = await db.asUser("user-a", (q) => queryLedger(q, { ...base, type: "SAVING" }));
    expect(s.rows.map((r) => r.amount).sort((a, b) => a - b)).toEqual([-1000, 5000]);
    const c = await db.asUser("user-a", (q) => queryLedger(q, { ...base, accountId: "a-cash" }));
    expect(c.rows).toHaveLength(1);
    expect(c.rows[0]).toMatchObject({ type: "TRANSFER", fromAccountName: "Meezan Bank", toAccountName: "Cash" });
    const p = await db.asUser("user-a", (q) => queryLedger(q, { ...base, limit: 2 }));
    expect(p.rows).toHaveLength(2);
    expect(p.total).toBe(6);
  });
  it("dates are ISO strings", async () => {
    const l = await db.asUser("user-a", (q) => queryLedger(q, { ...base, type: "INCOME" }));
    expect(l.rows[0].date).toBe("2026-11-01T00:00:00.000Z");
  });
  it("accounts use the stored current balance; archived are flagged", async () => {
    const a = await db.asUser("user-a", listAccounts);
    expect(a.find((x) => x.name === "Meezan Bank")).toMatchObject({ type: "BANK", currentBalance: 61700, isArchived: false });
    expect(a.at(-1)).toMatchObject({ name: "Old wallet", isArchived: true });
  });
  it("savings goals and allocations; recurring rules", async () => {
    expect((await db.asUser("user-a", listGoals)).map((g) => [g.name, g.status])).toEqual([["Emergency fund", "ACTIVE"], ["Old goal", "COMPLETED"]]);
    expect(await db.asUser("user-a", (q) => recentAllocations(q))).toHaveLength(3);
    expect(await db.asUser("user-a", listRecurring)).toEqual([expect.objectContaining({ description: "Electricity", frequency: "MONTHLY", accountName: "Meezan Bank", categoryName: "Bills", nextRunDate: "2026-12-05T00:00:00.000Z" })]);
    expect(await db.asUser("user-b", listRecurring)).toEqual([]);
  });
});

describe("activity log", () => {
  it("pages by cursor (30 per page, newest first) and covers every row exactly once", async () => {
    const p1 = await db.asUser("user-a", (q) => queryAudit(q, {}));
    expect(p1.rows).toHaveLength(30);
    expect(p1.rows[0].id).toBe("log-fail");
    expect(p1.nextCursor).not.toBeNull();
    const p2 = await db.asUser("user-a", (q) => queryAudit(q, { cursor: p1.nextCursor! }));
    expect(p2.rows).toHaveLength(6);
    expect(p2.nextCursor).toBeNull();
    expect(new Set([...p1.rows, ...p2.rows].map((r) => r.id)).size).toBe(36);
  });
  it("filters by status, event and Pakistan-time date", async () => {
    expect((await db.asUser("user-a", (q) => queryAudit(q, { status: "failed" }))).rows.map((r) => r.id)).toEqual(["log-fail"]);
    expect((await db.asUser("user-a", (q) => queryAudit(q, { event: "transaction.create" }))).rows).toHaveLength(1);
    // 2026-11-12 10:00 UTC = 15:00 Pakistan on the 12th; 2026-11-10 00:xx UTC = 05:xx on the 10th
    expect((await db.asUser("user-a", (q) => queryAudit(q, { from: "2026-11-12", to: "2026-11-12" }))).rows.map((r) => r.id)).toEqual(["log-fail"]);
    expect((await db.asUser("user-a", (q) => queryAudit(q, { from: "2026-11-13" }))).rows).toEqual([]);
  });
  it("a cursor from another user's log returns nothing", async () => {
    expect((await db.asUser("user-b", (q) => queryAudit(q, { cursor: "log-005" }))).rows).toEqual([]);
    expect((await db.asUser("user-b", (q) => queryAudit(q, {}))).rows.map((r) => r.id)).toEqual(["log-b"]);
  });
});
