/**
 * Recurrence engine (Architecture §8.1, §14, §15). Pure occurrence generation:
 * expands a RecurringRule into dated occurrences over a horizon, and finds the
 * next occurrence. Occurrences are never stored — they are recomputed on demand.
 *
 * Rules:
 *  - Week-based (everyWeek/every2Weeks/every4Weeks): step +7/+14/+28 days and emit
 *    every occurrence that falls in range. There is NO artificial per-year cap: a
 *    weekly commitment can genuinely land 53 times in a span, and dropping one
 *    would undercount commitments and misstate Safe to Spend / cash-flow. (The
 *    spreadsheet's 52/26/13 was a fixed row-budget artifact, not a product rule.)
 *  - Month-based (everyMonth/every2Months/everyQuarter/every6Months/everyYear):
 *    step whole months from the anchor (EDATE semantics), clamping an impossible
 *    day to the month's last valid day (e.g. the 31st → Feb 28/29, Apr 30). FD-4.
 *  - oneTime: the anchor only.
 *  - endDate is inclusive; nothing is emitted past it.
 *  - A paused (active=false) or archived rule generates nothing (§15).
 *
 * Generation is bounded only by the requested range and the rule's endDate; a
 * hard iteration limit is an engineering guard against runaway open-ended loops,
 * never a product-level cap on how many commitments exist.
 *
 * Dates are day-precision ISO strings ("YYYY-MM-DD"), which compare correctly as
 * plain strings, so all boundary checks use lexical comparison. Arithmetic is in
 * UTC to avoid any timezone/DST drift.
 */
import type { IsoDate, RecurringFrequency, RecurringRule } from "@/domain/types";
import type { DateRange } from "@/lib/period";

const DAY_STEP: Partial<Record<RecurringFrequency, number>> = {
  everyWeek: 7,
  every2Weeks: 14,
  every4Weeks: 28,
};
const MONTH_STEP: Partial<Record<RecurringFrequency, number>> = {
  everyMonth: 1,
  every2Months: 2,
  everyQuarter: 3,
  every6Months: 6,
  everyYear: 12,
};

/**
 * Engineering safety guard so an open-ended rule can never spin forever. This is
 * NOT a product cap on occurrences — callers pass a bounded range (a month for
 * the calendar, the horizon for cash-flow), which is the real bound.
 */
const MAX_ITERATIONS = 100_000;

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function parseIso(iso: IsoDate): [number, number, number] {
  const [y, m, d] = iso.split("-").map(Number);
  return [y, m, d];
}

function isoOf(y: number, m: number, d: number): IsoDate {
  return `${y}-${pad2(m)}-${pad2(d)}`;
}

/** Days in a 1-based month. */
function daysInMonth(year: number, month1: number): number {
  return new Date(Date.UTC(year, month1, 0)).getUTCDate();
}

/** Add whole days to an ISO date (UTC arithmetic). */
function addDaysIso(iso: IsoDate, days: number): IsoDate {
  const [y, m, d] = parseIso(iso);
  const dt = new Date(Date.UTC(y, m - 1, d) + days * 86_400_000);
  return isoOf(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
}

/**
 * Add whole months to an anchor, keeping the anchor's day-of-month and clamping
 * to the target month's last valid day (EDATE semantics). Computed from the
 * anchor each time so there is no cumulative drift (Jan 31 → Feb 28 → Mar 31).
 */
function addMonthsClampedIso(anchorY: number, anchorM: number, anchorD: number, add: number): IsoDate {
  const idx = anchorM - 1 + add;
  const y = anchorY + Math.floor(idx / 12);
  const m = (idx % 12) + 1;
  const d = Math.min(anchorD, daysInMonth(y, m));
  return isoOf(y, m, d);
}

/** True when the rule projects at all. */
function generates(rule: RecurringRule): boolean {
  return rule.active && !rule.archived;
}

/**
 * All occurrence dates for a rule within [range.from, range.to] (both inclusive),
 * ascending. Caps and endDate are honored; a paused/archived rule yields [].
 */
export function generateOccurrences(rule: RecurringRule, range: DateRange): IsoDate[] {
  if (!generates(rule)) return [];
  const out: IsoDate[] = [];
  const withinRange = (c: IsoDate) => c >= range.from && c <= range.to;
  const beforeEnd = (c: IsoDate) => rule.endDate == null || c <= rule.endDate;

  if (rule.frequency === "oneTime") {
    const c = rule.anchorDate;
    if (beforeEnd(c) && withinRange(c)) out.push(c);
    return out;
  }

  const dayStep = DAY_STEP[rule.frequency];
  if (dayStep != null) {
    for (let k = 0; k < MAX_ITERATIONS; k++) {
      const candidate = addDaysIso(rule.anchorDate, k * dayStep);
      if (candidate > range.to) break;
      if (!beforeEnd(candidate)) break;
      if (candidate >= range.from) out.push(candidate); // every occurrence in range
    }
    return out;
  }

  const monthStep = MONTH_STEP[rule.frequency];
  if (monthStep != null) {
    const [ay, am, ad] = parseIso(rule.anchorDate);
    for (let k = 0; k < MAX_ITERATIONS; k++) {
      const candidate = addMonthsClampedIso(ay, am, ad, k * monthStep);
      if (candidate > range.to) break;
      if (!beforeEnd(candidate)) break;
      if (candidate >= range.from) out.push(candidate);
    }
    return out;
  }

  return out;
}

/**
 * The first occurrence on or after `fromDateInclusive`, or null if none exists
 * (e.g. a oneTime already past, or an endDate that cuts it off). Honors the same
 * caps/endDate/paused rules as generateOccurrences.
 */
export function nextOccurrence(rule: RecurringRule, fromDateInclusive: IsoDate): IsoDate | null {
  if (!generates(rule)) return null;
  // Bound the search generously: the largest gap between occurrences is one year
  // (everyYear), so 400 days past whichever of the anchor/`from` is later always
  // contains the next occurrence if one exists before endDate.
  const startRef = rule.anchorDate > fromDateInclusive ? rule.anchorDate : fromDateInclusive;
  const to = addDaysIso(startRef, 400);
  const occurrences = generateOccurrences(rule, { from: fromDateInclusive, to });
  return occurrences[0] ?? null;
}
