import "fake-indexeddb/auto";
import { describe, it, expect } from "vitest";
import Dexie from "dexie";
import { createDB } from "@/data/db";
import { FinanceRepository } from "@/data/repository";
import { exportDatabase, importDatabase } from "@/data/backup";

let counter = 0;
const dbName = () => `test-finance-${Date.now()}-${++counter}`;

describe("data layer — persistence, integrity, backup, migration", () => {
  it("persists a record and reads it back after a restart", async () => {
    const name = dbName();
    let db = createDB(name);
    let repo = new FinanceRepository(db);
    const acc = await repo.createAccount({ name: "Everyday", type: "checking", openingBalance: 1000_00, currencyCode: "PKR", archived: false });
    await repo.createTransaction({
      date: "2026-09-15",
      amount: 250_00,
      direction: "out",
      type: "expense",
      categoryId: null,
      accountId: acc.id,
      personId: null,
      source: "manual",
      cleared: true,
    });
    db.close();

    // "Restart": a fresh DB instance against the same (persisted) store.
    db = createDB(name);
    repo = new FinanceRepository(db);
    const txns = await repo.listTransactions();
    expect(txns).toHaveLength(1);
    expect(txns[0].amount).toBe(250_00);
    db.close();
  });

  it("archives (never hard-deletes) a dimension that is in use", async () => {
    const db = createDB(dbName());
    const repo = new FinanceRepository(db);
    const acc = await repo.createAccount({ name: "Cash", type: "cash", openingBalance: 0, currencyCode: "PKR", archived: false });
    const cat = await repo.createCategory({ name: "Food", bucket: "expenses", needsWantsSavings: "needs", color: "#fff", archived: false });
    await repo.createTransaction({
      date: "2026-09-15", amount: 100_00, direction: "out", type: "expense",
      categoryId: cat.id, accountId: acc.id, personId: null, source: "manual", cleared: true,
    });

    await expect(repo.deleteCategory(cat.id)).rejects.toThrow(/archive/i);
    await repo.archiveCategory(cat.id);
    const visible = await repo.listCategories();
    expect(visible.find((c) => c.id === cat.id)).toBeUndefined();
    // Historical transaction still resolves the archived category.
    const all = await repo.listCategories(true);
    expect(all.find((c) => c.id === cat.id)?.archived).toBe(true);
    db.close();
  });

  it("deletes both halves of a transfer together", async () => {
    const db = createDB(dbName());
    const repo = new FinanceRepository(db);
    const a = await repo.createAccount({ name: "A", type: "checking", openingBalance: 0, currencyCode: "PKR", archived: false });
    const b = await repo.createAccount({ name: "B", type: "savings", openingBalance: 0, currencyCode: "PKR", archived: false });
    const { out } = await repo.createTransfer({ date: "2026-09-16", amount: 500_00, fromAccountId: a.id, toAccountId: b.id });
    expect(await repo.listTransactions()).toHaveLength(2);
    await repo.deleteTransaction(out.id);
    expect(await repo.listTransactions()).toHaveLength(0);
    db.close();
  });

  it("rejects a transaction that references a missing account", async () => {
    const db = createDB(dbName());
    const repo = new FinanceRepository(db);
    await expect(
      repo.createTransaction({
        date: "2026-09-15", amount: 100_00, direction: "out", type: "expense",
        categoryId: null, accountId: "does-not-exist", personId: null, source: "manual", cleared: true,
      }),
    ).rejects.toThrow(/account/i);
    db.close();
  });

  it("export then import reproduces the exact state", async () => {
    const name1 = dbName();
    const db1 = createDB(name1);
    const repo1 = new FinanceRepository(db1);
    await repo1.saveSettings({ currencyCode: "PKR", currencySymbol: "Rs" });
    const acc = await repo1.createAccount({ name: "Everyday", type: "checking", openingBalance: 1000_00, currencyCode: "PKR", archived: false });
    await repo1.createTransaction({
      date: "2026-09-15", amount: 250_00, direction: "out", type: "expense",
      categoryId: null, accountId: acc.id, personId: null, source: "manual", cleared: true,
    });
    const backup = await exportDatabase(db1);
    db1.close();

    const db2 = createDB(dbName());
    await importDatabase(db2, backup);
    const roundTrip = await exportDatabase(db2);
    expect(roundTrip.data).toEqual(backup.data);
    db2.close();
  });

  it("migrates a v1 database to v2 without data loss", async () => {
    const name = dbName();

    // Stand up a v1-shaped database (categories WITHOUT needsWantsSavings).
    const v1 = new Dexie(name);
    v1.version(1).stores({
      settings: "id",
      accounts: "id, name, type, archived",
      categories: "id, name, bucket, archived",
      people: "id, name, archived",
      incomeSources: "id, name, archived",
      transactions: "id, date, accountId, categoryId, personId, type, direction, transferGroupId, cleared",
    });
    await v1.open();
    await v1.table("categories").put({ id: "c1", name: "Food", bucket: "expenses", color: "#fff", archived: false, createdAt: 0, updatedAt: 0 });
    await v1.table("settings").put({ id: "s1", currencyCode: "PKR", currencySymbol: "Rs", schemaVersion: 1, createdAt: 0, updatedAt: 0 });
    v1.close();

    // Open the current schema; the 1→2 then 2→3 migrations run on startup.
    const db = createDB(name);
    const cat = await db.categories.get("c1");
    expect(cat?.name).toBe("Food"); // data preserved
    expect(cat?.needsWantsSavings).toBe("none"); // 1→2 additive migration applied
    const settings = await db.settings.get("s1");
    expect(settings?.schemaVersion).toBe(5); // migrated all the way to current
    expect(settings?.safeToSpendHorizon).toBe("endOfMonth"); // 2→3 additive default
    expect(settings?.safetyFloor).toBe(0); // 4→5 additive default
    expect(settings?.debtStrategy).toBe("avalanche"); // 4→5 additive default
    db.close();
  });

  it("migrates a v2 database to v3 additively, without data loss", async () => {
    const name = dbName();

    // Stand up a v2-shaped database: categories have needsWantsSavings, but
    // transactions lack recurringRuleId/occurrenceDate and settings lack the
    // Safe-to-Spend horizon.
    const v2 = new Dexie(name);
    v2.version(2).stores({
      settings: "id",
      accounts: "id, name, type, archived",
      categories: "id, name, bucket, needsWantsSavings, archived",
      people: "id, name, archived",
      incomeSources: "id, name, archived",
      transactions: "id, date, accountId, categoryId, personId, type, direction, transferGroupId, cleared",
    });
    await v2.open();
    await v2.table("accounts").put({ id: "a1", name: "Everyday", type: "checking", openingBalance: 1000_00, currencyCode: "PKR", archived: false, createdAt: 0, updatedAt: 0 });
    await v2.table("transactions").put({
      id: "t1", date: "2026-09-15", amount: 250_00, direction: "out", type: "expense",
      categoryId: null, accountId: "a1", personId: null, source: "manual", cleared: true,
      transferGroupId: null, goalId: null, debtId: null, investmentId: null, createdAt: 0, updatedAt: 0,
    });
    await v2.table("settings").put({ id: "s1", currencyCode: "PKR", currencySymbol: "Rs", schemaVersion: 2, setupComplete: true, createdAt: 0, updatedAt: 0 });
    v2.close();

    // Open the current schema; the 2→3 migration runs on startup.
    const db = createDB(name);
    // Existing data intact.
    const acc = await db.accounts.get("a1");
    expect(acc?.openingBalance).toBe(1000_00);
    const tx = await db.transactions.get("t1");
    expect(tx?.amount).toBe(250_00); // unchanged
    // New nullable fields backfilled to null.
    expect(tx?.recurringRuleId).toBeNull();
    expect(tx?.occurrenceDate).toBeNull();
    // Settings gained the horizon + new schema version.
    const settings = await db.settings.get("s1");
    expect(settings?.schemaVersion).toBe(5); // migrated all the way to current
    expect(settings?.safeToSpendHorizon).toBe("endOfMonth");
    // New (empty) tables exist and are queryable.
    expect(await db.recurringRules.count()).toBe(0);
    expect(await db.recurringOverrides.count()).toBe(0);
    db.close();
  });

  it("migrates a v3 database to v4 additively, without data loss", async () => {
    const name = dbName();

    // Stand up a v3-shaped database (Phase 2 schema; no budget tables yet).
    const v3 = new Dexie(name);
    v3.version(3).stores({
      settings: "id",
      accounts: "id, name, type, archived",
      categories: "id, name, bucket, needsWantsSavings, archived",
      people: "id, name, archived",
      incomeSources: "id, name, archived",
      transactions:
        "id, date, accountId, categoryId, personId, type, direction, transferGroupId, cleared, recurringRuleId",
      recurringRules: "id, name, accountId, categoryId, personId, frequency, active, archived",
      recurringOverrides: "id, ruleId, occurrenceDate, [ruleId+occurrenceDate]",
    });
    await v3.open();
    await v3.table("categories").put({ id: "c1", name: "Groceries", bucket: "expenses", needsWantsSavings: "needs", color: "#fff", archived: false, createdAt: 0, updatedAt: 0 });
    await v3.table("recurringRules").put({
      id: "r1", name: "Rent", amount: 50000_00, direction: "out", type: "expense",
      categoryId: "c1", accountId: "a1", personId: null, frequency: "everyMonth",
      anchorDate: "2026-01-01", endDate: null, active: true, archived: false,
      goalId: null, debtId: null, investmentId: null, createdAt: 0, updatedAt: 0,
    });
    await v3.table("settings").put({ id: "s1", currencyCode: "PKR", currencySymbol: "Rs", schemaVersion: 3, safeToSpendHorizon: "endOfMonth", setupComplete: true, createdAt: 0, updatedAt: 0 });
    v3.close();

    // Open the current schema; the 3→4 migration runs on startup.
    const db = createDB(name);
    // Existing data intact.
    expect((await db.categories.get("c1"))?.name).toBe("Groceries");
    expect((await db.recurringRules.get("r1"))?.amount).toBe(50000_00);
    // Settings gained the new schema version.
    expect((await db.settings.get("s1"))?.schemaVersion).toBe(5);
    // New (empty) budget tables exist and are queryable.
    expect(await db.budgetTemplates.count()).toBe(0);
    expect(await db.budgetPeriodLines.count()).toBe(0);
    db.close();
  });

  it("migrates a v4 database to v5 additively, without data loss", async () => {
    const name = dbName();

    // Stand up a v4-shaped database (Phase 3 schema; no goals/debts tables yet,
    // and settings without the Phase 4 fields).
    const v4 = new Dexie(name);
    v4.version(4).stores({
      settings: "id",
      accounts: "id, name, type, archived",
      categories: "id, name, bucket, needsWantsSavings, archived",
      people: "id, name, archived",
      incomeSources: "id, name, archived",
      transactions:
        "id, date, accountId, categoryId, personId, type, direction, transferGroupId, cleared, recurringRuleId",
      recurringRules: "id, name, accountId, categoryId, personId, frequency, active, archived",
      recurringOverrides: "id, ruleId, occurrenceDate, [ruleId+occurrenceDate]",
      budgetTemplates: "id, categoryId",
      budgetPeriodLines: "id, periodKey, categoryId, [periodKey+categoryId]",
    });
    await v4.open();
    await v4.table("accounts").put({ id: "a1", name: "Everyday", type: "checking", openingBalance: 1000_00, currencyCode: "PKR", archived: false, createdAt: 0, updatedAt: 0 });
    await v4.table("budgetTemplates").put({ id: "bt1", categoryId: "c1", plannedAmount: 15000_00, createdAt: 0, updatedAt: 0 });
    await v4.table("settings").put({ id: "s1", currencyCode: "PKR", currencySymbol: "Rs", schemaVersion: 4, safeToSpendHorizon: "endOfMonth", budgetMethod: "carryOver", setupComplete: true, createdAt: 0, updatedAt: 0 });
    v4.close();

    // Open the current schema; the 4→5 migration runs on startup.
    const db = createDB(name);
    // Existing data intact.
    expect((await db.accounts.get("a1"))?.openingBalance).toBe(1000_00);
    expect((await db.budgetTemplates.get("bt1"))?.plannedAmount).toBe(15000_00);
    // Settings gained the Phase 4 fields + the new schema version, and the
    // Phase 3 setting is untouched.
    const settings = await db.settings.get("s1");
    expect(settings?.schemaVersion).toBe(5);
    expect(settings?.budgetMethod).toBe("carryOver"); // pre-existing, unchanged
    expect(settings?.safetyFloor).toBe(0);
    expect(settings?.debtStrategy).toBe("avalanche");
    expect(settings?.debtMonthlyExtra).toBe(0);
    // New (empty) goals/debts tables exist and are queryable.
    expect(await db.goals.count()).toBe(0);
    expect(await db.debts.count()).toBe(0);
    db.close();
  });

  it("goals and debts persist and round-trip through export/import", async () => {
    const db1 = createDB(dbName());
    await db1.goals.put({
      id: "g1", name: "Emergency fund", targetAmount: 300000_00, startingAmount: 50000_00,
      targetDate: "2027-06-30", monthlyContribution: 25000_00, categoryId: "c1",
      archived: false, completedAt: null, createdAt: 0, updatedAt: 0,
    });
    await db1.debts.put({
      id: "d1", name: "Credit card", currentBalance: 120000_00, annualInterestRate: 24,
      minimumPayment: 5000_00, balanceAsOf: "2026-09-01", customOrder: null,
      archived: false, paidOffAt: null, createdAt: 0, updatedAt: 0,
    });
    const backup = await exportDatabase(db1);
    expect(backup.data.goals).toHaveLength(1);
    expect(backup.data.debts).toHaveLength(1);
    db1.close();

    const db2 = createDB(dbName());
    await importDatabase(db2, backup);
    // Persisted and readable.
    expect((await db2.goals.get("g1"))?.targetAmount).toBe(300000_00);
    expect((await db2.debts.get("d1"))?.annualInterestRate).toBe(24);
    // Exact round-trip.
    const roundTrip = await exportDatabase(db2);
    expect(roundTrip.data).toEqual(backup.data);
    db2.close();
  });

  it("imports an older backup that omits goals and debts", async () => {
    const db1 = createDB(dbName());
    const backup = await exportDatabase(db1);
    // Simulate a pre-Phase-4 backup with the arrays missing entirely.
    delete (backup.data as Partial<typeof backup.data>).goals;
    delete (backup.data as Partial<typeof backup.data>).debts;

    const db2 = createDB(dbName());
    await importDatabase(db2, backup); // must not throw
    expect(await db2.goals.count()).toBe(0);
    expect(await db2.debts.count()).toBe(0);
    db1.close();
    db2.close();
  });

  it("export/import round-trips budget templates and period lines", async () => {
    const db1 = createDB(dbName());
    await db1.budgetTemplates.put({ id: "bt1", categoryId: "c1", plannedAmount: 15000_00, createdAt: 0, updatedAt: 0 });
    await db1.budgetPeriodLines.put({ id: "bl1", periodKey: "2026-09", categoryId: "c1", plannedAmount: 20000_00, createdAt: 0, updatedAt: 0 });
    const backup = await exportDatabase(db1);
    expect(backup.data.budgetTemplates).toHaveLength(1);
    expect(backup.data.budgetPeriodLines).toHaveLength(1);
    db1.close();

    const db2 = createDB(dbName());
    await importDatabase(db2, backup);
    const roundTrip = await exportDatabase(db2);
    expect(roundTrip.data).toEqual(backup.data);
    db2.close();
  });

  it("export/import round-trips recurring rules and overrides", async () => {
    const db1 = createDB(dbName());
    await db1.accounts.put({ id: "a1", name: "Everyday", type: "checking", openingBalance: 0, currencyCode: "PKR", archived: false, createdAt: 0, updatedAt: 0 });
    await db1.recurringRules.put({
      id: "r1", name: "Rent", amount: 50000_00, direction: "out", type: "expense",
      categoryId: null, accountId: "a1", personId: null, frequency: "everyMonth",
      anchorDate: "2026-01-01", endDate: null, active: true, archived: false,
      goalId: null, debtId: null, investmentId: null, createdAt: 0, updatedAt: 0,
    });
    await db1.recurringOverrides.put({
      id: "o1", ruleId: "r1", occurrenceDate: "2026-03-01", action: "skip", createdAt: 0, updatedAt: 0,
    });
    const backup = await exportDatabase(db1);
    expect(backup.data.recurringRules).toHaveLength(1);
    expect(backup.data.recurringOverrides).toHaveLength(1);
    db1.close();

    const db2 = createDB(dbName());
    await importDatabase(db2, backup);
    const roundTrip = await exportDatabase(db2);
    expect(roundTrip.data).toEqual(backup.data);
    db2.close();
  });
});
