import type { BudgetSettings, Expense, ISODate } from './types';
import { addDays, parseISODate, toISODate } from './time';

export const EXPENSE_CATEGORIES = ['Food', 'Transport', 'Shopping', 'Bills', 'Education', 'Health', 'Fun', 'Other'] as const;

export const DEFAULT_BUDGET: BudgetSettings = { monthly: 0, categoryLimits: {} };

export type BudgetStatus = 'unset' | 'ok' | 'warning' | 'over';

export const monthOf = (date: ISODate) => date.slice(0, 7);
export const daysInMonth = (month: string) => {
  const [y = 1970, m = 1] = month.split('-').map(Number);
  return new Date(y, m, 0).getDate();
};
export const monthStart = (month: string): ISODate => `${month}-01`;
export const shiftMonth = (month: string, by: number) => {
  const [y = 1970, m = 1] = month.split('-').map(Number);
  return toISODate(new Date(y, m - 1 + by, 1)).slice(0, 7);
};

export function formatTaka(n: number) {
  return `৳${Math.round(n).toLocaleString('en-IN')}`;
}

const sum = (list: Expense[]) => list.reduce((a, e) => a + e.amount, 0);

/**
 * Spending for a month measured against the monthly limit. For the current month it also says how much is
 * safe to spend today (what's left, spread evenly over the remaining days) and where the current pace ends up.
 */
export function budgetSummary(expenses: Expense[], budget: BudgetSettings, month: string, today: ISODate) {
  const inMonth = expenses.filter(e => monthOf(e.date) === month);
  const days = daysInMonth(month);
  const isCurrent = month === monthOf(today);
  const isPast = month < monthOf(today);
  const dayOfMonth = isCurrent ? Number(today.slice(8, 10)) : isPast ? days : 0;
  const spent = sum(inMonth);
  const todaySpent = isCurrent ? sum(inMonth.filter(e => e.date === today)) : 0;
  const daysLeft = isCurrent ? days - dayOfMonth + 1 : 0;
  const limit = budget.monthly;
  const remaining = limit - spent;
  const dailyAllowance = isCurrent && limit > 0 ? Math.max(0, limit - (spent - todaySpent)) / daysLeft : 0;
  const safeToday = dailyAllowance - todaySpent;
  const projected = isCurrent && dayOfMonth > 0 ? (spent / dayOfMonth) * days : spent;
  const status: BudgetStatus = limit <= 0 ? 'unset'
    : spent > limit ? 'over'
    : spent >= limit * 0.8 || (isCurrent && dayOfMonth >= 5 && projected > limit) ? 'warning'
    : 'ok';
  return {
    month, days, dayOfMonth, isCurrent, spent, todaySpent, daysLeft, limit, remaining,
    dailyAllowance, safeToday, projected, status,
    averagePerDay: dayOfMonth > 0 ? spent / dayOfMonth : 0,
    usedPct: limit > 0 ? (spent / limit) * 100 : 0,
    /** Even share of the limit per day — the line the daily chart is drawn against. */
    evenDaily: limit > 0 ? limit / days : 0,
  };
}

export type BudgetSummary = ReturnType<typeof budgetSummary>;

export function categoryBreakdown(expenses: Expense[], budget: BudgetSettings, month: string) {
  const totals = new Map<string, number>();
  for (const e of expenses) if (monthOf(e.date) === month) totals.set(e.category, (totals.get(e.category) ?? 0) + e.amount);
  for (const c of Object.keys(budget.categoryLimits)) if (!totals.has(c) && (budget.categoryLimits[c] ?? 0) > 0) totals.set(c, 0);
  return [...totals].map(([category, spent]) => {
    const limit = budget.categoryLimits[category] ?? 0;
    return { category, spent, limit, over: limit > 0 && spent > limit, near: limit > 0 && spent >= limit * 0.8 && spent <= limit };
  }).sort((a, b) => b.spent - a.spent);
}

export function dailySeries(expenses: Expense[], month: string) {
  const totals = new Map<string, number>();
  for (const e of expenses) if (monthOf(e.date) === month) totals.set(e.date, (totals.get(e.date) ?? 0) + e.amount);
  return Array.from({ length: daysInMonth(month) }, (_, i) => {
    const date = addDays(monthStart(month), i);
    return { date, amount: totals.get(date) ?? 0 };
  });
}

/** Spending over the same number of days at the start of the previous month, for a fair "vs last month". */
export function samePeriodLastMonth(expenses: Expense[], month: string, dayOfMonth: number) {
  const prev = shiftMonth(month, -1);
  const cutoff = Math.min(dayOfMonth, daysInMonth(prev));
  return sum(expenses.filter(e => monthOf(e.date) === prev && Number(e.date.slice(8, 10)) <= cutoff));
}

/** What adding `amount` in `category` on `date` does to the limits — used to warn right after logging. */
export function limitWarnings(before: Expense[], added: Expense, budget: BudgetSettings): string[] {
  const month = monthOf(added.date);
  const monthBefore = sum(before.filter(e => monthOf(e.date) === month));
  const catBefore = sum(before.filter(e => monthOf(e.date) === month && e.category === added.category));
  const out: string[] = [];
  const catLimit = budget.categoryLimits[added.category] ?? 0;
  if (catLimit > 0) {
    const after = catBefore + added.amount;
    if (after > catLimit && catBefore <= catLimit) out.push(`${added.category} is now ${formatTaka(after - catLimit)} over its ${formatTaka(catLimit)} limit.`);
    else if (after >= catLimit * 0.8 && catBefore < catLimit * 0.8) out.push(`You’ve used ${Math.round((after / catLimit) * 100)}% of your ${added.category} limit.`);
  }
  if (budget.monthly > 0) {
    const after = monthBefore + added.amount;
    if (after > budget.monthly && monthBefore <= budget.monthly) out.push(`This puts you ${formatTaka(after - budget.monthly)} over this month’s budget.`);
    else if (after >= budget.monthly * 0.8 && monthBefore < budget.monthly * 0.8) out.push(`You’ve used ${Math.round((after / budget.monthly) * 100)}% of this month’s budget.`);
  }
  return out;
}

export const monthLabel = (month: string) => parseISODate(monthStart(month)).toLocaleDateString([], { month: 'long', year: 'numeric' });
