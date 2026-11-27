import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import type { Db } from "../src/core/db";
import { createApp } from "../src/app";
import { RateLimiter } from "../src/core/rate-limit";
import { getNotifications } from "../src/modules/notifications/repository";
import { toNotification } from "../src/modules/notifications/format";
import { makeTestDb } from "./helpers";

const ago = (min: number) => `((now() AT TIME ZONE 'UTC') - interval '${min} minutes')`;
const log = (id: string, min: number, event: string, resp: unknown, o: { ok?: boolean; status?: number; user?: string } = {}) =>
  `INSERT INTO audit_logs (id,"createdAt","userId",event,success,"statusCode",response,method,path) VALUES ('${id}', ${ago(min)}, '${o.user ?? "user-c"}', '${event}', ${o.ok ?? true}, ${o.status ?? 200}, '${JSON.stringify(resp)}'::jsonb, 'POST', '/api/x');`;
const saved = (id: string, min: number, amount: number) =>
  `INSERT INTO saving_transactions (id,"savingId","accountId",amount,date,description,"createdAt") VALUES ('${id}','s-c','c-bank',${amount}, ${ago(min)}, '', ${ago(min)});`;
const goal = (current: number) => ({ id: "s-c", name: "New laptop", targetAmount: "120000", currentAmount: String(current), status: "ACTIVE" });

// Realistic rows: `response` is exactly what the portal stores (the body the user received; Decimal money is a string).
const SEED = `
INSERT INTO users (id,email,"updatedAt") VALUES ('user-c','c@x.com',now()), ('user-d','d@x.com',now());
INSERT INTO accounts (id,"userId",name,type,"openingBalance","currentBalance","isArchived","updatedAt") VALUES
 ('c-bank','user-c','Meezan Bank','BANK',0,0,false,now()), ('c-cash','user-c','Cash','CASH',0,0,false,now());
INSERT INTO categories (id,"userId",name,kind) VALUES ('nc-salary','user-c','Salary','INCOME'), ('nc-food','user-c','Food','EXPENSE');
INSERT INTO savings (id,"userId",name,"targetAmount","currentAmount",status,"updatedAt") VALUES ('s-c','user-c','New laptop',120000,125000,'ACTIVE',now());
${log("n01", 10, "transaction.create", { id: "t1", type: "INCOME", amount: "5000", accountId: "c-bank", categoryId: "nc-salary" })}
${log("n02", 20, "transaction.create", { id: "t2", type: "EXPENSE", amount: "1200.5", accountId: "c-bank", categoryId: "nc-food" })}
${log("n03", 30, "transfer.create", { id: "t3", type: "TRANSFER", amount: "4000", fromAccountId: "c-bank", toAccountId: "c-cash" })}
${log("n04", 40, "account.create", { id: "c-cash", name: "Cash", type: "CASH", openingBalance: "2000" })}
${log("n05", 50, "saving.deposit", goal(100000))}  ${saved("sv5", 50, 5000)}
${log("n06", 60, "saving.deposit", goal(120500))}  ${saved("sv6", 60, 20500)}
${log("n07", 70, "saving.deposit", goal(125000))}  ${saved("sv7", 70, 4500)}
${log("n08", 80, "saving.withdraw", goal(110000))} ${saved("sv8", 80, -2000)}
${log("n09", 90, "auth.password_change", { error: null })}
${log("n15", 15, "transaction.create", { id: "t9", type: "INCOME", amount: "100", accountId: "deleted-account", categoryId: "nc-salary" })}
-- must NOT appear
${log("x1", 5, "auth.sign_in", { error: null })}
${log("x2", 6, "auth.sign_out", { error: null })}
${log("x3", 7, "transaction.create", { error: "bad" }, { ok: false, status: 400 })}
${log("x4", 60 * 24 * 40, "transaction.create", { type: "INCOME", amount: "1", accountId: "c-bank" })}
${log("x5", 8, "recurring.create", { id: "r1" })}
${log("x6", 9, "account.update", { id: "c-bank", name: "Meezan" })}
${log("x7", 11, "transaction.create", [])}
${log("x8", 12, "transaction.create", { type: "TRANSFER", amount: "5" })}
${log("x9", 13, "transaction.create", { type: "INCOME", amount: "not-a-number" })}
${log("xb", 3, "transaction.create", { id: "tb", type: "INCOME", amount: "777", accountId: "b-acc" }, { user: "user-b" })}
INSERT INTO audit_logs (id,"createdAt","userId",event,success,"statusCode",response,method,path)
 SELECT 'many-'||n, ${ago(200)} - (n || ' minutes')::interval, 'user-d', 'transaction.create', true, 201, '{"type":"INCOME","amount":"10"}'::jsonb, 'POST', '/api/x' FROM generate_series(1,45) n;
`;

let db: Db; let pg: PGlite;
beforeAll(async () => { ({ db, pg } = await makeTestDb()); await pg.exec(SEED); });
afterAll(async () => { await db.close(); });
const mine = (user = "user-c") => db.asUser(user, getNotifications);
const text = (parts: (string | { amount: number })[]) => parts.map((p) => (typeof p === "string" ? p : `[${p.amount}]`)).join("");

describe("notifications", () => {
  it("lists the user's own important events, newest first, in friendly words", async () => {
    const n = (await mine()).notifications;
    expect(n.map((x) => [x.id, x.kind])).toEqual([
      ["n01", "income"], ["n15", "income"], ["n02", "expense"], ["n03", "transfer"], ["n04", "account"],
      ["n05", "goal-deposit"], ["n06", "goal-reached"], ["n07", "goal-deposit"], ["n08", "goal-withdraw"], ["n09", "password"],
    ]);
    const t = Object.fromEntries(n.map((x) => [x.id, text(x.parts)]));
    expect(t.n01).toBe("Income of [5000] added to Meezan Bank · Salary");
    expect(t.n02).toBe("Expense of [1200.5] on Food from Meezan Bank");
    expect(t.n03).toBe("Transferred [4000] from Meezan Bank to Cash");
    expect(t.n04).toBe("New account “Cash” added with [2000]");
    expect(t.n09).toBe("Your password was changed.");
  });
  it("amounts stay numbers (never text), so the web app can hide them", async () => {
    const n = (await mine()).notifications.find((x) => x.id === "n01")!;
    expect(n.parts).toContainEqual({ amount: 5000 });
    expect(JSON.stringify(n.parts.filter((p) => typeof p === "string"))).not.toMatch(/\d{3}/);
  });
  it("savings: how much moved, and 'goal reached' only on the deposit that crosses the target", async () => {
    const t = Object.fromEntries((await mine()).notifications.map((x) => [x.id, text(x.parts)]));
    expect(t.n05).toBe("[5000] added to “New laptop” · [100000] of [120000] saved");
    expect(t.n06).toBe("Goal reached! You saved [120000] for “New laptop”.");
    expect(t.n07).toBe("[4500] added to “New laptop” · [125000] of [120000] saved"); // already past the target: a normal deposit
    expect(t.n08).toBe("[2000] taken out of “New laptop” · [110000] of [120000] saved");
  });
  it("never shows sign-in/out, failed actions, old rows, unrelated events or rows it cannot describe", async () => {
    const ids = (await mine()).notifications.map((x) => x.id);
    for (const hidden of ["x1", "x2", "x3", "x4", "x5", "x6", "x7", "x8", "x9"]) expect(ids).not.toContain(hidden);
  });
  it("a deleted account does not break the message; the name is just left out", async () => {
    expect(text((await mine()).notifications.find((x) => x.id === "n15")!.parts)).toBe("Income of [100] added · Salary");
  });
  it("only the user's own rows (another user's income never appears)", async () => {
    expect((await mine()).notifications.map((x) => x.id)).not.toContain("xb");
    expect((await mine("user-b")).notifications.map((x) => x.id)).toEqual(["xb"]);
    expect((await mine("nobody")).notifications).toEqual([]);
  });
  it("returns at most 30 and a database-clock serverTime in the same format as `at`", async () => {
    const r = await mine("user-d");
    expect(r.notifications).toHaveLength(30);
    expect(r.serverTime).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    expect(r.notifications.every((x) => x.at < r.serverTime)).toBe(true);
  });
  it("toNotification skips rows with missing data instead of guessing", () => {
    expect(toNotification({ id: "a", at: "t", event: "account.create", response: {} })).toBeNull();
    expect(toNotification({ id: "a", at: "t", event: "saving.deposit", response: { name: "x" } })).toBeNull();
    expect(toNotification({ id: "a", at: "t", event: "transaction.create", response: null })).toBeNull();
  });
  it("over HTTP: needs a session, answers with the shape the web app expects, and cannot be written to", async () => {
    const config = { supabaseUrl: "http://x", supabaseAnonKey: "k".repeat(30), databaseUrl: "postgres://x", sessionSecret: "s".repeat(40), allowedOrigin: "https://site.example", secureCookies: false, port: 0 };
    const app = createApp({ db, config, limiter: new RateLimiter(), verifier: { verify: async (e) => ({ id: e === "c@x.com" ? "user-c" : "user-b", email: e }) } });
    expect((await app.request("/api/notifications")).status).toBe(401);
    const login = await app.request("/api/auth/login", { method: "POST", headers: { "content-type": "application/json", origin: "https://site.example" }, body: JSON.stringify({ email: "c@x.com", password: "x" }) });
    const cookie = login.headers.get("set-cookie")!.split(";")[0];
    const res = await app.request("/api/notifications", { headers: { cookie } });
    const body = (await res.json()) as any;
    expect(res.status).toBe(200);
    expect(Object.keys(body).sort()).toEqual(["notifications", "serverTime"]);
    expect(body.notifications[0]).toMatchObject({ id: "n01", kind: "income" });
    expect((await app.request("/api/notifications", { method: "POST", headers: { cookie, origin: "https://site.example" } })).status).toBe(405);
  });
});
