import { describe, it, expect } from "vitest";
import { sumTransactions, moneyIn, moneyOut, filterTransactions, spendingByCategory } from "@/domain/aggregation";
import { monthRange } from "@/lib/period";
import { makeTx, makeTransfer } from "./fixtures";
import type { Category } from "@/domain/types";

const SEP = monthRange({ year: 2026, month: 9 });

describe("aggregation selectors — the one query behind every total", () => {
  const txns = [
    makeTx({ accountId: "a", type: "income", direction: "in", amount: 3000_00, date: "2026-09-01", categoryId: "salary" }),
    makeTx({ accountId: "a", type: "expense", direction: "out", amount: 200_00, date: "2026-09-05", categoryId: "food" }),
    makeTx({ accountId: "a", type: "expense", direction: "out", amount: 150_00, date: "2026-09-10", categoryId: "food" }),
    makeTx({ accountId: "a", type: "expense", direction: "out", amount: 500_00, date: "2026-08-30", categoryId: "food" }), // prior month
    ...makeTransfer("a", "b", 1000_00, "2026-09-12"),
  ];

  it("money out for the month excludes transfers and other months", () => {
    expect(moneyOut(txns, SEP)).toBe(350_00); // 200 + 150 only
  });

  it("money in for the month", () => {
    expect(moneyIn(txns, SEP)).toBe(3000_00);
  });

  it("transfers are excluded from spending totals by default", () => {
    const all = sumTransactions(txns, { range: SEP });
    // default: only cleared, no transfers, both directions summed by amount
    // in(3000) + out(200+150) = 3350 (amounts are positive; this is a raw sum)
    expect(all).toBe(3350_00);
  });

  it("filters by category", () => {
    expect(sumTransactions(txns, { categoryId: "food", type: "expense", range: SEP })).toBe(350_00);
  });

  it("groups spending by category for a month", () => {
    const byCat = spendingByCategory(txns, SEP);
    expect(byCat["food"]).toBe(350_00);
    expect(byCat["salary"]).toBeUndefined(); // income, not spending
  });

  it("filterTransactions can include transfers when asked", () => {
    const withTransfers = filterTransactions(txns, { range: SEP, includeTransfers: true });
    expect(withTransfers.some((t) => t.type === "transfer")).toBe(true);
  });

  it("bucket lens uses the category lookup", () => {
    const cats = new Map<string, Category>([
      ["food", { id: "food", name: "Food", bucket: "expenses", needsWantsSavings: "needs", color: "#fff", archived: false, createdAt: 0, updatedAt: 0 }],
    ]);
    expect(sumTransactions(txns, { bucket: "expenses", type: "expense", range: SEP }, cats)).toBe(350_00);
  });
});
