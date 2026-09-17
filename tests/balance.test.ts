import { describe, it, expect } from "vitest";
import { accountBalance, totalBalance, balancesByAccount } from "@/domain/balance";
import { makeAccount, makeTx, makeTransfer } from "./fixtures";

describe("balance calculator — hand-computed fixtures (golden numbers)", () => {
  it("balance = opening + cleared in − cleared out", () => {
    const acc = makeAccount({ id: "a", openingBalance: 5000_00 }); // Rs 5,000.00 in minor
    const txns = [
      makeTx({ accountId: "a", type: "income", direction: "in", amount: 1000_00 }),
      makeTx({ accountId: "a", type: "expense", direction: "out", amount: 250_00 }),
      makeTx({ accountId: "a", type: "expense", direction: "out", amount: 75_50 }),
    ];
    // 5000 + 1000 − 250 − 75.50 = 5674.50 → 567450 minor
    expect(accountBalance(acc, txns)).toBe(567450);
  });

  it("ignores uncleared transactions", () => {
    const acc = makeAccount({ id: "a", openingBalance: 0 });
    const txns = [
      makeTx({ accountId: "a", type: "expense", direction: "out", amount: 100_00, cleared: false }),
      makeTx({ accountId: "a", type: "expense", direction: "out", amount: 40_00, cleared: true }),
    ];
    expect(accountBalance(acc, txns)).toBe(-4000);
  });

  it("a transfer moves balance between accounts and nets to zero overall", () => {
    const a = makeAccount({ id: "a", openingBalance: 1000_00 });
    const b = makeAccount({ id: "b", openingBalance: 0 });
    const txns = makeTransfer("a", "b", 300_00);

    expect(accountBalance(a, txns)).toBe(700_00);
    expect(accountBalance(b, txns)).toBe(300_00);
    // Total across both is unchanged by the transfer.
    expect(totalBalance([a, b], txns)).toBe(1000_00);
  });

  it("total balance sums openings and all cleared movements", () => {
    const a = makeAccount({ id: "a", openingBalance: 200_00 });
    const b = makeAccount({ id: "b", openingBalance: 800_00 });
    const txns = [
      makeTx({ accountId: "a", type: "income", direction: "in", amount: 50_00 }),
      makeTx({ accountId: "b", type: "expense", direction: "out", amount: 30_00 }),
    ];
    // 200 + 800 + 50 − 30 = 1020.00
    expect(totalBalance([a, b], txns)).toBe(1020_00);

    const map = balancesByAccount([a, b], txns);
    expect(map["a"]).toBe(250_00);
    expect(map["b"]).toBe(770_00);
  });
});
