/**
 * Calendar day/week aggregation (Architecture §11, FD-6). Pure — no storage, no
 * UI. Places planned items (occurrences) and actual items (transactions) onto
 * their days and computes per-day money-going-out totals.
 *
 * NO DOUBLE COUNT (same unpaid-only guard as cash-flow): a PAID occurrence is
 * already represented by its transaction, so a day's "money going out" total is
 *   (all non-transfer OUT transactions that day) + (UNPAID planned OUT that day).
 * A paid occurrence is never added on top of its transaction.
 */
import type { IsoDate, Minor, Transaction } from "@/domain/types";
import type { Occurrence } from "@/domain/occurrences";
import { addMinor } from "@/lib/money";

export interface DayItems {
  date: IsoDate;
  /** Every occurrence scheduled that day (any status) — for the day detail. */
  planned: Occurrence[];
  /**
   * Manual, non-transfer transactions that day — for the day detail. A recurring
   * payment is shown via its paid planned item instead, so it is excluded here to
   * avoid showing the same thing twice (its amount still counts in outTotal).
   */
  actual: Transaction[];
  /** Money going out that day: all non-transfer OUT txns + unpaid planned OUT. */
  outTotal: Minor;
  /** Money coming in that day: all non-transfer IN txns + unpaid planned IN. */
  inTotal: Minor;
}

function isUnpaid(o: Occurrence): boolean {
  return o.status === "upcoming" || o.status === "overdue";
}

/** Group planned + actual items by day, with the no-double-count out/in totals. */
export function buildDayItems(occurrences: Occurrence[], transactions: Transaction[]): Map<IsoDate, DayItems> {
  const map = new Map<IsoDate, DayItems>();
  const ensure = (date: IsoDate): DayItems => {
    let d = map.get(date);
    if (!d) {
      d = { date, planned: [], actual: [], outTotal: 0, inTotal: 0 };
      map.set(date, d);
    }
    return d;
  };

  for (const t of transactions) {
    if (t.type === "transfer") continue; // transfers net to zero — not a bill/income
    const day = ensure(t.date);
    // Totals count ALL real money that moved (manual + recurring-fulfilling).
    if (t.direction === "out") day.outTotal = addMinor(day.outTotal, t.amount);
    else day.inTotal = addMinor(day.inTotal, t.amount);
    // Detail lists only manual items; a recurring payment shows via its paid item.
    if (t.recurringRuleId == null) day.actual.push(t);
  }

  for (const o of occurrences) {
    const day = ensure(o.date); // placed on the scheduled date (stable within the month)
    day.planned.push(o);
    if (isUnpaid(o)) {
      // Only unpaid planned items add to the projection totals (paid ones are txns).
      if (o.direction === "out") day.outTotal = addMinor(day.outTotal, o.amount);
      else day.inTotal = addMinor(day.inTotal, o.amount);
    }
  }

  return map;
}

/** Sum the money-going-out totals of a week's days (skipping empty cells). */
export function weekOutTotal(days: (DayItems | undefined)[]): Minor {
  let sum = 0;
  for (const d of days) if (d) sum = addMinor(sum, d.outTotal);
  return sum;
}
