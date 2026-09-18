/**
 * Budget engine (Architecture §8). Pure — no storage, no UI. Everything a budget
 * shows is derived here from the planned amounts (templates + per-month lines),
 * the ledger (via the existing aggregation), and Settings. Nothing derived is
 * stored, and "actual" is ALWAYS the transaction aggregation, so the budget can
 * never disagree with the ledger.
 *
 *   planned is intent; actual is the transactions.
 */
import type {
  BudgetPeriodLine,
  BudgetTemplate,
  BudgetMethod,
  Category,
  IncomeSource,
  Minor,
  NeedsWantsSavings,
  PeriodKey,
  Settings,
  Transaction,
} from "@/domain/types";
import { sumTransactions } from "@/domain/aggregation";
import { monthRange, type MonthKey } from "@/lib/period";
import { addMinor, subMinor } from "@/lib/money";

/** The inputs every budget computation needs. */
export interface BudgetInput {
  categories: Category[]; // the categories to consider (caller filters archived)
  templates: BudgetTemplate[];
  lines: BudgetPeriodLine[];
  transactions: Transaction[];
  incomeSources: IncomeSource[];
  settings: Pick<Settings, "budgetMethod" | "periodStartMonth" | "periodStartYear">;
}

export interface BudgetLine {
  categoryId: string;
  categoryName: string;
  needsWantsSavings: NeedsWantsSavings;
  planned: Minor; // effective planned for this month (override ?? template ?? 0)
  carryIn: Minor; // rolled in from the prior month (0 under zero-based / at start month)
  available: Minor; // planned + carryIn
  actual: Minor; // spent — from the ledger
  remaining: Minor; // available − actual (may be negative)
}

export interface BudgetPeriod {
  periodKey: PeriodKey;
  method: BudgetMethod;
  lines: BudgetLine[]; // one per spend category (bucket !== income)
  totalPlanned: Minor;
  totalActual: Minor;
  totalRemaining: Minor;
  expectedIncome: Minor;
  leftToAssign: Minor; // meaningful under zero-based
}

export interface FiftyThirtyTwenty {
  income: Minor; // actual income for the month
  needs: Minor;
  wants: Minor;
  savings: Minor;
  unclassified: Minor; // spend in categories tagged "none"
  target: { needs: number; wants: number; savings: number }; // 50 / 30 / 20 (percent)
}

const MAX_WALK = 400; // safety bound for the carry-over walk

// --- period key helpers ---------------------------------------------------

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}
function parsePeriod(periodKey: PeriodKey): MonthKey {
  const [year, month] = periodKey.split("-").map(Number);
  return { year, month };
}
function periodKeyOf({ year, month }: MonthKey): PeriodKey {
  return `${year}-${pad2(month)}`;
}
function nextMonth({ year, month }: MonthKey): MonthKey {
  return month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 };
}
/** a <= b comparison for month keys. */
function monthLte(a: MonthKey, b: MonthKey): boolean {
  return a.year < b.year || (a.year === b.year && a.month <= b.month);
}

// --- §8.1 effective planned ----------------------------------------------

/** The planned amount for (category, month): line override ?? template ?? 0. */
export function effectivePlanned(
  templates: BudgetTemplate[],
  lines: BudgetPeriodLine[],
  categoryId: string,
  periodKey: PeriodKey,
): Minor {
  const line = lines.find((l) => l.periodKey === periodKey && l.categoryId === categoryId);
  if (line) return line.plannedAmount;
  const template = templates.find((t) => t.categoryId === categoryId);
  if (template) return template.plannedAmount;
  return 0;
}

// --- §8.2 actual (reuse the ledger aggregation) ---------------------------

function actualFor(transactions: Transaction[], category: Category, periodKey: PeriodKey): Minor {
  const range = monthRange(parsePeriod(periodKey));
  const type = category.bucket === "income" ? "income" : "expense";
  // sumTransactions excludes transfers and uncleared by default — so budget
  // "spent" equals the ledger's money-out for the category that month.
  return sumTransactions(transactions, { type, categoryId: category.id, range });
}

// --- §8.4 carry-over walk (the load-bearing rule) -------------------------

interface Walked {
  planned: Minor;
  carryIn: Minor;
  available: Minor;
  actual: Minor;
  remaining: Minor;
}

/**
 * available/remaining for one category at `periodKey`.
 *  - zeroBased: available = planned; no carry.
 *  - carryOver: walk months forward from the budget year's start month (the most
 *    recent occurrence of Settings.periodStartMonth on/before the target), where
 *    the start month has NO carry-in and each later month adds the prior month's
 *    remaining (a deficit — negative remaining — carries forward too, FD-3.3).
 */
function walkCategory(input: BudgetInput, category: Category, periodKey: PeriodKey): Walked {
  const { templates, lines, transactions, settings } = input;
  const target = parsePeriod(periodKey);
  const planned = effectivePlanned(templates, lines, category.id, periodKey);
  const actual = actualFor(transactions, category, periodKey);

  if (settings.budgetMethod !== "carryOver") {
    return { planned, carryIn: 0, available: planned, actual, remaining: subMinor(planned, actual) };
  }

  // Reset month = the annual budget-year start (Settings.periodStartMonth).
  const resetYear = target.month >= settings.periodStartMonth ? target.year : target.year - 1;
  let cursor: MonthKey = { year: resetYear, month: settings.periodStartMonth };
  let carryIn = 0;
  for (let i = 0; i < MAX_WALK; i++) {
    const key = periodKeyOf(cursor);
    const p = effectivePlanned(templates, lines, category.id, key);
    const available = addMinor(p, carryIn); // at the reset month carryIn = 0
    const a = actualFor(transactions, category, key);
    const remaining = subMinor(available, a);
    if (cursor.year === target.year && cursor.month === target.month) {
      return { planned: p, carryIn, available, actual: a, remaining };
    }
    carryIn = remaining; // roll forward (may be negative)
    cursor = nextMonth(cursor);
    if (!monthLte(cursor, target)) break; // safety: never past the target
  }
  // Fallback (should not happen): no carry.
  return { planned, carryIn: 0, available: planned, actual, remaining: subMinor(planned, actual) };
}

// --- §8.5 expected income + left to assign --------------------------------

/** Expected income for a month: planned income lines, else IncomeSource defaults (FD-3.2). */
export function expectedIncome(input: BudgetInput, periodKey: PeriodKey): Minor {
  const incomeCats = input.categories.filter((c) => c.bucket === "income");
  let planned = 0;
  for (const c of incomeCats) planned = addMinor(planned, effectivePlanned(input.templates, input.lines, c.id, periodKey));
  if (planned > 0) return planned;
  let fallback = 0;
  for (const s of input.incomeSources) {
    if (!s.archived && s.defaultAmount != null) fallback = addMinor(fallback, s.defaultAmount);
  }
  return fallback;
}

/** Zero-based: expected income − Σ planned across spend/savings/debt categories (FD-3.4). */
export function leftToAssign(input: BudgetInput, periodKey: PeriodKey): Minor {
  const spendCats = input.categories.filter((c) => c.bucket !== "income");
  let allocated = 0;
  for (const c of spendCats) allocated = addMinor(allocated, effectivePlanned(input.templates, input.lines, c.id, periodKey));
  return subMinor(expectedIncome(input, periodKey), allocated);
}

// --- monthly budget view --------------------------------------------------

/** The full monthly budget for `periodKey`: a line per spend category + totals. */
export function computeBudgetPeriod(input: BudgetInput, periodKey: PeriodKey): BudgetPeriod {
  const spendCats = input.categories.filter((c) => c.bucket !== "income");
  const lines: BudgetLine[] = spendCats.map((c) => {
    const w = walkCategory(input, c, periodKey);
    return {
      categoryId: c.id,
      categoryName: c.name,
      needsWantsSavings: c.needsWantsSavings,
      planned: w.planned,
      carryIn: w.carryIn,
      available: w.available,
      actual: w.actual,
      remaining: w.remaining,
    };
  });

  let totalPlanned = 0;
  let totalActual = 0;
  let totalRemaining = 0;
  for (const l of lines) {
    totalPlanned = addMinor(totalPlanned, l.planned);
    totalActual = addMinor(totalActual, l.actual);
    totalRemaining = addMinor(totalRemaining, l.remaining);
  }

  return {
    periodKey,
    method: input.settings.budgetMethod,
    lines,
    totalPlanned,
    totalActual,
    totalRemaining,
    expectedIncome: expectedIncome(input, periodKey),
    leftToAssign: leftToAssign(input, periodKey),
  };
}

// --- §8.6 50/30/20 --------------------------------------------------------

/** The needs/wants/savings split of actual spend for a month (vs the 50/30/20 target). */
export function fiftyThirtyTwenty(input: BudgetInput, periodKey: PeriodKey): FiftyThirtyTwenty {
  const range = monthRange(parsePeriod(periodKey));
  const income = sumTransactions(input.transactions, { type: "income", range }); // actual income this month

  const totals: Record<NeedsWantsSavings, Minor> = { needs: 0, wants: 0, savings: 0, none: 0 };
  for (const c of input.categories) {
    if (c.bucket === "income") continue;
    const actual = actualFor(input.transactions, c, periodKey);
    totals[c.needsWantsSavings] = addMinor(totals[c.needsWantsSavings], actual);
  }

  return {
    income,
    needs: totals.needs,
    wants: totals.wants,
    savings: totals.savings,
    unclassified: totals.none, // "none" is shown separately, never forced into a bucket
    target: { needs: 50, wants: 30, savings: 20 },
  };
}

/** Display helper: a group's share of income as an integer percent (0 when no income). */
export function share(amount: Minor, income: Minor): number {
  if (income <= 0) return 0;
  return Math.round((amount / income) * 100);
}
