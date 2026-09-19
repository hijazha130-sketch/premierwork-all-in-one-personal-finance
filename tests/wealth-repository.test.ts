import "fake-indexeddb/auto";
import { describe, it, expect } from "vitest";
import { createDB } from "@/data/db";
import { FinanceRepository } from "@/data/repository";

let counter = 0;
const dbName = () => `test-wealth-repo-${Date.now()}-${++counter}`;

async function setup() {
  const db = createDB(dbName());
  const repo = new FinanceRepository(db);
  const account = await repo.createAccount({ name: "Brokerage", type: "investment", openingBalance: 0, currencyCode: "PKR", archived: false });
  return { db, repo, account };
}

describe("repository — assets", () => {
  it("creates, reads, lists and persists an asset across a restart", async () => {
    const name = dbName();
    let db = createDB(name);
    let repo = new FinanceRepository(db);
    const a = await repo.createAsset({ name: "Apartment", kind: "property", accountId: null, note: "Downtown" });
    expect(a.archived).toBe(false); // defaulted
    db.close();

    db = createDB(name);
    repo = new FinanceRepository(db);
    const back = await repo.getAsset(a.id);
    expect(back?.kind).toBe("property");
    expect(back?.note).toBe("Downtown");
    expect(await repo.listAssets()).toHaveLength(1);
    db.close();
  });

  it("archives an asset (drops from the default list, restore brings it back)", async () => {
    const { repo } = await setup();
    const a = await repo.createAsset({ name: "Car", kind: "vehicle", accountId: null });
    await repo.archiveAsset(a.id);
    expect((await repo.listAssets()).find((x) => x.id === a.id)).toBeUndefined();
    expect((await repo.listAssets(true)).find((x) => x.id === a.id)?.archived).toBe(true);
    await repo.restoreAsset(a.id);
    expect((await repo.listAssets()).find((x) => x.id === a.id)?.archived).toBe(false);
  });

  it("hard-deletes an asset only when nothing references it (no valuation, no tx)", async () => {
    const { repo, account } = await setup();
    const unused = await repo.createAsset({ name: "Unused", kind: "other", accountId: null });
    await repo.deleteAsset(unused.id); // deletable
    expect(await repo.getAsset(unused.id)).toBeUndefined();

    const valued = await repo.createAsset({ name: "Valued", kind: "investment", accountId: account.id });
    await repo.addValuation(valued.id, { value: 100000_00, asOf: "2026-09-01" });
    await expect(repo.deleteAsset(valued.id)).rejects.toThrow(/archive/i);

    const active = await repo.createAsset({ name: "Active", kind: "investment", accountId: account.id });
    await repo.recordAssetContribution(active, { amount: 5000_00, direction: "out", accountId: account.id, date: "2026-09-10" });
    await expect(repo.deleteAsset(active.id)).rejects.toThrow(/archive/i);
  });
});

describe("repository — asset valuations", () => {
  it("keeps one valuation per (asset, date) — a second value updates in place", async () => {
    const { repo } = await setup();
    const a = await repo.createAsset({ name: "Fund", kind: "investment", accountId: null });
    const first = await repo.addValuation(a.id, { value: 100000_00, asOf: "2026-09-01" });
    const second = await repo.addValuation(a.id, { value: 110000_00, asOf: "2026-09-01" });
    expect(second.id).toBe(first.id); // same row, updated
    const all = await repo.listValuationsForAsset(a.id);
    expect(all).toHaveLength(1);
    expect(all[0].value).toBe(110000_00);
  });

  it("lists valuations sorted by asOf, and deletes one", async () => {
    const { repo } = await setup();
    const a = await repo.createAsset({ name: "Fund", kind: "investment", accountId: null });
    await repo.addValuation(a.id, { value: 300_00, asOf: "2026-12-01" });
    await repo.addValuation(a.id, { value: 100_00, asOf: "2026-09-01" });
    await repo.addValuation(a.id, { value: 200_00, asOf: "2026-10-01" });
    const sorted = await repo.listValuationsForAsset(a.id);
    expect(sorted.map((v) => v.asOf)).toEqual(["2026-09-01", "2026-10-01", "2026-12-01"]);

    await repo.deleteValuation(sorted[1].id);
    expect((await repo.listValuationsForAsset(a.id)).map((v) => v.asOf)).toEqual(["2026-09-01", "2026-12-01"]);
  });

  it("rejects a valuation for a missing asset", async () => {
    const { repo } = await setup();
    await expect(repo.addValuation("nope", { value: 100_00, asOf: "2026-09-01" })).rejects.toThrow(/asset/i);
  });
});

describe("repository — asset contribution helper", () => {
  it("records a transaction with investmentId set and does NOT alter value", async () => {
    const { repo, account } = await setup();
    const a = await repo.createAsset({ name: "Fund", kind: "investment", accountId: account.id });
    await repo.addValuation(a.id, { value: 500000_00, asOf: "2026-09-01" });

    const tx = await repo.recordAssetContribution(a, { amount: 25000_00, direction: "out", accountId: account.id, date: "2026-09-15" });
    expect(tx.investmentId).toBe(a.id);
    expect(tx.goalId).toBeNull();
    expect(tx.debtId).toBeNull();
    expect(tx.direction).toBe("out");
    expect(tx.type).toBe("expense");
    expect(tx.source).toBe("manual");

    // The valuation is untouched — value comes only from valuations.
    const vals = await repo.listValuationsForAsset(a.id);
    expect(vals).toHaveLength(1);
    expect(vals[0].value).toBe(500000_00);
    // Discoverable by the asset link.
    expect((await repo.listTransactions()).filter((t) => t.investmentId === a.id)).toHaveLength(1);
  });

  it("an 'in' contribution logs an income transaction", async () => {
    const { repo, account } = await setup();
    const a = await repo.createAsset({ name: "Fund", kind: "investment", accountId: account.id });
    const tx = await repo.recordAssetContribution(a, { amount: 1000_00, direction: "in", accountId: account.id, date: "2026-09-15" });
    expect(tx.direction).toBe("in");
    expect(tx.type).toBe("income");
  });
});
