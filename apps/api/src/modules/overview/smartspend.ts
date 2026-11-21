// Port of the portal's lib/smartspend.ts (rule-based advice), so the dashboard says exactly what SmartSpend says.
import type { AmountLine } from "@insights/contracts";
import { sumMoney } from "../../core/money";

export type SmartSpendInput = {
  income: number; salary: number; expenses: number; saved: number; balance: number;
  categories: { category: string; amount: number; percent: number }[];
  avgByCategory: Record<string, number>; avgIncome: number; avgExpenses: number;
  goals: { id: string; name: string; target: number; current: number; targetDate: Date | null }[];
};

const SAVINGS_RATE = 0.2; // the "20" in the 50/30/20 rule
const RISE_THRESHOLD = 1.2; // 20%+ above the usual month counts as rising
const monthsUntil = (from: Date, to: Date) => (to.getUTCFullYear() - from.getUTCFullYear()) * 12 + (to.getUTCMonth() - from.getUTCMonth());

export function buildInsights(i: SmartSpendInput, now = new Date()) {
  const typicalIncome = i.income || i.avgIncome;
  const savingsTarget = Math.round(typicalIncome * SAVINGS_RATE);
  const surplus = Math.max(0, Math.round(typicalIncome - (i.avgExpenses || i.expenses)));

  const rising = i.categories
    .map((c) => ({ ...c, usual: i.avgByCategory[c.category] ?? 0 }))
    .filter((c) => c.usual > 0 && c.amount > c.usual * RISE_THRESHOLD);

  const advice: AmountLine[] = [];
  if (!typicalIncome) advice.push(["Record your salary or other income so SmartSpend can size a budget and savings target for you."]);
  if (i.income && i.expenses > i.income) {
    advice.push(["You've spent ", { amount: sumMoney([i.expenses, -i.income]) }, " more than you earned this month. Hold off on non-essential purchases until your next income."]);
  }
  const top = i.categories[0];
  if (top && top.percent >= 30) advice.push([`${top.category} takes ${top.percent}% of your spending. Trimming it by 10% would save `, { amount: Math.round(top.amount * 0.1) }, " a month."]);
  for (const c of rising.slice(0, 2)) advice.push([`${c.category} is at `, { amount: c.amount }, " against a usual ", { amount: Math.round(c.usual) }, ". Look for spending here you can skip."]);
  if (savingsTarget && i.saved < savingsTarget) {
    advice.push(["Aim to save ", { amount: savingsTarget }, " a month (20% of income). Move ", { amount: sumMoney([savingsTarget, -i.saved]) }, " into a goal right after payday so it isn't spent."]);
  }
  if (!advice.length) advice.push(["You're living within your means and meeting your savings target. Keep it up!"]);

  const active = i.goals.filter((g) => g.current < g.target);
  const goals = active.map((g) => {
    const remaining = sumMoney([g.target, -g.current]);
    const monthsLeft = g.targetDate ? Math.max(1, monthsUntil(now, g.targetDate)) : null;
    const monthly = monthsLeft ? Math.ceil(remaining / monthsLeft) : Math.min(remaining, Math.round(surplus / active.length));
    return {
      id: g.id, name: g.name, remaining, progress: Math.round((g.current / g.target) * 100), monthly,
      monthsToGo: monthly > 0 ? Math.ceil(remaining / monthly) : null,
      deadline: g.targetDate ? g.targetDate.toISOString() : null, stretch: monthly > surplus,
    };
  });
  const emergencyFund = !i.goals.length && (i.avgExpenses || i.expenses) > 0 ? Math.round((i.avgExpenses || i.expenses) * 3) : null;

  return { savingsTarget, surplus, left: sumMoney([i.income, -i.expenses, -i.saved]), rising, advice, goals, emergencyFund };
}
