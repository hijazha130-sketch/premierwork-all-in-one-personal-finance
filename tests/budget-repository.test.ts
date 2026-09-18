import "fake-indexeddb/auto";
import { describe, it, expect } from "vitest";
import { createDB } from "@/data/db";
import { FinanceRepository } from "@/data/repository";

let counter = 0;
const dbName = () => `test-budget-repo-${Date.now()}-${++counter}`;

async function setup() {
  const db = createDB(dbName());
  const repo = new FinanceRepository(db);
  const cat = await repo.createCategory({ name: "Groceries", bucket: "expenses", needsWantsSavings: "needs", color: "#fff", archived: false });
  return { db, repo, cat };
}

describe("repository — budget templates", () => {
  it("keeps exactly one template per category (upsert updates, never duplicates)", async () => {
    const { repo, cat } = await setup();
    const first = await repo.setBudgetTemplate(cat.id, 15000_00);
    const second = await repo.setBudgetTemplate(cat.id, 20000_00);

    expect(second.id).toBe(first.id); // same row, updated in place
    const all = await repo.listBudgetTemplates();
    expect(all).toHaveLength(1);
    expect((await repo.getBudgetTemplate(cat.id))?.plannedAmount).toBe(20000_00);
  });

  it("deletes a template", async () => {
    const { repo, cat } = await setup();
    await repo.setBudgetTemplate(cat.id, 15000_00);
    await repo.deleteBudgetTemplate(cat.id);
    expect(await repo.getBudgetTemplate(cat.id)).toBeUndefined();
  });

  it("keeps a template valid after its category is archived (history stays intact)", async () => {
    const { repo, cat } = await setup();
    await repo.setBudgetTemplate(cat.id, 15000_00);
    await repo.archiveCategory(cat.id);

    // The category drops out of the editable list but the template persists.
    expect((await repo.listCategories()).find((c) => c.id === cat.id)).toBeUndefined();
    expect((await repo.listCategories(true)).find((c) => c.id === cat.id)?.archived).toBe(true);
    expect((await repo.getBudgetTemplate(cat.id))?.plannedAmount).toBe(15000_00);
  });

  it("persists and reads back after a restart", async () => {
    const name = dbName();
    let db = createDB(name);
    let repo = new FinanceRepository(db);
    const cat = await repo.createCategory({ name: "Rent", bucket: "bills", needsWantsSavings: "needs", color: "#fff", archived: false });
    await repo.setBudgetTemplate(cat.id, 50000_00);
    db.close();

    db = createDB(name);
    repo = new FinanceRepository(db);
    expect((await repo.getBudgetTemplate(cat.id))?.plannedAmount).toBe(50000_00);
    db.close();
  });
});

describe("repository — budget period lines", () => {
  it("keeps exactly one line per (period, category) and filters by period", async () => {
    const { repo, cat } = await setup();
    const a = await repo.setBudgetPeriodLine({ periodKey: "2026-09", categoryId: cat.id, plannedAmount: 20000_00 });
    const b = await repo.setBudgetPeriodLine({ periodKey: "2026-09", categoryId: cat.id, plannedAmount: 22000_00 });
    expect(b.id).toBe(a.id); // updated in place
    expect(await repo.listBudgetPeriodLines("2026-09")).toHaveLength(1);
    expect((await repo.getBudgetPeriodLine("2026-09", cat.id))?.plannedAmount).toBe(22000_00);

    // A different month is a separate line.
    await repo.setBudgetPeriodLine({ periodKey: "2026-10", categoryId: cat.id, plannedAmount: 18000_00 });
    expect(await repo.listBudgetPeriodLines("2026-09")).toHaveLength(1);
    expect(await repo.listBudgetPeriodLines("2026-10")).toHaveLength(1);
    expect(await repo.listBudgetPeriodLines()).toHaveLength(2); // all
  });

  it("deletes a period line", async () => {
    const { repo, cat } = await setup();
    await repo.setBudgetPeriodLine({ periodKey: "2026-09", categoryId: cat.id, plannedAmount: 20000_00 });
    await repo.deleteBudgetPeriodLine("2026-09", cat.id);
    expect(await repo.getBudgetPeriodLine("2026-09", cat.id)).toBeUndefined();
  });
});
