/**
 * Occurrence status engine (Architecture §8.2, §14 #2, §15). Pure — no storage,
 * no UI. It turns the recurrence engine's generated dates (Step 3) into
 * *statused* occurrences by joining them against the real Transactions and the
 * RecurringOverrides. Nothing here is stored: there is no occurrence table and no
 * schedule; status is recomputed on demand. Transactions remain the single
 * source of truth for what actually happened.
 *
 * `today` is INJECTED (never Date.now()/new Date() inline) so the engine stays
 * pure and testable, matching the Phase 1 pattern.
 *
 * RANGE EXPECTATION: overdue items predate `today`, so the caller must pass a
 * `range` that extends BEFORE today (a look-back) as well as forward, or overdue
 * occurrences will simply not be generated. The DataProvider (Step 6) supplies a
 * look-back + forward horizon; this engine only reports what the range contains.
 */
import type {
  IsoDate,
  Minor,
  RecurringOverride,
  RecurringRule,
  Transaction,
  TransactionDirection,
} from "@/domain/types";
import { generateOccurrences } from "@/domain/recurrence";
import type { DateRange } from "@/lib/period";

export type OccurrenceStatus = "upcoming" | "overdue" | "paid" | "skipped";

export interface Occurrence {
  ruleId: string;
  /** The scheduled date — the canonical identity key used for all matching. */
  date: IsoDate;
  /** The date shown to the user: an "adjust" override may move it off `date`. */
  displayDate: IsoDate;
  /** Adjusted amount when an "adjust" override changes it, else the rule amount. */
  amount: Minor;
  direction: TransactionDirection;
  type: "expense" | "income";
  categoryId: string | null;
  accountId: string;
  personId: string | null;
  status: OccurrenceStatus;
  /** Present when status is "paid": the transaction that fulfills this occurrence. */
  transactionId?: string;
}

/**
 * Compute statused occurrences for every rule over `range`.
 *
 * Status precedence per scheduled occurrence date (refines §8.2):
 *   a. PAID    — a transaction with recurringRuleId === rule.id AND
 *                occurrenceDate === the scheduled date exists. Paid wins over
 *                everything (a transaction is real money that moved). Matched on
 *                the scheduled date, NOT the transaction's actual `date`, so a
 *                bill paid early/late still clears the right occurrence. If more
 *                than one transaction matches, the occurrence is paid ONCE
 *                (carrying the earliest); the extras stay ordinary transactions
 *                and are never double-counted.
 *   b. SKIPPED — else if a "skip" override exists for this rule + scheduled date.
 *   c. OVERDUE — else if the scheduled date < today.
 *   d. UPCOMING— else (scheduled date >= today).
 *
 * An "adjust" override changes the displayed amount/date only; the occurrence's
 * identity stays the ORIGINAL scheduled date (which is what
 * createTransactionFromOccurrence stored), so matching is always on that key.
 */
export function computeOccurrences(
  rules: RecurringRule[],
  transactions: Transaction[],
  overrides: RecurringOverride[],
  range: DateRange,
  today: IsoDate,
): Occurrence[] {
  // Index overrides and recurring transactions by "ruleId|date" for O(1) joins.
  const overrideByKey = new Map<string, RecurringOverride>();
  for (const o of overrides) overrideByKey.set(key(o.ruleId, o.occurrenceDate), o);

  const txByKey = new Map<string, Transaction[]>();
  for (const t of transactions) {
    if (t.recurringRuleId == null || t.occurrenceDate == null) continue;
    const k = key(t.recurringRuleId, t.occurrenceDate);
    const list = txByKey.get(k);
    if (list) list.push(t);
    else txByKey.set(k, [t]);
  }

  const result: Occurrence[] = [];

  for (const rule of rules) {
    // Step 3 already returns nothing for paused/archived rules.
    for (const scheduled of generateOccurrences(rule, range)) {
      const k = key(rule.id, scheduled);
      const override = overrideByKey.get(k);
      const adjusting = override?.action === "adjust";

      const amount = adjusting && override?.adjustedAmount != null ? override.adjustedAmount : rule.amount;
      const displayDate = adjusting && override?.adjustedDate != null ? override.adjustedDate : scheduled;

      const matches = txByKey.get(k);
      let status: OccurrenceStatus;
      let transactionId: string | undefined;

      if (matches && matches.length > 0) {
        status = "paid";
        transactionId = earliest(matches).id; // dedupe: paid once, carry the earliest
      } else if (override?.action === "skip") {
        status = "skipped";
      } else if (scheduled < today) {
        status = "overdue";
      } else {
        status = "upcoming";
      }

      result.push({
        ruleId: rule.id,
        date: scheduled,
        displayDate,
        amount,
        direction: rule.direction,
        type: rule.type,
        categoryId: rule.categoryId,
        accountId: rule.accountId,
        personId: rule.personId,
        status,
        transactionId,
      });
    }
  }

  // Ascending by scheduled date, then ruleId, for stable, deterministic output.
  result.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.ruleId < b.ruleId ? -1 : a.ruleId > b.ruleId ? 1 : 0));
  return result;
}

/** Upcoming occurrences, optionally narrowed to a window (by scheduled date). */
export function upcoming(occurrences: Occurrence[], withinRange?: DateRange): Occurrence[] {
  return occurrences.filter(
    (o) =>
      o.status === "upcoming" &&
      (!withinRange || (o.date >= withinRange.from && o.date <= withinRange.to)),
  );
}

/** Overdue occurrences (scheduled before today, still unpaid and not skipped). */
export function overdue(occurrences: Occurrence[]): Occurrence[] {
  return occurrences.filter((o) => o.status === "overdue");
}

/**
 * The earliest still-unpaid occurrence for each rule, keyed by ruleId. Used to
 * show a repeating item's next date without recomputing anything in the UI.
 */
export function nextUnpaidByRule(occurrences: Occurrence[]): Map<string, Occurrence> {
  const map = new Map<string, Occurrence>();
  for (const o of occurrences) {
    if (o.status !== "upcoming" && o.status !== "overdue") continue;
    const current = map.get(o.ruleId);
    if (!current || o.date < current.date) map.set(o.ruleId, o);
  }
  return map;
}

function key(ruleId: string, date: IsoDate): string {
  return `${ruleId}|${date}`;
}

function earliest(txns: Transaction[]): Transaction {
  return [...txns].sort(
    (a, b) => a.createdAt - b.createdAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  )[0];
}
