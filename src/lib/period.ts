/**
 * Period utility (Section 7). Converts a period (a month) into a concrete
 * date range and derives month boundaries. One service reused everywhere a
 * date window is needed, so period logic is never re-implemented per screen.
 */
import type { IsoDate } from "@/domain/types";

export interface DateRange {
  from: IsoDate; // inclusive
  to: IsoDate; // inclusive
}

export interface MonthKey {
  year: number;
  month: number; // 1-12
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

export function toIsoDate(d: Date): IsoDate {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function todayIso(now: Date = new Date()): IsoDate {
  return toIsoDate(now);
}

export function currentMonth(now: Date = new Date()): MonthKey {
  return { year: now.getFullYear(), month: now.getMonth() + 1 };
}

/** Concrete inclusive [from, to] range for a calendar month. */
export function monthRange({ year, month }: MonthKey): DateRange {
  const lastDay = new Date(year, month, 0).getDate();
  return {
    from: `${year}-${pad(month)}-01`,
    to: `${year}-${pad(month)}-${pad(lastDay)}`,
  };
}

/** True when an ISO date falls within an inclusive range. */
export function inRange(date: IsoDate, range: DateRange): boolean {
  return date >= range.from && date <= range.to;
}

export function monthLabel({ year, month }: MonthKey, locale = "en-US"): string {
  return new Date(year, month - 1, 1).toLocaleDateString(locale, {
    month: "long",
    year: "numeric",
  });
}

/** Human date label for a transaction row, e.g. "17 Sep 2026". */
export function formatDateLabel(date: IsoDate, locale = "en-US"): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(locale, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/**
 * Month grid layout for a calendar (pure presentation, not money math). Returns
 * whole weeks (Monday-first) of ISO dates, with leading/trailing `null` cells so
 * the grid always has complete 7-day rows. Weekday header labels are Mon..Sun.
 */
export function monthGrid({ year, month }: MonthKey): (IsoDate | null)[][] {
  const firstWeekday = (new Date(Date.UTC(year, month - 1, 1)).getUTCDay() + 6) % 7; // Mon=0..Sun=6
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const cells: (IsoDate | null)[] = [];
  for (let i = 0; i < firstWeekday; i++) cells.push(null);
  for (let d = 1; d <= days; d++) cells.push(`${year}-${pad(month)}-${pad(d)}`);
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks: (IsoDate | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}
