import { describe, it, expect } from "vitest";
import { buildDayItems, weekOutTotal } from "@/domain/calendar";
import type { Occurrence, OccurrenceStatus } from "@/domain/occurrences";
import { makeTx } from "./fixtures";

function occ(date: string, direction: "in" | "out", amount: number, status: OccurrenceStatus): Occurrence {
  return {
    ruleId: "r1",
    date,
    displayDate: date,
    amount,
    direction,
    type: direction === "in" ? "income" : "expense",
    categoryId: null,
    accountId: "acc1",
    personId: null,
    status,
  };
}

describe("calendar day/week totals (§11, no double count)", () => {
  it("counts a paid occurrence once — via its transaction, never on top of it", () => {
    const D = "2026-09-10";
    // A recurring transaction that fulfills the occurrence (paid).
    const paidTx = makeTx({ accountId: "acc1", amount: 5000_00, direction: "out", type: "expense", date: D, recurringRuleId: "r1", occurrenceDate: D });
    const paidOcc = occ(D, "out", 5000_00, "paid");

    const day = buildDayItems([paidOcc], [paidTx]).get(D)!;
    expect(day.outTotal).toBe(5000_00); // counted once (the transaction), not 10,000
    expect(day.planned).toHaveLength(1); // the paid item shows in the detail
    expect(day.actual).toHaveLength(0); // the recurring tx is not repeated in the detail
  });

  it("adds a manual transaction and an unpaid planned item on the same day", () => {
    const D = "2026-09-15";
    const manual = makeTx({ accountId: "acc1", amount: 1000_00, direction: "out", type: "expense", date: D });
    const upcoming = occ(D, "out", 2000_00, "upcoming");

    const day = buildDayItems([upcoming], [manual]).get(D)!;
    expect(day.outTotal).toBe(3000_00); // 1,000 actual + 2,000 unpaid planned
    expect(day.actual).toHaveLength(1);
    expect(day.planned).toHaveLength(1);
  });

  it("excludes transfers and never conflates money-in into the out total", () => {
    const D = "2026-09-20";
    const transfer = makeTx({ accountId: "acc1", amount: 500_00, type: "transfer", direction: "out", date: D, transferGroupId: "g1" });
    const out = makeTx({ accountId: "acc1", amount: 1000_00, type: "expense", direction: "out", date: D });
    const incomeOcc = occ(D, "in", 5000_00, "upcoming");

    const day = buildDayItems([incomeOcc], [transfer, out]).get(D)!;
    expect(day.outTotal).toBe(1000_00); // transfer excluded; income not added to out
    expect(day.inTotal).toBe(5000_00);
    expect(day.actual.some((t) => t.type === "transfer")).toBe(false);
  });

  it("weekOutTotal sums the days' out totals, skipping empty cells", () => {
    const a = buildDayItems([occ("2026-09-01", "out", 1000_00, "upcoming")], []).get("2026-09-01");
    const b = buildDayItems([occ("2026-09-03", "out", 2500_00, "overdue")], []).get("2026-09-03");
    expect(weekOutTotal([a, undefined, b, undefined])).toBe(3500_00);
  });
});
