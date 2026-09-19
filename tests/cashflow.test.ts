import { describe, it, expect } from "vitest";
import { projectCashflow, safeToSpend } from "@/domain/cashflow";
import type { Occurrence, OccurrenceStatus } from "@/domain/occurrences";
import type { DateRange } from "@/lib/period";
import { makeAccount, makeTx } from "./fixtures";

const TODAY = "2026-06-15";
const JUNE: DateRange = { from: "2026-06-01", to: "2026-06-30" };

function occ(over: Partial<Occurrence> & { date: string; direction: "in" | "out"; amount: number; status: OccurrenceStatus }): Occurrence {
  return {
    ruleId: "r1",
    displayDate: over.date,
    type: over.direction === "in" ? "income" : "expense",
    categoryId: null,
    accountId: "acc1",
    personId: null,
    ...over,
  };
}

// A single account of Rs 100,000 with no transactions -> totalBalance = 100,000.
function accountsWith(openingMinor: number) {
  return [makeAccount({ id: "acc1", openingBalance: openingMinor })];
}

describe("cash-flow projection (§8.3)", () => {
  it("walks unpaid occurrences in date order to a hand-computed running balance", () => {
    const accounts = accountsWith(100000_00);
    const occurrences: Occurrence[] = [
      occ({ date: "2026-06-10", direction: "out", amount: 10000_00, status: "overdue" }),
      occ({ date: "2026-06-20", direction: "in", amount: 50000_00, status: "upcoming" }),
      occ({ date: "2026-06-25", direction: "out", amount: 30000_00, status: "upcoming" }),
    ];
    const p = projectCashflow(accounts, [], occurrences, JUNE, TODAY);

    expect(p.startBalance).toBe(100000_00);
    expect(p.startDate).toBe(TODAY);
    expect(p.series).toEqual([
      { date: "2026-06-10", projectedBalance: 90000_00 }, // 100,000 - 10,000
      { date: "2026-06-20", projectedBalance: 140000_00 }, // + 50,000
      { date: "2026-06-25", projectedBalance: 110000_00 }, // - 30,000
    ]);
    expect(p.minProjectedBalance).toBe(90000_00);
  });

  it("unpaid-only guard: a PAID occurrence never changes the projection", () => {
    // A paid Rs 20,000 expense is already a cleared transaction in the balance.
    const accounts = accountsWith(100000_00);
    const paidTx = makeTx({ accountId: "acc1", amount: 20000_00, type: "expense", direction: "out", cleared: true });
    const balanceAfterPaid = 80000_00; // 100,000 - 20,000

    const withPaid: Occurrence[] = [
      occ({ date: "2026-06-10", direction: "out", amount: 20000_00, status: "paid" }),
      occ({ date: "2026-06-25", direction: "out", amount: 30000_00, status: "upcoming" }),
    ];
    const withoutPaid = withPaid.filter((o) => o.status !== "paid");

    const a = projectCashflow(accounts, [paidTx], withPaid, JUNE, TODAY);
    const b = projectCashflow(accounts, [paidTx], withoutPaid, JUNE, TODAY);

    expect(a.startBalance).toBe(balanceAfterPaid);
    expect(a.series).toEqual([{ date: "2026-06-25", projectedBalance: 50000_00 }]); // only the unpaid one
    expect(a.series).toEqual(b.series); // adding the paid occurrence changed nothing
    expect(a.minProjectedBalance).toBe(50000_00);
  });
});

describe("Safe to Spend (§8.4) — default endOfMonth", () => {
  it("subtracts unpaid out-commitments due by month end, including overdue ones", () => {
    const accounts = accountsWith(100000_00);
    const occurrences: Occurrence[] = [
      occ({ date: "2026-06-10", direction: "out", amount: 10000_00, status: "overdue" }), // owed, included
      occ({ date: "2026-06-20", direction: "out", amount: 30000_00, status: "upcoming" }), // due by 06-30, included
      occ({ date: "2026-07-05", direction: "out", amount: 40000_00, status: "upcoming" }), // next month, excluded
      occ({ date: "2026-06-25", direction: "in", amount: 50000_00, status: "upcoming" }), // income, not credited (FD-2)
    ];
    const r = safeToSpend(accounts, [], occurrences, TODAY);

    expect(r.horizonEnd).toBe("2026-06-30");
    expect(r.reserved.map((o) => o.amount)).toEqual([10000_00, 30000_00]);
    expect(r.reservedTotal).toBe(40000_00);
    expect(r.amount).toBe(60000_00); // 100,000 - 10,000 - 30,000
  });

  it("equals the balance when there are no upcoming commitments", () => {
    const accounts = accountsWith(75000_00);
    expect(safeToSpend(accounts, [], [], TODAY).amount).toBe(75000_00);
  });

  it("goes negative (never clamped) when commitments exceed the balance", () => {
    const accounts = accountsWith(20000_00);
    const occurrences: Occurrence[] = [
      occ({ date: "2026-06-10", direction: "out", amount: 10000_00, status: "overdue" }),
      occ({ date: "2026-06-20", direction: "out", amount: 30000_00, status: "upcoming" }),
    ];
    expect(safeToSpend(accounts, [], occurrences, TODAY).amount).toBe(-20000_00); // 20,000 - 40,000
  });

  it("handles a horizon spanning a month/year boundary", () => {
    const accounts = accountsWith(100000_00);
    const today = "2026-12-20";
    const occurrences: Occurrence[] = [
      occ({ date: "2026-12-28", direction: "out", amount: 15000_00, status: "upcoming" }), // in December, included
      occ({ date: "2027-01-05", direction: "out", amount: 25000_00, status: "upcoming" }), // next year, excluded
    ];
    const r = safeToSpend(accounts, [], occurrences, today);
    expect(r.horizonEnd).toBe("2026-12-31");
    expect(r.amount).toBe(85000_00);
  });

  it("credits expected income only when explicitly opted in (FD-2)", () => {
    const accounts = accountsWith(100000_00);
    const occurrences: Occurrence[] = [
      occ({ date: "2026-06-20", direction: "out", amount: 30000_00, status: "upcoming" }),
      occ({ date: "2026-06-25", direction: "in", amount: 50000_00, status: "upcoming" }),
    ];
    expect(safeToSpend(accounts, [], occurrences, TODAY).amount).toBe(70000_00); // default: income NOT credited
    expect(safeToSpend(accounts, [], occurrences, TODAY, { mode: "endOfMonth", creditExpectedIncome: true }).amount).toBe(
      120000_00, // 100,000 - 30,000 + 50,000
    );
  });
});

describe("Safe to Spend (§8.4) — horizon modes", () => {
  const accounts = accountsWith(100000_00);
  const occurrences: Occurrence[] = [
    occ({ date: "2026-06-20", direction: "out", amount: 30000_00, status: "upcoming" }),
    occ({ date: "2026-06-25", direction: "in", amount: 50000_00, status: "upcoming" }),
    occ({ date: "2026-06-28", direction: "out", amount: 20000_00, status: "upcoming" }),
  ];

  it("rollingDays uses today + N as the horizon end", () => {
    const r = safeToSpend(accounts, [], occurrences, TODAY, { mode: "rollingDays", rollingDays: 10 });
    expect(r.horizonEnd).toBe("2026-06-25"); // 2026-06-15 + 10 days
    expect(r.reserved.map((o) => o.amount)).toEqual([30000_00]); // only the 06-20 out; 06-28 is beyond
    expect(r.amount).toBe(70000_00);
  });

  it("nextIncome uses the next upcoming income date as the horizon end", () => {
    const r = safeToSpend(accounts, [], occurrences, TODAY, { mode: "nextIncome" });
    expect(r.horizonEnd).toBe("2026-06-25"); // the next income occurrence
    expect(r.reserved.map((o) => o.amount)).toEqual([30000_00]); // out due on/before 06-25
    expect(r.amount).toBe(70000_00);
  });

  it("nextIncome falls back to month end when no upcoming income exists", () => {
    const outsOnly: Occurrence[] = [occ({ date: "2026-06-20", direction: "out", amount: 30000_00, status: "upcoming" })];
    const r = safeToSpend(accounts, [], outsOnly, TODAY, { mode: "nextIncome" });
    expect(r.horizonEnd).toBe("2026-06-30");
  });
});

describe("Safe to Spend (§8.3) — Safety Floor (FD-4.3, soft)", () => {
  it("subtracts the floor exactly, and floor 0 leaves the number unchanged", () => {
    const accounts = accountsWith(100000_00);
    const occurrences: Occurrence[] = [
      occ({ date: "2026-06-20", direction: "out", amount: 30000_00, status: "upcoming" }),
    ];
    const base = safeToSpend(accounts, [], occurrences, TODAY, { mode: "endOfMonth" });
    expect(base.amount).toBe(70000_00); // 100,000 - 30,000
    expect(base.safetyFloor).toBe(0);

    const floor0 = safeToSpend(accounts, [], occurrences, TODAY, { mode: "endOfMonth", safetyFloor: 0 });
    expect(floor0.amount).toBe(base.amount); // floor 0 changes nothing

    const withFloor = safeToSpend(accounts, [], occurrences, TODAY, { mode: "endOfMonth", safetyFloor: 25000_00 });
    expect(withFloor.safetyFloor).toBe(25000_00);
    expect(withFloor.amount).toBe(45000_00); // exactly base − floor (70,000 − 25,000)
  });

  it("the floor can push Safe to Spend negative — shown honestly, never clamped", () => {
    const accounts = accountsWith(20000_00);
    const r = safeToSpend(accounts, [], [], TODAY, { mode: "endOfMonth", safetyFloor: 50000_00 });
    expect(r.amount).toBe(-30000_00); // 20,000 − 0 commitments − 50,000
  });
});
