/**
 * Cash-flow projection + Safe to Spend (Architecture §8.3, §8.4, §14 #3/#4, §15).
 * Pure — no storage, no UI. Both are computed from the Step 4 occurrences and the
 * Phase 1 balance, with `today` INJECTED (no inline clock) so they stay testable.
 *
 * Safe to Spend is NEW product logic (the spreadsheets had no such formula); it
 * implements the architecture's definition exactly.
 *
 * Starting balance: the existing balance.ts `totalBalance(accounts, transactions)`
 * is the origin for BOTH. It already counts CLEARED transactions only, so it IS
 * the "cleared total balance" §8.4 refers to — there is no separate split to add.
 *
 * DOUBLE-COUNT GUARD (invariant #6): only UNPAID occurrences (upcoming/overdue)
 * adjust a projection. A PAID occurrence is already a transaction inside
 * totalBalance, so it is never applied again.
 */
import type { Account, IsoDate, Minor, SafeToSpendHorizon, Transaction } from "@/domain/types";
import type { Occurrence } from "@/domain/occurrences";
import type { DateRange } from "@/lib/period";
import { totalBalance } from "@/domain/balance";
import { addMinor, subMinor, sumMinor } from "@/lib/money";

/** An occurrence still owed/expected — the only kind that moves a projection. */
export function isUnpaid(o: Occurrence): boolean {
  return o.status === "upcoming" || o.status === "overdue";
}

// --- Cash-flow projection (§8.3) -----------------------------------------

export interface CashflowPoint {
  date: IsoDate;
  projectedBalance: Minor;
}

export interface CashflowProjection {
  startDate: IsoDate; // = today: where the projection begins
  startBalance: Minor; // current cleared total balance
  series: CashflowPoint[]; // running balance after each unpaid occurrence, by date
  minProjectedBalance: Minor; // lowest point over the horizon (incl. the start)
}

/**
 * Forward running-balance projection: start from the current balance and walk
 * the UNPAID occurrences within `horizon` in scheduled-date order, adding income
 * and subtracting expenses. Overdue-but-unpaid items are still owed, so they are
 * included. Paid occurrences are already in the balance and are never re-applied.
 */
export function projectCashflow(
  accounts: Account[],
  transactions: Transaction[],
  occurrences: Occurrence[],
  horizon: DateRange,
  today: IsoDate,
): CashflowProjection {
  const startBalance = totalBalance(accounts, transactions);

  const unpaid = occurrences
    .filter((o) => isUnpaid(o) && o.date >= horizon.from && o.date <= horizon.to)
    .sort(byScheduledDate);

  const series: CashflowPoint[] = [];
  let running = startBalance;
  for (const o of unpaid) {
    running = o.direction === "in" ? addMinor(running, o.amount) : subMinor(running, o.amount);
    series.push({ date: o.date, projectedBalance: running });
  }

  const minProjectedBalance = series.reduce((m, p) => Math.min(m, p.projectedBalance), startBalance);
  return { startDate: today, startBalance, series, minProjectedBalance };
}

// --- Safe to Spend (§8.4) -------------------------------------------------

export interface SafeToSpendConfig {
  mode: SafeToSpendHorizon; // FD-1, default "endOfMonth"
  rollingDays?: number; // used only when mode = "rollingDays"
  /** FD-2: default false — do NOT pre-credit expected income. */
  creditExpectedIncome?: boolean;
  /** Phase 4, FD-4.3: the emergency cushion to reserve (soft; default 0). */
  safetyFloor?: Minor;
}

export interface SafeToSpendResult {
  amount: Minor; // MAY be negative — returned honestly, never clamped (§15)
  reserved: Occurrence[]; // the unpaid out-commitments subtracted (for a breakdown)
  reservedTotal: Minor; // Σ of the reserved commitments (for a one-line "set aside" note)
  safetyFloor: Minor; // the cushion reserved (for a breakdown; 0 when unset)
  horizonEnd: IsoDate; // the last day considered
}

/**
 * Safe to spend now, given upcoming commitments.
 *   amount = clearedBalance − Σ(unpaid OUT commitments due on/before horizonEnd)
 *            − safetyFloor
 *            [+ Σ expected IN within horizon, only if creditExpectedIncome]
 *
 * The reserve INCLUDES overdue unpaid items (you still owe them). "paid" excludes
 * an occurrence regardless of the fulfilling transaction's cleared flag (FD-5).
 * The Safety Floor (FD-4.3) is a soft reserve: it reduces the number so the
 * cushion is never counted as spendable — never a hard block. The result may be
 * negative and is returned as-is (§15).
 */
export function safeToSpend(
  accounts: Account[],
  transactions: Transaction[],
  occurrences: Occurrence[],
  today: IsoDate,
  config: SafeToSpendConfig = { mode: "endOfMonth" },
): SafeToSpendResult {
  const balance = totalBalance(accounts, transactions);
  const horizonEnd = resolveHorizonEnd(occurrences, today, config);

  const unpaid = occurrences.filter(isUnpaid);
  const reserved = unpaid
    .filter((o) => o.direction === "out" && o.date <= horizonEnd)
    .sort(byScheduledDate);

  const reservedTotal = sumMinor(reserved.map((o) => o.amount));
  const safetyFloor = config.safetyFloor ?? 0;
  let amount = subMinor(subMinor(balance, reservedTotal), safetyFloor);

  if (config.creditExpectedIncome) {
    const expectedIn = unpaid.filter((o) => o.direction === "in" && o.date <= horizonEnd);
    amount = addMinor(amount, sumMinor(expectedIn.map((o) => o.amount)));
  }

  return { amount, reserved, reservedTotal, safetyFloor, horizonEnd };
}

/** Resolve the horizon's last day from the chosen mode (FD-1). */
function resolveHorizonEnd(occurrences: Occurrence[], today: IsoDate, config: SafeToSpendConfig): IsoDate {
  switch (config.mode) {
    case "rollingDays":
      return addDaysIso(today, config.rollingDays ?? 30);
    case "nextIncome": {
      const incomes = occurrences
        .filter((o) => o.status === "upcoming" && o.direction === "in" && o.date >= today)
        .map((o) => o.date)
        .sort();
      return incomes[0] ?? endOfMonthIso(today); // fall back to month end if none
    }
    case "endOfMonth":
    default:
      return endOfMonthIso(today);
  }
}

// --- Local date helpers (UTC, day-precision; ISO strings compare lexically) --

function byScheduledDate(a: Occurrence, b: Occurrence): number {
  return a.date < b.date ? -1 : a.date > b.date ? 1 : 0;
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function parseIso(iso: IsoDate): [number, number, number] {
  const [y, m, d] = iso.split("-").map(Number);
  return [y, m, d];
}

function daysInMonth(year: number, month1: number): number {
  return new Date(Date.UTC(year, month1, 0)).getUTCDate();
}

function endOfMonthIso(iso: IsoDate): IsoDate {
  const [y, m] = parseIso(iso);
  return `${y}-${pad2(m)}-${pad2(daysInMonth(y, m))}`;
}

function addDaysIso(iso: IsoDate, days: number): IsoDate {
  const [y, m, d] = parseIso(iso);
  const dt = new Date(Date.UTC(y, m - 1, d) + days * 86_400_000);
  return `${dt.getUTCFullYear()}-${pad2(dt.getUTCMonth() + 1)}-${pad2(dt.getUTCDate())}`;
}
