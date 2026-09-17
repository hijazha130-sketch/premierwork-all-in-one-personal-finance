import { describe, it, expect } from "vitest";
import { computeOccurrences, upcoming, overdue, nextUnpaidByRule } from "@/domain/occurrences";
import type { RecurringFrequency, RecurringOverride, RecurringRule, Transaction } from "@/domain/types";
import type { DateRange } from "@/lib/period";
import { makeTx } from "./fixtures";

const TODAY = "2026-06-15";
const YEAR: DateRange = { from: "2026-01-01", to: "2026-12-31" }; // look-back + forward

function makeRule(over: Partial<RecurringRule> & { frequency?: RecurringFrequency; anchorDate?: string } = {}): RecurringRule {
  return {
    id: "rule1",
    createdAt: 0,
    updatedAt: 0,
    name: "Rent",
    amount: 50000_00,
    direction: "out",
    type: "expense",
    categoryId: "cat1",
    accountId: "acc1",
    personId: null,
    frequency: "everyMonth",
    anchorDate: "2026-01-10",
    endDate: null,
    active: true,
    archived: false,
    goalId: null,
    debtId: null,
    investmentId: null,
    ...over,
  };
}

/** A recurring transaction fulfilling a specific scheduled occurrence. */
function recTx(ruleId: string, occurrenceDate: string, over: Partial<Transaction> = {}): Transaction {
  return makeTx({
    accountId: "acc1",
    amount: 50000_00,
    type: "expense",
    direction: "out",
    source: "recurring",
    recurringRuleId: ruleId,
    occurrenceDate,
    date: occurrenceDate,
    ...over,
  });
}

function on(occ: ReturnType<typeof computeOccurrences>, date: string) {
  return occ.find((o) => o.date === date);
}

describe("occurrence status engine — the status matrix", () => {
  it("labels overdue (scheduled < today) and upcoming (>= today) with no tx/overrides", () => {
    const occ = computeOccurrences([makeRule()], [], [], YEAR, TODAY);
    expect(on(occ, "2026-06-10")?.status).toBe("overdue"); // before today
    expect(on(occ, "2026-06-15")).toBeUndefined(); // rule is on the 10th, not the 15th
    expect(on(occ, "2026-07-10")?.status).toBe("upcoming"); // after today
    // Output is ascending by scheduled date.
    expect(occ.map((o) => o.date)).toEqual([...occ.map((o) => o.date)].sort());
  });

  it("labels paid when a matching transaction exists, carrying its id", () => {
    const rule = makeRule();
    const tx = recTx(rule.id, "2026-06-10");
    const occ = computeOccurrences([rule], [tx], [], YEAR, TODAY);
    const o = on(occ, "2026-06-10");
    expect(o?.status).toBe("paid");
    expect(o?.transactionId).toBe(tx.id);
  });

  it("labels skipped when a skip override exists (and no transaction)", () => {
    const rule = makeRule();
    const override: RecurringOverride = { id: "o1", createdAt: 0, updatedAt: 0, ruleId: rule.id, occurrenceDate: "2026-07-10", action: "skip" };
    const occ = computeOccurrences([rule], [], [override], YEAR, TODAY);
    expect(on(occ, "2026-07-10")?.status).toBe("skipped");
  });

  it("applies an adjust override to displayed amount/date while keeping the scheduled key", () => {
    const rule = makeRule();
    const override: RecurringOverride = {
      id: "o1", createdAt: 0, updatedAt: 0, ruleId: rule.id, occurrenceDate: "2026-08-10",
      action: "adjust", adjustedAmount: 45000_00, adjustedDate: "2026-08-12",
    };
    const occ = computeOccurrences([rule], [], [override], YEAR, TODAY);
    const o = on(occ, "2026-08-10"); // still keyed to the original scheduled date
    expect(o?.date).toBe("2026-08-10");
    expect(o?.displayDate).toBe("2026-08-12");
    expect(o?.amount).toBe(45000_00);
    expect(o?.status).toBe("upcoming");
  });
});

describe("occurrence status engine — matching rules and invariants", () => {
  it("matches paid on occurrenceDate even when the transaction's actual date differs (early/late)", () => {
    const rule = makeRule();
    const paidEarly = recTx(rule.id, "2026-06-10", { date: "2026-06-05" }); // paid 5 days early
    const occ = computeOccurrences([rule], [paidEarly], [], YEAR, TODAY);
    expect(on(occ, "2026-06-10")?.status).toBe("paid");
  });

  it("returns to overdue/upcoming when the matching transaction is deleted (no orphan state)", () => {
    const rule = makeRule();
    const tx = recTx(rule.id, "2026-06-10");
    expect(on(computeOccurrences([rule], [tx], [], YEAR, TODAY), "2026-06-10")?.status).toBe("paid");
    // Remove the transaction from the input -> status is recomputed, not stored.
    expect(on(computeOccurrences([rule], [], [], YEAR, TODAY), "2026-06-10")?.status).toBe("overdue");
    expect(on(computeOccurrences([rule], [], [], YEAR, TODAY), "2026-07-10")?.status).toBe("upcoming");
  });

  it("counts a doubly-paid occurrence once and carries the earliest transaction", () => {
    const rule = makeRule();
    const first = recTx(rule.id, "2026-06-10", { id: "tx_a" });
    const second = recTx(rule.id, "2026-06-10", { id: "tx_b" });
    const occ = computeOccurrences([rule], [first, second], [], YEAR, TODAY);
    const forDate = occ.filter((o) => o.date === "2026-06-10");
    expect(forDate).toHaveLength(1); // paid once, no double count
    expect(forDate[0].status).toBe("paid");
    expect(forDate[0].transactionId).toBe("tx_a"); // the earliest
  });

  it("gives PAID precedence over a skip override on the same occurrence", () => {
    const rule = makeRule();
    const tx = recTx(rule.id, "2026-06-10");
    const skip: RecurringOverride = { id: "o1", createdAt: 0, updatedAt: 0, ruleId: rule.id, occurrenceDate: "2026-06-10", action: "skip" };
    const occ = computeOccurrences([rule], [tx], [skip], YEAR, TODAY);
    expect(on(occ, "2026-06-10")?.status).toBe("paid"); // a transaction is real money — it wins
  });

  it("contributes no occurrences for a paused or archived rule", () => {
    expect(computeOccurrences([makeRule({ active: false })], [], [], YEAR, TODAY)).toEqual([]);
    expect(computeOccurrences([makeRule({ archived: true })], [], [], YEAR, TODAY)).toEqual([]);
  });
});

describe("occurrence status engine — selectors", () => {
  it("upcoming() returns only upcoming, optionally within a window; overdue() returns only overdue", () => {
    const rule = makeRule();
    const occ = computeOccurrences([rule], [], [], YEAR, TODAY);

    const up = upcoming(occ);
    expect(up.every((o) => o.status === "upcoming")).toBe(true);
    expect(up.map((o) => o.date)).toContain("2026-07-10");
    expect(up.map((o) => o.date)).not.toContain("2026-06-10"); // that one is overdue

    const upNarrow = upcoming(occ, { from: "2026-07-01", to: "2026-08-31" });
    expect(upNarrow.map((o) => o.date)).toEqual(["2026-07-10", "2026-08-10"]);

    const od = overdue(occ);
    expect(od.every((o) => o.status === "overdue")).toBe(true);
    expect(od.map((o) => o.date)).toContain("2026-06-10");
    expect(od.map((o) => o.date)).toContain("2026-01-10");
  });

  it("nextUnpaidByRule picks the earliest unpaid occurrence per rule", () => {
    const rule1 = makeRule({ id: "rule1", anchorDate: "2026-01-10" });
    const rule2 = makeRule({ id: "rule2", anchorDate: "2026-03-05" });
    const occ = computeOccurrences([rule1, rule2], [], [], YEAR, TODAY);

    const next = nextUnpaidByRule(occ);
    expect(next.get("rule1")?.date).toBe("2026-01-10"); // earliest unpaid (overdue) for rule1
    expect(next.get("rule2")?.date).toBe("2026-03-05");

    // Paying the earliest unpaid moves the pointer to the next one.
    const withPaid = computeOccurrences([rule1, rule2], [recTx("rule1", "2026-01-10")], [], YEAR, TODAY);
    expect(nextUnpaidByRule(withPaid).get("rule1")?.date).toBe("2026-02-10");
  });
});
