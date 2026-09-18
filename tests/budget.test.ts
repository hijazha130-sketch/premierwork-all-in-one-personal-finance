import { describe, it, expect } from "vitest";
import {
  effectivePlanned,
  computeBudgetPeriod,
  leftToAssign,
  fiftyThirtyTwenty,
  share,
  type BudgetInput,
} from "@/domain/budget";
import { sumTransactions } from "@/domain/aggregation";
import { monthRange } from "@/lib/period";
import { makeTx } from "./fixtures";
import type { BudgetMethod, BudgetPeriodLine, BudgetTemplate, Category, CategoryBucket, IncomeSource, NeedsWantsSavings } from "@/domain/types";

function cat(id: string, bucket: CategoryBucket, nws: NeedsWantsSavings = "none"): Category {
  return { id, createdAt: 0, updatedAt: 0, name: id, bucket, needsWantsSavings: nws, color: "#fff", archived: false };
}
function template(categoryId: string, plannedAmount: number): BudgetTemplate {
  return { id: `bt_${categoryId}`, createdAt: 0, updatedAt: 0, categoryId, plannedAmount };
}
function line(periodKey: string, categoryId: string, plannedAmount: number): BudgetPeriodLine {
  return { id: `bl_${periodKey}_${categoryId}`, createdAt: 0, updatedAt: 0, periodKey, categoryId, plannedAmount };
}
function incomeSource(defaultAmount?: number): IncomeSource {
  return { id: "is1", createdAt: 0, updatedAt: 0, name: "Salary", defaultAmount, archived: false };
}
function input(
  over: Omit<Partial<BudgetInput>, "settings"> & { settings?: Partial<BudgetInput["settings"]> } = {},
): BudgetInput {
  return {
    categories: over.categories ?? [],
    templates: over.templates ?? [],
    lines: over.lines ?? [],
    transactions: over.transactions ?? [],
    incomeSources: over.incomeSources ?? [],
    settings: {
      budgetMethod: (over.settings?.budgetMethod ?? "zeroBased") as BudgetMethod,
      periodStartMonth: over.settings?.periodStartMonth ?? 1,
      periodStartYear: over.settings?.periodStartYear ?? 2026,
    },
  };
}

describe("budget engine — effective planned (§8.1)", () => {
  it("resolves line override, then template, then 0", () => {
    const templates = [template("food", 15000_00)];
    const lines = [line("2026-09", "food", 20000_00)];
    expect(effectivePlanned(templates, lines, "food", "2026-09")).toBe(20000_00); // override wins
    expect(effectivePlanned(templates, lines, "food", "2026-10")).toBe(15000_00); // template
    expect(effectivePlanned(templates, lines, "rent", "2026-09")).toBe(0); // nothing set
  });
});

describe("budget engine — actual equals the ledger (§8.2)", () => {
  it("spent for a category equals sumTransactions, excluding other months and transfers", () => {
    const food = cat("food", "expenses", "needs");
    const txns = [
      makeTx({ accountId: "a", categoryId: "food", type: "expense", direction: "out", amount: 100_00, date: "2026-09-05" }),
      makeTx({ accountId: "a", categoryId: "food", type: "expense", direction: "out", amount: 150_00, date: "2026-09-20" }),
      makeTx({ accountId: "a", categoryId: "food", type: "expense", direction: "out", amount: 500_00, date: "2026-08-30" }), // prior month
      makeTx({ accountId: "a", categoryId: null, type: "transfer", direction: "out", amount: 999_00, date: "2026-09-10", transferGroupId: "g" }),
    ];
    const b = computeBudgetPeriod(input({ categories: [food], transactions: txns }), "2026-09");
    const foodLine = b.lines.find((l) => l.categoryId === "food")!;
    expect(foodLine.actual).toBe(250_00);
    // …and it equals the ledger aggregation exactly.
    expect(foodLine.actual).toBe(sumTransactions(txns, { type: "expense", categoryId: "food", range: monthRange({ year: 2026, month: 9 }) }));
  });
});

describe("budget engine — carry-over walk (§8.4, load-bearing)", () => {
  const food = cat("food", "expenses", "needs");
  const templates = [template("food", 1000_00)];
  const txns = [
    makeTx({ accountId: "a", categoryId: "food", type: "expense", direction: "out", amount: 800_00, date: "2026-01-15" }),
    makeTx({ accountId: "a", categoryId: "food", type: "expense", direction: "out", amount: 1500_00, date: "2026-02-15" }),
  ];
  const carry = input({ categories: [food], templates, transactions: txns, settings: { budgetMethod: "carryOver", periodStartMonth: 1, periodStartYear: 2026 } });

  const foodOf = (periodKey: string, inp = carry) => computeBudgetPeriod(inp, periodKey).lines.find((l) => l.categoryId === "food")!;

  it("start month has NO carry-in", () => {
    const jan = foodOf("2026-01");
    expect(jan.carryIn).toBe(0);
    expect(jan.available).toBe(1000_00);
    expect(jan.actual).toBe(800_00);
    expect(jan.remaining).toBe(200_00);
  });

  it("a later month adds the prior month's remaining", () => {
    const feb = foodOf("2026-02");
    expect(feb.carryIn).toBe(200_00);
    expect(feb.available).toBe(1200_00);
    expect(feb.actual).toBe(1500_00);
    expect(feb.remaining).toBe(-300_00); // overspent
  });

  it("carries a deficit (negative remaining) forward (FD-3.3)", () => {
    const mar = foodOf("2026-03");
    expect(mar.carryIn).toBe(-300_00);
    expect(mar.available).toBe(700_00);
    expect(mar.remaining).toBe(700_00);
  });

  it("zero-based does not carry", () => {
    const zb = input({ categories: [food], templates, transactions: txns, settings: { budgetMethod: "zeroBased", periodStartMonth: 1, periodStartYear: 2026 } });
    const feb = foodOf("2026-02", zb);
    expect(feb.carryIn).toBe(0);
    expect(feb.available).toBe(1000_00);
    expect(feb.remaining).toBe(-500_00);
    const mar = foodOf("2026-03", zb);
    expect(mar.available).toBe(1000_00);
    expect(mar.remaining).toBe(1000_00);
  });

  it("resets annually at periodStartMonth (April), regardless of prior-month spend", () => {
    const marTx = [makeTx({ accountId: "a", categoryId: "food", type: "expense", direction: "out", amount: 900_00, date: "2026-03-20" })];
    const aprStart = input({ categories: [food], templates: [template("food", 0)], transactions: marTx, settings: { budgetMethod: "carryOver", periodStartMonth: 4, periodStartYear: 2025 } });
    const apr = computeBudgetPeriod(aprStart, "2026-04").lines.find((l) => l.categoryId === "food")!;
    expect(apr.carryIn).toBe(0); // April is the reset — no carry from March
  });
});

describe("budget engine — left to assign (§8.5, zero-based)", () => {
  const salary = cat("salary", "income");
  const food = cat("food", "expenses", "needs");
  const save = cat("save", "savings", "savings");
  const base = (foodPlanned: number, savePlanned: number, incomePlanned = 100000_00) =>
    input({
      categories: [salary, food, save],
      templates: [template("salary", incomePlanned), template("food", foodPlanned), template("save", savePlanned)],
      settings: { budgetMethod: "zeroBased" },
    });

  it("is 0 when income is fully assigned (savings participates, FD-3.4)", () => {
    expect(leftToAssign(base(60000_00, 40000_00), "2026-09")).toBe(0);
  });
  it("is positive when income is under-assigned", () => {
    expect(leftToAssign(base(50000_00, 30000_00), "2026-09")).toBe(20000_00);
  });
  it("is negative when over-allocated", () => {
    expect(leftToAssign(base(70000_00, 50000_00), "2026-09")).toBe(-20000_00);
  });
  it("falls back to IncomeSource.defaultAmount when no income is planned (FD-3.2)", () => {
    const inp = input({
      categories: [salary, food],
      templates: [template("food", 60000_00)], // no salary template
      incomeSources: [incomeSource(90000_00)],
      settings: { budgetMethod: "zeroBased" },
    });
    expect(leftToAssign(inp, "2026-09")).toBe(30000_00); // 90,000 − 60,000
  });
});

describe("budget engine — 50/30/20 (§8.6)", () => {
  it("groups actual spend by tag, keeps 'none' unclassified, and shares of income", () => {
    const cats = [
      cat("salary", "income"),
      cat("food", "expenses", "needs"),
      cat("fun", "expenses", "wants"),
      cat("save", "savings", "savings"),
      cat("misc", "expenses", "none"),
    ];
    const txns = [
      makeTx({ accountId: "a", categoryId: "salary", type: "income", direction: "in", amount: 100000_00, date: "2026-09-01" }),
      makeTx({ accountId: "a", categoryId: "food", type: "expense", direction: "out", amount: 20000_00, date: "2026-09-05" }),
      makeTx({ accountId: "a", categoryId: "fun", type: "expense", direction: "out", amount: 10000_00, date: "2026-09-06" }),
      makeTx({ accountId: "a", categoryId: "save", type: "expense", direction: "out", amount: 15000_00, date: "2026-09-07" }),
      makeTx({ accountId: "a", categoryId: "misc", type: "expense", direction: "out", amount: 5000_00, date: "2026-09-08" }),
    ];
    const r = fiftyThirtyTwenty(input({ categories: cats, transactions: txns }), "2026-09");
    expect(r.income).toBe(100000_00);
    expect(r.needs).toBe(20000_00);
    expect(r.wants).toBe(10000_00);
    expect(r.savings).toBe(15000_00);
    expect(r.unclassified).toBe(5000_00); // "misc" is not forced into a bucket
    expect(r.target).toEqual({ needs: 50, wants: 30, savings: 20 });
    expect(share(r.needs, r.income)).toBe(20); // 20%
    expect(share(r.wants, r.income)).toBe(10);
    expect(share(0, 0)).toBe(0); // no income -> 0, no divide-by-zero
  });
});
