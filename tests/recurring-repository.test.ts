import "fake-indexeddb/auto";
import { describe, it, expect } from "vitest";
import { createDB } from "@/data/db";
import { FinanceRepository } from "@/data/repository";
import { accountBalance } from "@/domain/balance";
import { moneyOut } from "@/domain/aggregation";
import { monthRange } from "@/lib/period";
import type { Account, Category, RecurringRule } from "@/domain/types";

let counter = 0;
const dbName = () => `test-recurring-${Date.now()}-${++counter}`;

async function setup() {
  const db = createDB(dbName());
  const repo = new FinanceRepository(db);
  const acc = await repo.createAccount({
    name: "Everyday", type: "checking", openingBalance: 100000_00, currencyCode: "PKR", archived: false,
  });
  const cat = await repo.createCategory({
    name: "Rent", bucket: "bills", needsWantsSavings: "needs", color: "#fff", archived: false,
  });
  return { db, repo, acc, cat };
}

function ruleInput(
  acc: Account,
  cat: Category,
  over: Partial<Omit<RecurringRule, "id" | "createdAt" | "updatedAt">> = {},
) {
  return {
    name: "Rent",
    amount: 50000_00,
    direction: "out" as const,
    type: "expense" as const,
    categoryId: cat.id,
    accountId: acc.id,
    personId: null,
    frequency: "everyMonth" as const,
    anchorDate: "2026-01-01",
    endDate: null,
    ...over,
  };
}

describe("repository — recurring rules", () => {
  it("persists a rule and rounds-trips it with sensible defaults", async () => {
    const { repo, acc, cat } = await setup();
    const rule = await repo.createRecurringRule(ruleInput(acc, cat));
    expect(rule.active).toBe(true);
    expect(rule.archived).toBe(false);
    expect(rule.goalId).toBeNull();

    const fetched = await repo.getRecurringRule(rule.id);
    expect(fetched?.name).toBe("Rent");
    expect(fetched?.amount).toBe(50000_00);
    expect(await repo.listRecurringRules()).toHaveLength(1);
  });

  it("rejects a rule referencing a missing account, group, or person", async () => {
    const { repo, acc, cat } = await setup();
    await expect(repo.createRecurringRule(ruleInput(acc, cat, { accountId: "nope" }))).rejects.toThrow(/account/i);
    await expect(repo.createRecurringRule(ruleInput(acc, cat, { categoryId: "nope" }))).rejects.toThrow(/category/i);
    await expect(repo.createRecurringRule(ruleInput(acc, cat, { personId: "nope" }))).rejects.toThrow(/person/i);
  });

  it("pauses, resumes, and archives a rule", async () => {
    const { repo, acc, cat } = await setup();
    const rule = await repo.createRecurringRule(ruleInput(acc, cat));

    await repo.pauseRecurringRule(rule.id);
    expect((await repo.getRecurringRule(rule.id))?.active).toBe(false);
    await repo.resumeRecurringRule(rule.id);
    expect((await repo.getRecurringRule(rule.id))?.active).toBe(true);

    await repo.archiveRecurringRule(rule.id);
    expect((await repo.getRecurringRule(rule.id))?.archived).toBe(true);
    expect(await repo.listRecurringRules()).toHaveLength(0); // hidden from active list
    expect(await repo.listRecurringRules(true)).toHaveLength(1); // still there for history
  });

  it("hard-deletes a rule with no payments, but refuses (archive instead) once one exists", async () => {
    const { repo, acc, cat } = await setup();
    const unused = await repo.createRecurringRule(ruleInput(acc, cat));
    await repo.deleteRecurringRule(unused.id);
    expect(await repo.getRecurringRule(unused.id)).toBeUndefined();

    const used = await repo.createRecurringRule(ruleInput(acc, cat));
    await repo.createTransactionFromOccurrence(used, "2026-02-01"); // links a transaction
    await expect(repo.deleteRecurringRule(used.id)).rejects.toThrow(/archive/i);
    expect(await repo.getRecurringRule(used.id)).toBeDefined(); // still there
  });
});

describe("repository — recurring overrides (exceptions only)", () => {
  it("enforces one override per (rule, occurrence): a second call updates, never duplicates", async () => {
    const { repo, acc, cat } = await setup();
    const rule = await repo.createRecurringRule(ruleInput(acc, cat));

    const o1 = await repo.createOrUpdateOverride({ ruleId: rule.id, occurrenceDate: "2026-03-01", action: "skip" });
    const o2 = await repo.createOrUpdateOverride({
      ruleId: rule.id, occurrenceDate: "2026-03-01", action: "adjust", adjustedAmount: 40000_00, adjustedDate: "2026-03-05",
    });

    expect(o2.id).toBe(o1.id); // updated in place
    const list = await repo.listRecurringOverrides(rule.id);
    expect(list).toHaveLength(1);
    expect(list[0].action).toBe("adjust");
    expect(list[0].adjustedAmount).toBe(40000_00);
    expect(list[0].adjustedDate).toBe("2026-03-05");

    // Switching back to skip clears the adjusted fields (no stale data).
    await repo.createOrUpdateOverride({ ruleId: rule.id, occurrenceDate: "2026-03-01", action: "skip" });
    const after = await repo.getOverride(rule.id, "2026-03-01");
    expect(after?.action).toBe("skip");
    expect(after?.adjustedAmount).toBeUndefined();
  });

  it("deletes an override, and cascades override cleanup on a rule hard-delete (no orphans)", async () => {
    const { repo, acc, cat } = await setup();
    const rule = await repo.createRecurringRule(ruleInput(acc, cat));

    await repo.createOrUpdateOverride({ ruleId: rule.id, occurrenceDate: "2026-03-01", action: "skip" });
    await repo.deleteOverride(rule.id, "2026-03-01");
    expect(await repo.listRecurringOverrides(rule.id)).toHaveLength(0);

    await repo.createOrUpdateOverride({ ruleId: rule.id, occurrenceDate: "2026-04-01", action: "skip" });
    await repo.deleteRecurringRule(rule.id); // no linked transactions -> hard delete
    expect(await repo.listRecurringOverrides(rule.id)).toHaveLength(0); // no orphaned overrides
  });
});

describe("repository — occurrence → transaction", () => {
  it("creates a linked recurring transaction that flows into balances and totals like a manual one", async () => {
    const { repo, acc, cat } = await setup();
    const rule = await repo.createRecurringRule(ruleInput(acc, cat)); // Rs 50,000 out, monthly

    const tx = await repo.createTransactionFromOccurrence(rule, "2026-02-01");
    expect(tx.source).toBe("recurring");
    expect(tx.recurringRuleId).toBe(rule.id);
    expect(tx.occurrenceDate).toBe("2026-02-01");
    expect(tx.date).toBe("2026-02-01");
    expect(tx.amount).toBe(50000_00);
    expect(tx.direction).toBe("out");
    expect(tx.type).toBe("expense");
    expect(tx.categoryId).toBe(cat.id);
    expect(tx.accountId).toBe(acc.id);
    expect(tx.cleared).toBe(true);

    const txns = await repo.listTransactions();
    // Balance moved exactly like a manual expense: 100,000 - 50,000 = 50,000.
    expect(accountBalance(acc, txns)).toBe(50000_00);
    // Aggregation counts it as money going out for February.
    expect(moneyOut(txns, monthRange({ year: 2026, month: 2 }))).toBe(50000_00);
  });

  it("applies an 'adjust' override to amount/date but keeps the occurrenceDate key", async () => {
    const { repo, acc, cat } = await setup();
    const rule = await repo.createRecurringRule(ruleInput(acc, cat));

    await repo.createOrUpdateOverride({
      ruleId: rule.id, occurrenceDate: "2026-03-01", action: "adjust", adjustedAmount: 45000_00, adjustedDate: "2026-03-05",
    });
    const tx = await repo.createTransactionFromOccurrence(rule, "2026-03-01");
    expect(tx.amount).toBe(45000_00); // adjusted amount
    expect(tx.date).toBe("2026-03-05"); // moved to the adjusted actual date
    expect(tx.occurrenceDate).toBe("2026-03-01"); // still keyed to the original scheduled date
  });

  it("honors FD-5: an uncleared recurring transaction still links but does not move the balance", async () => {
    const { repo, acc, cat } = await setup();
    const rule = await repo.createRecurringRule(ruleInput(acc, cat));
    const tx = await repo.createTransactionFromOccurrence(rule, "2026-02-01", { cleared: false });
    expect(tx.recurringRuleId).toBe(rule.id);
    expect(tx.occurrenceDate).toBe("2026-02-01");
    const txns = await repo.listTransactions();
    expect(accountBalance(acc, txns)).toBe(100000_00); // uncleared -> balance unchanged
  });
});
