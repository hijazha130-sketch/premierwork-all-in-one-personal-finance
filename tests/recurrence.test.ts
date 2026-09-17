import { describe, it, expect } from "vitest";
import { generateOccurrences, nextOccurrence } from "@/domain/recurrence";
import type { RecurringFrequency, RecurringRule } from "@/domain/types";
import type { DateRange } from "@/lib/period";

function makeRule(over: Partial<RecurringRule> & { frequency: RecurringFrequency; anchorDate: string }): RecurringRule {
  return {
    id: "r1",
    createdAt: 0,
    updatedAt: 0,
    name: "Rule",
    amount: 1000_00,
    direction: "out",
    type: "expense",
    categoryId: null,
    accountId: "a1",
    personId: null,
    endDate: null,
    active: true,
    archived: false,
    goalId: null,
    debtId: null,
    investmentId: null,
    ...over,
  };
}

const YEAR_2026: DateRange = { from: "2026-01-01", to: "2026-12-31" };

describe("recurrence engine — month-based stepping with clamping", () => {
  it("clamps a 31st anchor into short months (EDATE semantics, no drift)", () => {
    const rule = makeRule({ frequency: "everyMonth", anchorDate: "2026-01-31" });
    expect(generateOccurrences(rule, { from: "2026-01-01", to: "2026-06-30" })).toEqual([
      "2026-01-31",
      "2026-02-28",
      "2026-03-31", // back to 31 — proves no cumulative drift from Feb
      "2026-04-30",
      "2026-05-31",
      "2026-06-30",
    ]);
  });

  it("uses Feb 29 in a leap year", () => {
    const rule = makeRule({ frequency: "everyMonth", anchorDate: "2024-01-31" });
    expect(generateOccurrences(rule, { from: "2024-01-01", to: "2024-03-31" })).toEqual([
      "2024-01-31",
      "2024-02-29",
      "2024-03-31",
    ]);
  });

  it("everyYear from Feb 29 clamps to Feb 28 in non-leap years (FD-4)", () => {
    const rule = makeRule({ frequency: "everyYear", anchorDate: "2024-02-29" });
    expect(generateOccurrences(rule, { from: "2024-01-01", to: "2028-12-31" })).toEqual([
      "2024-02-29",
      "2025-02-28",
      "2026-02-28",
      "2027-02-28",
      "2028-02-29", // leap again
    ]);
  });

  it("everyQuarter steps by three whole months", () => {
    const rule = makeRule({ frequency: "everyQuarter", anchorDate: "2026-01-15" });
    expect(generateOccurrences(rule, YEAR_2026)).toEqual([
      "2026-01-15",
      "2026-04-15",
      "2026-07-15",
      "2026-10-15",
    ]);
  });

  it("every2Months and every6Months step correctly", () => {
    expect(
      generateOccurrences(makeRule({ frequency: "every2Months", anchorDate: "2026-02-10" }), YEAR_2026),
    ).toEqual(["2026-02-10", "2026-04-10", "2026-06-10", "2026-08-10", "2026-10-10", "2026-12-10"]);
    expect(
      generateOccurrences(makeRule({ frequency: "every6Months", anchorDate: "2026-03-01" }), YEAR_2026),
    ).toEqual(["2026-03-01", "2026-09-01"]);
  });
});

describe("recurrence engine — week-based stepping (no artificial cap)", () => {
  it("everyWeek emits every occurrence in range — 53 can genuinely fall in a year", () => {
    const rule = makeRule({ frequency: "everyWeek", anchorDate: "2026-01-01" });
    const occ = generateOccurrences(rule, YEAR_2026);
    expect(occ).toHaveLength(53); // true count — no drift-drop
    expect(occ[0]).toBe("2026-01-01");
    expect(occ).toContain("2026-12-24");
    expect(occ).toContain("2026-12-31"); // the 53rd is a real commitment, kept
  });

  it("every2Weeks emits all in range (27 in this year)", () => {
    const rule = makeRule({ frequency: "every2Weeks", anchorDate: "2026-01-01" });
    const occ = generateOccurrences(rule, YEAR_2026);
    expect(occ).toHaveLength(27);
    expect(occ).toContain("2026-12-31");
  });

  it("every4Weeks emits all in range (14 in this year)", () => {
    const rule = makeRule({ frequency: "every4Weeks", anchorDate: "2026-01-01" });
    const occ = generateOccurrences(rule, YEAR_2026);
    expect(occ).toHaveLength(14);
    expect(occ).toContain("2026-12-31");
  });

  it("steps by fixed days within a short window", () => {
    const rule = makeRule({ frequency: "everyWeek", anchorDate: "2026-01-01" });
    expect(generateOccurrences(rule, { from: "2026-01-01", to: "2026-01-31" })).toEqual([
      "2026-01-01",
      "2026-01-08",
      "2026-01-15",
      "2026-01-22",
      "2026-01-29",
    ]);
  });
});

describe("recurrence engine — oneTime, end dates, ranges, and paused rules", () => {
  it("oneTime emits only the anchor, and only when it falls in range", () => {
    const rule = makeRule({ frequency: "oneTime", anchorDate: "2026-03-15" });
    expect(generateOccurrences(rule, YEAR_2026)).toEqual(["2026-03-15"]);
    expect(generateOccurrences(rule, { from: "2026-04-01", to: "2026-12-31" })).toEqual([]);
  });

  it("honors an inclusive end date and never emits past it", () => {
    const rule = makeRule({ frequency: "everyMonth", anchorDate: "2026-01-01", endDate: "2026-03-01" });
    const occ = generateOccurrences(rule, YEAR_2026);
    expect(occ).toEqual(["2026-01-01", "2026-02-01", "2026-03-01"]);
    expect(occ).not.toContain("2026-04-01");
  });

  it("emits only occurrences inside the query range", () => {
    const rule = makeRule({ frequency: "everyMonth", anchorDate: "2026-01-01" });
    expect(generateOccurrences(rule, { from: "2026-03-01", to: "2026-05-31" })).toEqual([
      "2026-03-01",
      "2026-04-01",
      "2026-05-01",
    ]);
  });

  it("a paused or archived rule generates nothing", () => {
    const paused = makeRule({ frequency: "everyMonth", anchorDate: "2026-01-01", active: false });
    const archived = makeRule({ frequency: "everyMonth", anchorDate: "2026-01-01", archived: true });
    expect(generateOccurrences(paused, YEAR_2026)).toEqual([]);
    expect(generateOccurrences(archived, YEAR_2026)).toEqual([]);
  });
});

describe("recurrence engine — nextOccurrence", () => {
  it("finds the next monthly occurrence on or after a date", () => {
    const rule = makeRule({ frequency: "everyMonth", anchorDate: "2026-01-15" });
    expect(nextOccurrence(rule, "2026-03-20")).toBe("2026-04-15");
    expect(nextOccurrence(rule, "2026-04-15")).toBe("2026-04-15"); // inclusive
  });

  it("returns the anchor when asked from before it starts", () => {
    const rule = makeRule({ frequency: "everyMonth", anchorDate: "2026-06-01" });
    expect(nextOccurrence(rule, "2026-01-01")).toBe("2026-06-01");
  });

  it("returns null for a oneTime already in the past, and the anchor otherwise", () => {
    const rule = makeRule({ frequency: "oneTime", anchorDate: "2026-03-15" });
    expect(nextOccurrence(rule, "2026-04-01")).toBeNull();
    expect(nextOccurrence(rule, "2026-01-01")).toBe("2026-03-15");
  });

  it("returns null when the end date cuts off future occurrences", () => {
    const rule = makeRule({ frequency: "everyMonth", anchorDate: "2026-01-01", endDate: "2026-02-01" });
    expect(nextOccurrence(rule, "2026-03-01")).toBeNull();
  });

  it("handles week-based and yearly-clamped next dates", () => {
    expect(nextOccurrence(makeRule({ frequency: "everyWeek", anchorDate: "2026-01-01" }), "2026-01-05")).toBe(
      "2026-01-08",
    );
    expect(nextOccurrence(makeRule({ frequency: "everyYear", anchorDate: "2024-02-29" }), "2026-01-01")).toBe(
      "2026-02-28",
    );
  });
});
