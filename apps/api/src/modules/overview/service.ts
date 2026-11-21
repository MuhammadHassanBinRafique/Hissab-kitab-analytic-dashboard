import type { OverviewResponse } from "@insights/contracts";
import type { Query } from "../../core/db";
import { addMonths, monthStart } from "../../core/dates";
import { sumMoney } from "../../core/money";
import { activeBalance, activeGoals, monthlyByCategory, savedByMonth, type MonthRow } from "./repository";
import { buildInsights } from "./smartspend";

const HISTORY_MONTHS = 3; // "usual" spending = average of the previous 3 months (same as the portal)

function breakdown(rows: MonthRow[]) {
  const by = new Map<string, number>();
  let total = 0;
  for (const r of rows) { by.set(r.category, sumMoney([by.get(r.category) ?? 0, r.amount])); total = sumMoney([total, r.amount]); }
  return [...by.entries()]
    .map(([category, amount]) => ({ category, amount, percent: total > 0 ? Math.round((amount / total) * 1000) / 10 : 0 }))
    .sort((a, b) => b.amount - a.amount);
}

export async function buildOverview(q: Query, month: string): Promise<OverviewResponse> {
  const months = Array.from({ length: 6 }, (_, i) => addMonths(month, i - 5)); // oldest first
  const from = monthStart(months[0]);
  const to = monthStart(addMonths(month, 1));

  // Independent queries are sent together: the database round trip is the slow part, not the SQL.
  const [rows, saved, balance, goals] = await Promise.all([
    monthlyByCategory(q, from, to), savedByMonth(q, from, to), activeBalance(q), activeGoals(q),
  ]);

  const sum = (ym: string, type: MonthRow["type"]) => sumMoney(rows.filter((r) => r.ym === ym && r.type === type).map((r) => r.amount));
  const trend = months.map((m) => ({
    month: m, income: sum(m, "INCOME"), expenses: sum(m, "EXPENSE"),
    saved: sumMoney(saved.filter((s) => s.ym === m).map((s) => s.amount)),
  }));
  const cur = trend[5];
  const prev = trend[4];

  const monthRows = (ym: string, type: MonthRow["type"]) => rows.filter((r) => r.ym === ym && r.type === type);
  const expenseNow = breakdown(monthRows(month, "EXPENSE"));
  const expensePrev = new Map(breakdown(monthRows(months[4], "EXPENSE")).map((c) => [c.category, c.amount]));
  const incomeNow = breakdown(monthRows(month, "INCOME"));

  // SmartSpend inputs, built the way the portal's SmartSpend page builds them.
  const history = months.slice(5 - HISTORY_MONTHS, 5);
  const earlier = rows.filter((r) => history.includes(r.ym));
  const pastMonths = new Set(earlier.map((r) => r.ym)).size || 1;
  const avgByCategory: Record<string, number> = {};
  for (const r of earlier) if (r.type === "EXPENSE") avgByCategory[r.category] = (avgByCategory[r.category] ?? 0) + r.amount / pastMonths;
  const earlierTotal = (type: MonthRow["type"]) => sumMoney(earlier.filter((r) => r.type === type).map((r) => r.amount));

  const insights = buildInsights({
    income: cur.income, expenses: cur.expenses, saved: cur.saved, balance,
    salary: sumMoney(monthRows(month, "INCOME").filter((r) => /salary/i.test(r.category)).map((r) => r.amount)),
    categories: expenseNow, avgByCategory,
    avgIncome: earlierTotal("INCOME") / pastMonths, avgExpenses: earlierTotal("EXPENSE") / pastMonths,
    goals: goals.map((g) => ({ id: g.id, name: g.name, target: g.target, current: g.current, targetDate: g.targetDate ? new Date(g.targetDate) : null })),
  });

  return {
    month,
    kpis: { balance, income: cur.income, expenses: cur.expenses, saved: cur.saved, left: insights.left },
    previous: { income: prev.income, expenses: prev.expenses, saved: prev.saved, left: sumMoney([prev.income, -prev.expenses, -prev.saved]) },
    trend,
    categories: expenseNow.map((c) => ({ name: c.category, amount: c.amount, percent: c.percent, previous: expensePrev.get(c.category) ?? 0 })),
    incomeSources: incomeNow.map((c) => ({ name: c.category, amount: c.amount, percent: c.percent })),
    smartspend: {
      savingsTarget: insights.savingsTarget, surplus: insights.surplus, advice: insights.advice,
      rising: insights.rising.map((r) => ({ category: r.category, amount: r.amount, usual: r.usual })),
      goals: insights.goals, emergencyFund: insights.emergencyFund,
    },
  };
}
