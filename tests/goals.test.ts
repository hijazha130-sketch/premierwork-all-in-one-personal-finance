import { describe, it, expect } from "vitest";
import type { Goal, Transaction } from "@/domain/types";
import { computeGoalProgress, computeGoals, savedForGoal } from "@/domain/goals";

let seq = 0;
function goal(over: Partial<Goal> = {}): Goal {
  return {
    id: `g${++seq}`,
    name: "Goal",
    targetAmount: 300000_00,
    startingAmount: 0,
    targetDate: null,
    monthlyContribution: null,
    categoryId: null,
    archived: false,
    completedAt: null,
    createdAt: 0,
    updatedAt: 0,
    ...over,
  };
}

function contribution(goalId: string, amount: number, date = "2026-09-10"): Transaction {
  return {
    id: `t${++seq}`,
    date,
    amount,
    direction: "out",
    type: "expense",
    categoryId: null,
    accountId: "a1",
    personId: null,
    source: "manual",
    cleared: true,
    transferGroupId: null,
    recurringRuleId: null,
    occurrenceDate: null,
    goalId,
    debtId: null,
    investmentId: null,
    createdAt: 0,
    updatedAt: 0,
  };
}

const TODAY = "2026-09-15";

describe("goal engine — sinking-fund math (§8.1)", () => {
  it("saved = starting + Σ contributions; remaining and progress follow", () => {
    const g = goal({ targetAmount: 300000_00, startingAmount: 50000_00 });
    const txns = [contribution(g.id, 25000_00), contribution(g.id, 25000_00)];
    expect(savedForGoal(g, txns)).toBe(100000_00);

    const p = computeGoalProgress(g, txns, TODAY);
    expect(p.saved).toBe(100000_00);
    expect(p.remaining).toBe(200000_00);
    expect(p.progress).toBeCloseTo(1 / 3, 5);
    expect(p.complete).toBe(false);
    // Transactions for a different goal are ignored.
    expect(savedForGoal(g, [contribution("other", 99999_00)])).toBe(50000_00);
  });

  it("monthlyTarget = remaining ÷ months left when a target date is set", () => {
    const g = goal({ targetAmount: 300000_00, startingAmount: 100000_00, targetDate: "2026-12-15" });
    const p = computeGoalProgress(g, [], TODAY); // remaining 200000_00, 3 months left
    // 20,000,000 minor ÷ 3, rounded up.
    expect(p.monthlyTarget).toBe(6666667);
  });

  it("months left <= 0 makes the whole remaining due now", () => {
    const g = goal({ targetAmount: 300000_00, startingAmount: 100000_00, targetDate: "2026-09-01" });
    const p = computeGoalProgress(g, [], TODAY); // same month → 0 months left
    expect(p.monthlyTarget).toBe(200000_00);
  });

  it("projectedDate = today + ceil(remaining ÷ monthlyContribution) months", () => {
    const g = goal({ targetAmount: 300000_00, startingAmount: 100000_00, monthlyContribution: 25000_00 });
    const p = computeGoalProgress(g, [], TODAY); // 200000_00 ÷ 25000_00 = 8 months
    expect(p.projectedDate).toBe("2027-05-15");
  });

  it("projectedDate rounds partial months up", () => {
    const g = goal({ targetAmount: 100000_00, startingAmount: 0, monthlyContribution: 30000_00 });
    const p = computeGoalProgress(g, [], TODAY); // 100000 ÷ 30000 = 3.33 → 4 months
    expect(p.projectedDate).toBe("2027-01-15");
  });

  it("over-funding: remaining clamps to 0, progress exceeds 1, complete is true", () => {
    const g = goal({ targetAmount: 100000_00, startingAmount: 0 });
    const p = computeGoalProgress(g, [contribution(g.id, 120000_00)], TODAY);
    expect(p.saved).toBe(120000_00);
    expect(p.remaining).toBe(0);
    expect(p.progress).toBeCloseTo(1.2, 5);
    expect(p.complete).toBe(true);
  });

  it("no target date and no monthly contribution leave both projections null", () => {
    const g = goal({ targetAmount: 100000_00, startingAmount: 40000_00 });
    const p = computeGoalProgress(g, [], TODAY);
    expect(p.monthlyTarget).toBeNull();
    expect(p.projectedDate).toBeNull();
    expect(p.remaining).toBe(60000_00);
  });

  it("global roll-up sums target / saved / remaining across goals", () => {
    const a = goal({ id: "A", targetAmount: 300000_00, startingAmount: 100000_00 });
    const b = goal({ id: "B", targetAmount: 100000_00, startingAmount: 0 });
    const txns = [contribution("B", 120000_00)]; // B over-funded
    const roll = computeGoals([a, b], txns, TODAY);
    expect(roll.totalTarget).toBe(400000_00);
    expect(roll.totalSaved).toBe(220000_00); // 100000 + 120000
    expect(roll.totalRemaining).toBe(200000_00); // A 200000, B 0 (clamped)
    expect(roll.goals).toHaveLength(2);
  });
});
