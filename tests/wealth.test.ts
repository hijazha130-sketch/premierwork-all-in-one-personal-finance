import { describe, it, expect } from "vitest";
import type { Account, Asset, AssetKind, AssetValuation, Debt, Transaction } from "@/domain/types";
import { assetValueAt, netWorthNow, netWorthSeries } from "@/domain/wealth";
import { balancesByAccount } from "@/domain/balance";

let seq = 0;
function account(over: Partial<Account> = {}): Account {
  return { id: `ac${++seq}`, name: "Acct", type: "checking", openingBalance: 0, currencyCode: "PKR", archived: false, createdAt: 0, updatedAt: 0, ...over };
}
function asset(kind: AssetKind, over: Partial<Asset> = {}): Asset {
  return { id: `as${++seq}`, name: "Asset", kind, accountId: null, archived: false, createdAt: 0, updatedAt: 0, ...over };
}
function valuation(assetId: string, value: number, asOf: string, createdAt = 0): AssetValuation {
  return { id: `av${++seq}`, assetId, value, asOf, createdAt, updatedAt: createdAt };
}
function debt(over: Partial<Debt> = {}): Debt {
  return { id: `d${++seq}`, name: "Debt", currentBalance: 0, annualInterestRate: 0, minimumPayment: 0, balanceAsOf: "2026-01-01", customOrder: null, archived: false, paidOffAt: null, createdAt: 0, updatedAt: 0, ...over };
}
function tx(over: Partial<Transaction> & { accountId: string; amount: number; direction: "in" | "out"; date: string }): Transaction {
  return { id: `t${++seq}`, type: over.direction === "in" ? "income" : "expense", categoryId: null, personId: null, source: "manual", cleared: true, transferGroupId: null, recurringRuleId: null, occurrenceDate: null, goalId: null, debtId: null, investmentId: null, createdAt: 0, updatedAt: 0, ...over };
}

const TODAY = "2026-09-18";

describe("wealth engine — assetValueAt (§8, step function)", () => {
  it("takes the latest valuation with asOf <= date; future is excluded", () => {
    const vals = [
      valuation("A", 100000_00, "2026-06-01"),
      valuation("A", 120000_00, "2026-09-01"),
      valuation("A", 999999_00, "2026-12-01"), // future relative to TODAY
    ];
    expect(assetValueAt("A", vals, TODAY)).toBe(120000_00);
    expect(assetValueAt("A", vals, "2026-07-15")).toBe(100000_00);
  });

  it("returns 0 for an asset with no (qualifying) valuation", () => {
    expect(assetValueAt("A", [], TODAY)).toBe(0);
    expect(assetValueAt("A", [valuation("A", 5_00, "2027-01-01")], TODAY)).toBe(0); // all future
  });

  it("breaks an asOf tie by the greatest createdAt", () => {
    const vals = [valuation("A", 100_00, "2026-09-01", 10), valuation("A", 200_00, "2026-09-01", 20)];
    expect(assetValueAt("A", vals, TODAY)).toBe(200_00);
  });
});

describe("wealth engine — netWorthNow (locked rule)", () => {
  it("(a) net worth now, hand-computed", () => {
    const accounts = [
      account({ id: "chk", type: "checking", openingBalance: 100000_00 }),
      account({ id: "sav", type: "savings", openingBalance: 50000_00 }),
      account({ id: "cc", type: "credit", openingBalance: 30000_00 }),
    ];
    const balances = balancesByAccount(accounts, []);
    const assets = [asset("property", { id: "home" })];
    const vals = [valuation("home", 5000000_00, "2026-09-01")];
    const debts = [debt({ currentBalance: 20000_00 })];

    const nw = netWorthNow(accounts, balances, assets, vals, debts, TODAY);
    expect(nw.breakdown.cash).toBe(150000_00); // 100,000 + 50,000
    expect(nw.breakdown.property).toBe(5000000_00);
    expect(nw.breakdown.credit).toBe(30000_00);
    expect(nw.breakdown.planDebts).toBe(20000_00);
    expect(nw.assetsTotal).toBe(5150000_00); // cash + property
    expect(nw.liabilities).toBe(50000_00); // credit + debt
    expect(nw.netWorth).toBe(5100000_00); // 5,150,000 - 50,000
  });

  it("(b) no double count: an investment account balance is excluded; only the valuation counts", () => {
    const accounts = [account({ id: "brk", type: "investment", openingBalance: 200000_00 })];
    const balances = balancesByAccount(accounts, []);
    const assets = [asset("investment", { id: "fund", accountId: "brk" })];
    const vals = [valuation("fund", 250000_00, "2026-09-01")];

    const nw = netWorthNow(accounts, balances, assets, vals, [], TODAY);
    expect(nw.breakdown.cash).toBe(0); // the 200,000 investment-account balance is NOT counted
    expect(nw.breakdown.investments).toBe(250000_00); // only the valuation
    expect(nw.assetsTotal).toBe(250000_00);
    expect(nw.netWorth).toBe(250000_00);
  });

  it("(c) a contribution never changes the asset's value (value comes only from valuations)", () => {
    const assets = [asset("investment", { id: "fund" })];
    const vals = [valuation("fund", 250000_00, "2026-09-01")];
    // A contribution is a transaction with investmentId set — it does not appear
    // in the valuation list, so the derived value is unchanged.
    const contribution = tx({ accountId: "brk", amount: 25000_00, direction: "out", date: "2026-09-15", investmentId: "fund" });
    expect(contribution.investmentId).toBe("fund");
    expect(assetValueAt("fund", vals, TODAY)).toBe(250000_00); // unaffected by the contribution
    const nw = netWorthNow([], {}, assets, vals, [], TODAY);
    expect(nw.breakdown.investments).toBe(250000_00);
  });

  it("(e) an unvalued asset contributes 0", () => {
    const assets = [asset("vehicle", { id: "car" })];
    const nw = netWorthNow([], {}, assets, [], [], TODAY);
    expect(nw.breakdown.vehicle).toBe(0);
    expect(nw.netWorth).toBe(0);
  });

  it("(f) net worth can be negative (shown honestly)", () => {
    const accounts = [
      account({ id: "chk", type: "checking", openingBalance: 20000_00 }),
      account({ id: "cc", type: "credit", openingBalance: 100000_00 }),
    ];
    const balances = balancesByAccount(accounts, []);
    const debts = [debt({ currentBalance: 50000_00 })];
    const nw = netWorthNow(accounts, balances, [], [], debts, TODAY);
    expect(nw.assetsTotal).toBe(20000_00);
    expect(nw.liabilities).toBe(150000_00); // 100,000 credit + 50,000 debt
    expect(nw.netWorth).toBe(-130000_00);
  });

  it("archived assets and accounts drop out", () => {
    const accounts = [account({ id: "chk", type: "checking", openingBalance: 100000_00, archived: true })];
    const balances = { chk: 100000_00 };
    const assets = [asset("property", { id: "home", archived: true })];
    const vals = [valuation("home", 5000000_00, "2026-09-01")];
    const nw = netWorthNow(accounts, balances, assets, vals, [], TODAY);
    expect(nw.netWorth).toBe(0);
  });
});

describe("wealth engine — netWorthSeries (§ over time)", () => {
  it("(d) the series steps on the valuation's month; cash and debts step too", () => {
    const accounts = [account({ id: "chk", type: "checking", openingBalance: 0 })];
    const txns = [tx({ accountId: "chk", amount: 100000_00, direction: "in", date: "2026-10-05" })];
    const assets = [asset("property", { id: "home" })];
    const vals = [valuation("home", 500000_00, "2026-11-10")];
    const debts = [debt({ currentBalance: 40000_00, balanceAsOf: "2026-10-01" })];

    const series = netWorthSeries({ from: "2026-09-01", to: "2026-11-30" }, accounts, txns, assets, vals, debts);
    expect(series.map((p) => p.date)).toEqual(["2026-09-30", "2026-10-31", "2026-11-30"]);
    // Sep: cash 0, asset 0 (val is future), debt 0 (balanceAsOf after month-end).
    expect(series[0].netWorth).toBe(0);
    // Oct: cash 100,000, asset 0, debt 40,000 -> 60,000.
    expect(series[1].netWorth).toBe(60000_00);
    // Nov: cash 100,000, asset 500,000, debt 40,000 -> 560,000.
    expect(series[2].netWorth).toBe(560000_00);
  });
});
