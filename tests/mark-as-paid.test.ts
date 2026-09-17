import "fake-indexeddb/auto";
import { describe, it, expect } from "vitest";
import { createDB } from "@/data/db";
import { FinanceRepository } from "@/data/repository";
import { computeOccurrences } from "@/domain/occurrences";
import { totalBalance } from "@/domain/balance";
import { safeToSpend } from "@/domain/cashflow";
import type { DateRange } from "@/lib/period";

let counter = 0;
const dbName = () => `test-markpaid-${Date.now()}-${++counter}`;

const TODAY = "2026-06-15";
const JUNE: DateRange = { from: "2026-06-01", to: "2026-06-30" };

async function setup() {
  const db = createDB(dbName());
  const repo = new FinanceRepository(db);
  const acc = await repo.createAccount({
    name: "Everyday", type: "checking", openingBalance: 100000_00, currencyCode: "PKR", archived: false,
  });
  // Rent Rs 60,000, monthly, first due 2026-06-05 (overdue relative to 2026-06-15).
  const rule = await repo.createRecurringRule({
    name: "Rent", amount: 60000_00, direction: "out", type: "expense",
    categoryId: null, accountId: acc.id, personId: null,
    frequency: "everyMonth", anchorDate: "2026-06-05", endDate: null,
  });
  return { db, repo, acc, rule };
}

describe("Mark as paid — the full loop (occurrence → transaction → back)", () => {
  it("confirming an overdue bill flips it to paid, drops the balance, and leaves Safe to Spend unchanged", async () => {
    const { repo, acc, rule } = await setup();

    // Before: the bill is overdue and reserved against Safe to Spend.
    const before = computeOccurrences([rule], [], [], JUNE, TODAY);
    expect(before.find((o) => o.date === "2026-06-05")?.status).toBe("overdue");
    expect(totalBalance([acc], [])).toBe(100000_00);
    const safeBefore = safeToSpend([acc], [], before, TODAY).amount;
    expect(safeBefore).toBe(40000_00); // 100,000 − 60,000 reserved

    // Mark as paid → a real transaction via the single existing path.
    const tx = await repo.createTransactionFromOccurrence(rule, "2026-06-05");
    expect(tx.source).toBe("recurring");
    expect(tx.recurringRuleId).toBe(rule.id);
    expect(tx.occurrenceDate).toBe("2026-06-05");

    const txns = await repo.listTransactions();
    const after = computeOccurrences([rule], txns, [], JUNE, TODAY);
    expect(after.find((o) => o.date === "2026-06-05")?.status).toBe("paid"); // flips to paid
    expect(totalBalance([acc], txns)).toBe(40000_00); // balance dropped by the amount
    // Safe to Spend is UNCHANGED: the reserve was released as the balance dropped
    // (no double count). This is the correct behavior, not a second drop.
    expect(safeToSpend([acc], txns, after, TODAY).amount).toBe(safeBefore);
  });

  it("deleting that transaction returns the bill to overdue and restores the balance", async () => {
    const { repo, acc, rule } = await setup();
    const tx = await repo.createTransactionFromOccurrence(rule, "2026-06-05");
    // Sanity: paid now.
    let txns = await repo.listTransactions();
    expect(computeOccurrences([rule], txns, [], JUNE, TODAY).find((o) => o.date === "2026-06-05")?.status).toBe("paid");

    await repo.deleteTransaction(tx.id);
    txns = await repo.listTransactions();
    expect(txns).toHaveLength(0);
    expect(computeOccurrences([rule], txns, [], JUNE, TODAY).find((o) => o.date === "2026-06-05")?.status).toBe("overdue");
    expect(totalBalance([acc], txns)).toBe(100000_00); // balance restored
  });

  it("skipping a bill flips it to skipped with no transaction and no balance change", async () => {
    const { repo, acc, rule } = await setup();
    await repo.createOrUpdateOverride({ ruleId: rule.id, occurrenceDate: "2026-06-05", action: "skip" });

    const overrides = await repo.listRecurringOverrides();
    const txns = await repo.listTransactions();
    expect(txns).toHaveLength(0); // no money moved
    const occ = computeOccurrences([rule], txns, overrides, JUNE, TODAY);
    expect(occ.find((o) => o.date === "2026-06-05")?.status).toBe("skipped");
    expect(totalBalance([acc], txns)).toBe(100000_00); // unchanged
    // A skipped item is not reserved, so Safe to Spend equals the full balance.
    expect(safeToSpend([acc], txns, occ, TODAY).amount).toBe(100000_00);
  });
});
