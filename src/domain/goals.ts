/**
 * Goal engine (Phase 4 Architecture §8.1). Pure — no storage, no UI, `today`
 * injected. Everything a savings goal shows is DERIVED here from the goal's
 * terms plus the transactions linked to it (via goalId). How much is saved is
 * never stored, so a goal can never disagree with the ledger.
 *
 *   the goal stores the target; the transactions are the saving.
 */
import type { Goal, IsoDate, Minor, Transaction } from "@/domain/types";
import { addMinor, subMinor } from "@/lib/money";

export interface GoalProgress {
  goalId: string;
  name: string;
  target: Minor;
  saved: Minor; // startingAmount + Σ contributions
  remaining: Minor; // max(0, target − saved)
  progress: number; // raw ratio saved/target (may exceed 1 when over-funded)
  monthlyTarget: Minor | null; // remaining ÷ months left — only when a target date is set
  projectedDate: IsoDate | null; // today + months to fund — only when a monthly contribution is set
  complete: boolean; // saved >= target
}

export interface GoalsRollup {
  goals: GoalProgress[];
  totalTarget: Minor;
  totalSaved: Minor;
  totalRemaining: Minor;
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** Whole calendar months from one ISO date to another (day ignored; may be <= 0). */
function monthsBetween(fromIso: IsoDate, toIso: IsoDate): number {
  const [fy, fm] = fromIso.split("-").map(Number);
  const [ty, tm] = toIso.split("-").map(Number);
  return ty * 12 + tm - (fy * 12 + fm);
}

/** ISO date `n` whole months after `iso`, clamping the day to the target month. */
function addMonthsIso(iso: IsoDate, n: number): IsoDate {
  const [y, m, d] = iso.split("-").map(Number);
  const idx = m - 1 + n;
  const ty = y + Math.floor(idx / 12);
  const tm = ((idx % 12) + 12) % 12; // 0-11
  const lastDay = new Date(ty, tm + 1, 0).getDate();
  const day = Math.min(d, lastDay);
  return `${ty}-${pad2(tm + 1)}-${pad2(day)}`;
}

/** Ceil division on integers (minor units), guarding a non-positive divisor. */
function ceilDiv(a: number, b: number): number {
  if (b <= 0) return 0;
  return Math.ceil(a / b);
}

/** startingAmount + the sum of every transaction linked to this goal (goalId). */
export function savedForGoal(goal: Goal, transactions: Transaction[]): Minor {
  let saved = goal.startingAmount;
  for (const t of transactions) {
    if (t.goalId === goal.id) saved = addMinor(saved, t.amount);
  }
  return saved;
}

/** The full derived progress for one goal. */
export function computeGoalProgress(
  goal: Goal,
  transactions: Transaction[],
  today: IsoDate,
): GoalProgress {
  const saved = savedForGoal(goal, transactions);
  const remaining = Math.max(0, subMinor(goal.targetAmount, saved));
  const progress = goal.targetAmount > 0 ? saved / goal.targetAmount : 0;
  const complete = saved >= goal.targetAmount;

  // Monthly target: only meaningful with a target date. When the date is here or
  // past, the whole remaining is "due now".
  let monthlyTarget: Minor | null = null;
  if (goal.targetDate) {
    const monthsLeft = monthsBetween(today, goal.targetDate);
    monthlyTarget = monthsLeft > 0 ? ceilDiv(remaining, monthsLeft) : remaining;
  }

  // Projected finish: only when a planned monthly contribution is set.
  let projectedDate: IsoDate | null = null;
  if (goal.monthlyContribution && goal.monthlyContribution > 0) {
    const months = ceilDiv(remaining, goal.monthlyContribution);
    projectedDate = addMonthsIso(today, months);
  }

  return {
    goalId: goal.id,
    name: goal.name,
    target: goal.targetAmount,
    saved,
    remaining,
    progress,
    monthlyTarget,
    projectedDate,
    complete,
  };
}

/** Per-goal progress plus the global roll-up across all the goals passed in. */
export function computeGoals(
  goals: Goal[],
  transactions: Transaction[],
  today: IsoDate,
): GoalsRollup {
  const rows = goals.map((g) => computeGoalProgress(g, transactions, today));
  let totalTarget = 0;
  let totalSaved = 0;
  let totalRemaining = 0;
  for (const r of rows) {
    totalTarget = addMinor(totalTarget, r.target);
    totalSaved = addMinor(totalSaved, r.saved);
    totalRemaining = addMinor(totalRemaining, r.remaining);
  }
  return { goals: rows, totalTarget, totalSaved, totalRemaining };
}
