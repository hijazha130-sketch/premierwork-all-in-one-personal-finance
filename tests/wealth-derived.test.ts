import "fake-indexeddb/auto";
import { describe, it, expect } from "vitest";
import { createDB } from "@/data/db";
import { FinanceRepository } from "@/data/repository";
import { balancesByAccount } from "@/domain/balance";
import { netWorthNow, netWorthSeries } from "@/domain/wealth";

let counter = 0;
const dbName = () => `test-wealth-derived-${Date.now()}-${++counter}`;

/**
 * The DataProvider composes repository reads into netWorthNow / netWorthSeries
 * exactly as below (no DOM renderer is available in this suite, so this exercises
 * that same derivation pipeline end-to-end against the real repository/db).
 */
describe("wealth — derived pipeline (provider composition)", () => {
  it("surfaces net worth now and the trend series from repository data", async () => {
    const db = createDB(dbName());
    const repo = new FinanceRepository(db);
    const today = "2026-09-18";

    await repo.createAccount({ name: "Everyday", type: "checking", openingBalance: 100000_00, currencyCode: "PKR", archived: false });
    // An investment account whose value lives in a linked asset (must NOT double count).
    const brk = await repo.createAccount({ name: "Brokerage", type: "investment", openingBalance: 200000_00, currencyCode: "PKR", archived: false });
    const fund = await repo.createAsset({ name: "Index fund", kind: "investment", accountId: brk.id });
    await repo.addValuation(fund.id, { value: 250000_00, asOf: "2026-08-01" });
    await repo.createDebt({ name: "Card", currentBalance: 20000_00, annualInterestRate: 24, minimumPayment: 5000_00, balanceAsOf: "2026-08-01" });

    // The exact composition the provider does.
    const accounts = await repo.listAccounts();
    const txns = await repo.listTransactions();
    const assets = await repo.listAssets();
    const valuations = await repo.listAllValuations();
    const debts = await repo.listDebts();
    const balances = balancesByAccount(accounts, txns);

    const nw = netWorthNow(accounts, balances, assets, valuations, debts, today);
    // cash 100,000 + investment valuation 250,000 − debt 20,000 = 330,000.
    // The 200,000 brokerage-account balance is excluded (no double count).
    expect(nw.breakdown.cash).toBe(100000_00);
    expect(nw.breakdown.investments).toBe(250000_00);
    expect(nw.breakdown.planDebts).toBe(20000_00);
    expect(nw.netWorth).toBe(330000_00);

    const series = netWorthSeries({ from: "2026-07-01", to: "2026-09-30" }, accounts, txns, assets, valuations, debts);
    expect(series).toHaveLength(3); // Jul, Aug, Sep month-ends
    // July: valuation + debt both dated 08-01, so not yet in effect at 07-31.
    expect(series[0]).toEqual({ date: "2026-07-31", netWorth: 100000_00 });
    // September: everything in effect — matches "now".
    expect(series[2]).toEqual({ date: "2026-09-30", netWorth: 330000_00 });

    db.close();
  });
});
