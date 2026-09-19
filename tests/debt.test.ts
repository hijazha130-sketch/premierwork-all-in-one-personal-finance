import { describe, it, expect } from "vitest";
import type { Debt } from "@/domain/types";
import { computeDebtPlan, PAYOFF_CAP_MONTHS } from "@/domain/debt";

let seq = 0;
function debt(over: Partial<Debt> = {}): Debt {
  return {
    id: `d${++seq}`,
    name: "Debt",
    currentBalance: 100000_00,
    annualInterestRate: 0,
    minimumPayment: 25000_00,
    balanceAsOf: "2026-09-01",
    customOrder: null,
    archived: false,
    paidOffAt: null,
    createdAt: 0,
    updatedAt: 0,
    ...over,
  };
}

const TODAY = "2026-09-15";

describe("debt engine — amortization (§8.2, load-bearing)", () => {
  it("single debt, rate 0%: exact schedule (balance − payment each month)", () => {
    // 100,000 ÷ 25,000/mo = 4 months, no interest.
    const d = debt({ currentBalance: 100000_00, annualInterestRate: 0, minimumPayment: 25000_00 });
    const plan = computeDebtPlan([d], { strategy: "avalanche", monthlyExtra: 0 }, TODAY);

    expect(plan.totalInterest).toBe(0);
    expect(plan.monthsLeft).toBe(4);
    expect(plan.debtFreeDate).toBe("2026-12-31");
    expect(plan.debts[0].monthsLeft).toBe(4);
    expect(plan.debts[0].payoffDate).toBe("2026-12-31");
    expect(plan.debts[0].wontPayOff).toBe(false);
    expect(plan.schedule).toHaveLength(4);
  });

  it("single debt, 12%/yr: matches the hand-computed schedule to the paisa", () => {
    // Hand-computed month by month (interest = round(balance × 0.01)):
    //  M1 int 100000 -> 7,600,000 ; M2 76000 -> 5,176,000 ; M3 51760 -> 2,727,760 ;
    //  M4 27278 -> 255,038 ; M5 2550 -> 0.  Σ interest = 257,588.
    const d = debt({ currentBalance: 100000_00, annualInterestRate: 12, minimumPayment: 25000_00 });
    const plan = computeDebtPlan([d], { strategy: "avalanche", monthlyExtra: 0 }, TODAY);

    expect(plan.debts[0].totalInterest).toBe(257588);
    expect(plan.totalInterest).toBe(257588);
    expect(plan.monthsLeft).toBe(5);
    expect(plan.debtFreeDate).toBe("2027-01-31");
  });

  it("two debts, rate 0%, snowball: exact order and payoff months", () => {
    // X 30,000 (smaller) before Y 60,000; min 10,000 each; extra 10,000.
    // M1: X->10,000 (min+extra), Y->50,000. M2: X paid, Y->30,000. M3: Y paid (min+freed+extra).
    const x = debt({ id: "X", currentBalance: 30000_00, annualInterestRate: 0, minimumPayment: 10000_00 });
    const y = debt({ id: "Y", currentBalance: 60000_00, annualInterestRate: 0, minimumPayment: 10000_00 });
    const plan = computeDebtPlan([y, x], { strategy: "snowball", monthlyExtra: 10000_00 }, TODAY);

    expect(plan.ordered).toEqual(["X", "Y"]); // smallest balance first
    expect(plan.totalInterest).toBe(0);
    const px = plan.debts.find((p) => p.debtId === "X")!;
    const py = plan.debts.find((p) => p.debtId === "Y")!;
    expect(px.monthsLeft).toBe(2);
    expect(px.payoffDate).toBe("2026-10-31");
    expect(py.monthsLeft).toBe(3);
    expect(py.payoffDate).toBe("2026-11-30");
    expect(plan.debtFreeDate).toBe("2026-11-30");
    expect(plan.monthsLeft).toBe(3);
  });

  it("snowball vs avalanche: different order and avalanche pays less interest", () => {
    const low = debt({ id: "LOW", currentBalance: 20000_00, annualInterestRate: 5, minimumPayment: 5000_00 });
    const high = debt({ id: "HIGH", currentBalance: 40000_00, annualInterestRate: 30, minimumPayment: 5000_00 });

    const snow = computeDebtPlan([low, high], { strategy: "snowball", monthlyExtra: 30000_00 }, TODAY);
    const aval = computeDebtPlan([low, high], { strategy: "avalanche", monthlyExtra: 30000_00 }, TODAY);

    expect(snow.ordered).toEqual(["LOW", "HIGH"]); // smallest balance first
    expect(aval.ordered).toEqual(["HIGH", "LOW"]); // highest rate first
    // Attacking the 30% debt first costs less interest overall.
    expect(aval.totalInterest).toBeLessThan(snow.totalInterest);
    expect(snow.anyWontPayOff).toBe(false);
    expect(aval.anyWontPayOff).toBe(false);
  });

  it("flags a debt whose minimum can't cover its interest (no infinite loop)", () => {
    // interest = round(10,000,000 × 24/1200) = 200,000/mo > minimum 100,000 → never shrinks.
    const d = debt({ currentBalance: 100000_00, annualInterestRate: 24, minimumPayment: 1000_00 });
    const plan = computeDebtPlan([d], { strategy: "avalanche", monthlyExtra: 0 }, TODAY);

    expect(plan.debts[0].wontPayOff).toBe(true);
    expect(plan.debts[0].payoffDate).toBeNull();
    expect(plan.debts[0].monthsLeft).toBeNull();
    expect(plan.anyWontPayOff).toBe(true);
    expect(plan.debtFreeDate).toBeNull();
    expect(plan.monthsLeft).toBeNull();
    // Terminated at the cap rather than looping.
    expect(plan.schedule).toHaveLength(PAYOFF_CAP_MONTHS);
  });

  it("handles a debt already at zero", () => {
    const d = debt({ id: "Z", currentBalance: 0, annualInterestRate: 20, minimumPayment: 5000_00 });
    const plan = computeDebtPlan([d], { strategy: "avalanche", monthlyExtra: 0 }, TODAY);
    expect(plan.debts[0].paidOff).toBe(true);
    expect(plan.debts[0].monthsLeft).toBe(0);
    expect(plan.debts[0].totalInterest).toBe(0);
    expect(plan.anyWontPayOff).toBe(false);
    expect(plan.schedule).toHaveLength(0); // nothing to simulate
  });

  it("an empty debt list is a valid, empty plan", () => {
    const plan = computeDebtPlan([], { strategy: "avalanche", monthlyExtra: 0 }, TODAY);
    expect(plan.debts).toHaveLength(0);
    expect(plan.totalInterest).toBe(0);
    expect(plan.debtFreeDate).toBeNull();
    expect(plan.anyWontPayOff).toBe(false);
  });
});
