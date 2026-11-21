// The API <-> web contract. Both apps import from here, so a change is a compile error on both sides.
import { z } from "zod";

// Mirrors the portal's lib/audit-events.ts (the portal is the source of truth).
export const AUDIT_EVENTS = [
  "transaction.create", "transaction.update", "transaction.delete", "transfer.create",
  "account.create", "account.update", "account.archive", "account.unarchive", "account.delete",
  "category.create", "category.update", "category.delete",
  "saving.create", "saving.update", "saving.delete", "saving.deposit", "saving.withdraw",
  "recurring.create", "recurring.update", "recurring.delete", "recurring.process", "recurring.skip",
  "auth.sign_in", "auth.sign_out", "auth.password_change",
] as const;

export const monthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);
export const loginSchema = z.object({ email: z.string().email().max(254), password: z.string().min(1).max(200) });
export const ledgerQuerySchema = z.object({
  month: monthSchema.optional(),
  type: z.enum(["INCOME", "EXPENSE", "TRANSFER", "SAVING"]).optional(),
  accountId: z.string().min(1).max(64).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100),
  offset: z.coerce.number().int().min(0).default(0),
});
export const auditQuerySchema = z.object({
  event: z.enum(AUDIT_EVENTS).optional(),
  status: z.enum(["success", "failed"]).optional(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  cursor: z.string().min(1).max(64).optional(),
});

export type AmountLine = (string | { amount: number })[]; // text with amounts, so the UI can mask them
export interface SessionUser { id: string; email: string }
export interface Kpis { balance: number; income: number; expenses: number; saved: number; left: number }
export interface OverviewResponse {
  month: string;
  kpis: Kpis;
  previous: { income: number; expenses: number; saved: number; left: number };
  trend: { month: string; income: number; expenses: number; saved: number }[];
  categories: { name: string; amount: number; percent: number; previous: number }[];
  incomeSources: { name: string; amount: number; percent: number }[];
  smartspend: {
    savingsTarget: number; surplus: number; advice: AmountLine[];
    rising: { category: string; amount: number; usual: number }[];
    goals: { id: string; name: string; remaining: number; progress: number; monthly: number; monthsToGo: number | null; deadline: string | null; stretch: boolean }[];
    emergencyFund: number | null;
  };
}
export interface AccountRow { id: string; name: string; type: "BANK" | "MOBILE_WALLET" | "CASH" | "OTHER"; openingBalance: number; currentBalance: number; isArchived: boolean; createdAt: string }
export interface SavingGoal { id: string; name: string; targetAmount: number; currentAmount: number; targetDate: string | null; status: "ACTIVE" | "COMPLETED" | "CANCELLED" }
export interface SavingAllocation { id: string; savingId: string; savingName: string; accountName: string; amount: number; date: string; description: string }
export interface RecurringRow { id: string; type: "INCOME" | "EXPENSE" | "TRANSFER"; amount: number; description: string; frequency: "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY"; dayOfMonth: number | null; nextRunDate: string; isActive: boolean; accountName: string | null; categoryName: string | null }
export interface LedgerRow { id: string; type: "INCOME" | "EXPENSE" | "TRANSFER" | "SAVING"; amount: number; date: string; description: string; notes: string; accountId: string | null; accountName: string | null; categoryName: string | null; fromAccountName: string | null; toAccountName: string | null }
export interface LedgerResponse { rows: LedgerRow[]; total: number; summary: { income: number; expenses: number } }
export interface AuditRow { id: string; createdAt: string; event: string; success: boolean; statusCode: number; response: unknown; method: string; path: string }
export interface AuditResponse { rows: AuditRow[]; nextCursor: string | null }
