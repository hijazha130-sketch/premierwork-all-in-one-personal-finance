import "fake-indexeddb/auto";
import { describe, it, expect } from "vitest";
import { createDB } from "@/data/db";
import { FinanceRepository } from "@/data/repository";
import { sumTransactions } from "@/domain/aggregation";

let counter = 0;
const dbName = () => `test-goals-debt-repo-${Date.now()}-${++counter}`;

async function setup() {
  const db = createDB(dbName());
  const repo = new FinanceRepository(db);
  const account = await repo.createAccount({ name: "Everyday", type: "checking", openingBalance: 100000_00, currencyCode: "PKR", archived: false });
  const savings = await repo.createCategory({ name: "Savings", bucket: "savings", needsWantsSavings: "savings", color: "#fff", archived: false });
  return { db, repo, account, savings };
}

describe("repository — goals", () => {
  it("creates, reads, lists and persists a goal across a restart", async () => {
    const name = dbName();
    let db = createDB(name);
    let repo = new FinanceRepository(db);
    const g = await repo.createGoal({
      name: "Emergency fund", targetAmount: 300000_00, startingAmount: 50000_00,
      targetDate: "2027-06-30", monthlyContribution: 25000_00, categoryId: null,
    });
    expect(g.archived).toBe(false); // defaulted
    expect(g.completedAt).toBeNull(); // defaulted
    db.close();

    db = createDB(name);
    repo = new FinanceRepository(db);
    const back = await repo.getGoal(g.id);
    expect(back?.targetAmount).toBe(300000_00);
    expect(back?.startingAmount).toBe(50000_00);
    expect(await repo.listGoals()).toHaveLength(1);
    db.close();
  });

  it("rejects a goal whose categoryId does not exist, accepts a real one", async () => {
    const { repo, savings } = await setup();
    await expect(
      repo.createGoal({ name: "Trip", targetAmount: 100000_00, startingAmount: 0, targetDate: null, monthlyContribution: null, categoryId: "nope" }),
    ).rejects.toThrow(/category/i);
    const ok = await repo.createGoal({ name: "Trip", targetAmount: 100000_00, startingAmount: 0, targetDate: null, monthlyContribution: null, categoryId: savings.id });
    expect(ok.categoryId).toBe(savings.id);
  });

  it("archives a goal (drops from the default list, restore brings it back)", async () => {
    const { repo } = await setup();
    const g = await repo.createGoal({ name: "Car", targetAmount: 500000_00, startingAmount: 0, targetDate: null, monthlyContribution: null, categoryId: null });
    await repo.archiveGoal(g.id);
    expect((await repo.listGoals()).find((x) => x.id === g.id)).toBeUndefined();
    expect((await repo.listGoals(true)).find((x) => x.id === g.id)?.archived).toBe(true);
    await repo.restoreGoal(g.id);
    expect((await repo.listGoals()).find((x) => x.id === g.id)?.archived).toBe(false);
  });

  it("hard-deletes a goal only when no transaction references it", async () => {
    const { repo, account } = await setup();
    const g1 = await repo.createGoal({ name: "Unused", targetAmount: 100000_00, startingAmount: 0, targetDate: null, monthlyContribution: null, categoryId: null });
    // No contributions → deletable.
    await repo.deleteGoal(g1.id);
    expect(await repo.getGoal(g1.id)).toBeUndefined();

    const g2 = await repo.createGoal({ name: "Funded", targetAmount: 100000_00, startingAmount: 0, targetDate: null, monthlyContribution: null, categoryId: null });
    await repo.recordContribution(g2, { amount: 5000_00, date: "2026-09-15", accountId: account.id });
    await expect(repo.deleteGoal(g2.id)).rejects.toThrow(/archive/i);
    // Still present after the rejected delete.
    expect(await repo.getGoal(g2.id)).toBeDefined();
  });
});

describe("repository — debts", () => {
  it("creates, reads, lists and persists a debt across a restart", async () => {
    const name = dbName();
    let db = createDB(name);
    let repo = new FinanceRepository(db);
    const d = await repo.createDebt({
      name: "Credit card", currentBalance: 120000_00, annualInterestRate: 24,
      minimumPayment: 5000_00, balanceAsOf: "2026-09-01",
    });
    expect(d.archived).toBe(false); // defaulted
    expect(d.paidOffAt).toBeNull(); // defaulted
    expect(d.customOrder).toBeNull(); // defaulted
    db.close();

    db = createDB(name);
    repo = new FinanceRepository(db);
    const back = await repo.getDebt(d.id);
    expect(back?.currentBalance).toBe(120000_00);
    expect(back?.annualInterestRate).toBe(24);
    expect(await repo.listDebts()).toHaveLength(1);
    db.close();
  });

  it("archives a debt (drops from the default list, restore brings it back)", async () => {
    const { repo } = await setup();
    const d = await repo.createDebt({ name: "Loan", currentBalance: 200000_00, annualInterestRate: 12, minimumPayment: 10000_00, balanceAsOf: "2026-09-01" });
    await repo.archiveDebt(d.id);
    expect((await repo.listDebts()).find((x) => x.id === d.id)).toBeUndefined();
    expect((await repo.listDebts(true)).find((x) => x.id === d.id)?.archived).toBe(true);
    await repo.restoreDebt(d.id);
    expect((await repo.listDebts()).find((x) => x.id === d.id)?.archived).toBe(false);
  });

  it("hard-deletes a debt only when no transaction references it", async () => {
    const { repo, account } = await setup();
    const d1 = await repo.createDebt({ name: "Unused", currentBalance: 100000_00, annualInterestRate: 10, minimumPayment: 5000_00, balanceAsOf: "2026-09-01" });
    await repo.deleteDebt(d1.id);
    expect(await repo.getDebt(d1.id)).toBeUndefined();

    const d2 = await repo.createDebt({ name: "Paid", currentBalance: 100000_00, annualInterestRate: 10, minimumPayment: 5000_00, balanceAsOf: "2026-09-01" });
    await repo.recordDebtPayment(d2, { amount: 5000_00, date: "2026-09-15", accountId: account.id });
    await expect(repo.deleteDebt(d2.id)).rejects.toThrow(/archive/i);
    expect(await repo.getDebt(d2.id)).toBeDefined();
  });
});

describe("repository — linked-transaction helpers", () => {
  it("recordContribution logs an out expense with goalId set, defaulting the goal's category", async () => {
    const { repo, account, savings } = await setup();
    const goal = await repo.createGoal({ name: "Fund", targetAmount: 100000_00, startingAmount: 0, targetDate: null, monthlyContribution: null, categoryId: savings.id });
    const tx = await repo.recordContribution(goal, { amount: 5000_00, date: "2026-09-15", accountId: account.id });

    expect(tx.goalId).toBe(goal.id);
    expect(tx.debtId).toBeNull();
    expect(tx.type).toBe("expense");
    expect(tx.direction).toBe("out");
    expect(tx.amount).toBe(5000_00);
    expect(tx.date).toBe("2026-09-15");
    expect(tx.source).toBe("manual");
    expect(tx.categoryId).toBe(savings.id); // defaulted from the goal

    // The aggregation sees it like any real out-expense.
    const txns = await repo.listTransactions();
    expect(sumTransactions(txns, { type: "expense", direction: "out" })).toBe(5000_00);
    // And it is discoverable by its goal link.
    expect(txns.filter((t) => t.goalId === goal.id)).toHaveLength(1);
  });

  it("recordContribution honors an explicit categoryId override (incl. null)", async () => {
    const { repo, account, savings } = await setup();
    const goal = await repo.createGoal({ name: "Fund", targetAmount: 100000_00, startingAmount: 0, targetDate: null, monthlyContribution: null, categoryId: savings.id });
    const tx = await repo.recordContribution(goal, { amount: 1000_00, date: "2026-09-15", accountId: account.id, categoryId: null });
    expect(tx.categoryId).toBeNull(); // explicit null wins over the goal default
  });

  it("recordDebtPayment logs an out expense with debtId set and does NOT change the balance (FD-4.1)", async () => {
    const { repo, account } = await setup();
    const debt = await repo.createDebt({ name: "Card", currentBalance: 120000_00, annualInterestRate: 24, minimumPayment: 5000_00, balanceAsOf: "2026-09-01" });
    const tx = await repo.recordDebtPayment(debt, { amount: 5000_00, date: "2026-09-20", accountId: account.id });

    expect(tx.debtId).toBe(debt.id);
    expect(tx.goalId).toBeNull();
    expect(tx.type).toBe("expense");
    expect(tx.direction).toBe("out");
    expect(tx.amount).toBe(5000_00);

    // FD-4.1: the payment is logged but the stored balance is untouched.
    expect((await repo.getDebt(debt.id))?.currentBalance).toBe(120000_00);
    // Payment history is discoverable by the debt link.
    const txns = await repo.listTransactions();
    expect(txns.filter((t) => t.debtId === debt.id)).toHaveLength(1);
  });

  it("a contribution rejects a missing funding account (integrity runs via createTransaction)", async () => {
    const { repo } = await setup();
    const goal = await repo.createGoal({ name: "Fund", targetAmount: 100000_00, startingAmount: 0, targetDate: null, monthlyContribution: null, categoryId: null });
    await expect(
      repo.recordContribution(goal, { amount: 1000_00, date: "2026-09-15", accountId: "missing" }),
    ).rejects.toThrow(/account/i);
  });
});
