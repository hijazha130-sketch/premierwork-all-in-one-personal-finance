/**
 * Debt engine (Phase 4 Architecture §8.2). Pure — no storage, no UI, `today`
 * injected. LOAD-BEARING: the payoff forecast is what the product promises.
 *
 * The payoff plan is a FORECAST computed on demand from each debt's terms
 * (balance, rate, minimum) plus the plan-level extra payment and strategy —
 * never stored. Actual payments are transactions (debtId); this engine runs on
 * the debts' current balances (user-maintained per FD-4.1).
 *
 * Verified monthly rule (DEBT CALCULATOR): interest = balance × annual-rate ÷ 12;
 * the balance grows by interest and shrinks by the payment; steps by whole
 * months (EOMONTH). Snowball/avalanche direct a pooled extra payment.
 */
import type { Debt, DebtStrategy, IsoDate, Minor } from "@/domain/types";

/** Safety bound so a debt whose minimum can't cover interest never loops forever. */
export const PAYOFF_CAP_MONTHS = 600;

export interface DebtPlanInput {
  strategy: DebtStrategy;
  monthlyExtra: Minor; // extra beyond the minimums, directed by the strategy
}

export interface DebtPayoff {
  debtId: string;
  name: string;
  paidOff: boolean; // reached 0 within the cap
  wontPayOff: boolean; // still owing at the cap (e.g. minimum <= interest)
  payoffDate: IsoDate | null; // EOMONTH it clears; null when it won't
  monthsLeft: number | null; // months until it clears; null when it won't
  totalInterest: Minor; // interest this debt accrues over the plan
}

export interface DebtScheduleMonth {
  monthIndex: number; // 1-based
  date: IsoDate; // EOMONTH of this step
  totalBalance: Minor; // remaining across all debts at month end
  interest: Minor; // interest charged this month across all debts
}

export interface DebtPlan {
  strategy: DebtStrategy;
  debts: DebtPayoff[]; // in strategy order
  ordered: string[]; // debt ids in strategy order
  debtFreeDate: IsoDate | null; // null when any debt won't pay off within the cap
  monthsLeft: number | null; // months to the last payoff; null when any won't
  totalInterest: Minor; // total interest across all debts
  anyWontPayOff: boolean;
  schedule: DebtScheduleMonth[]; // month-by-month, for a chart
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** Last day of the month `monthsAhead` (1-based) from `today`. */
function eomonth(today: IsoDate, monthsAhead: number): IsoDate {
  const [y, m] = today.split("-").map(Number);
  const idx = m - 1 + (monthsAhead - 1);
  const ty = y + Math.floor(idx / 12);
  const tm = ((idx % 12) + 12) % 12; // 0-11
  const lastDay = new Date(ty, tm + 1, 0).getDate();
  return `${ty}-${pad2(tm + 1)}-${pad2(lastDay)}`;
}

/** Order debts by strategy; original order is the stable tie-break. */
function orderDebts(debts: Debt[], strategy: DebtStrategy): Debt[] {
  return debts
    .map((d, i) => ({ d, i }))
    .sort((a, b) => {
      if (strategy === "avalanche") {
        if (b.d.annualInterestRate !== a.d.annualInterestRate) {
          return b.d.annualInterestRate - a.d.annualInterestRate; // highest rate first
        }
      } else if (strategy === "snowball") {
        if (a.d.currentBalance !== b.d.currentBalance) {
          return a.d.currentBalance - b.d.currentBalance; // smallest balance first
        }
      } else {
        const ao = a.d.customOrder ?? Number.MAX_SAFE_INTEGER;
        const bo = b.d.customOrder ?? Number.MAX_SAFE_INTEGER;
        if (ao !== bo) return ao - bo;
      }
      return a.i - b.i;
    })
    .map((x) => x.d);
}

interface Sim {
  debt: Debt;
  balance: Minor;
  totalInterest: Minor;
  payoffMonth: number | null; // 1-based month it hit 0; 0 = already paid; null = still owing
}

/** The monthly interest charge on a balance (rounded to minor units). */
function monthlyInterest(balance: Minor, annualRatePercent: number): Minor {
  if (balance <= 0 || annualRatePercent <= 0) return 0;
  return Math.round((balance * annualRatePercent) / 100 / 12);
}

/**
 * Simulate the payoff month by month from `today`, applying each debt's minimum
 * and then a pooled extra (plan extra + freed minimums of paid-off debts) to the
 * debts in strategy order, cascading any leftover to the next active debt.
 */
export function computeDebtPlan(debts: Debt[], plan: DebtPlanInput, today: IsoDate): DebtPlan {
  const ordered = orderDebts(debts, plan.strategy);
  const sims: Sim[] = ordered.map((d) => ({
    debt: d,
    balance: Math.max(0, d.currentBalance),
    totalInterest: 0,
    payoffMonth: d.currentBalance <= 0 ? 0 : null,
  }));

  const schedule: DebtScheduleMonth[] = [];
  const hasActive = () => sims.some((s) => s.balance > 0);

  let month = 1;
  for (; month <= PAYOFF_CAP_MONTHS && hasActive(); month++) {
    // Pool = plan extra + minimums freed by debts paid off in a PRIOR month.
    let pool = plan.monthlyExtra;
    for (const s of sims) {
      if (s.payoffMonth !== null && s.payoffMonth < month) pool += s.debt.minimumPayment;
    }

    let interestThisMonth = 0;
    // Accrue interest, then apply each active debt's own minimum.
    for (const s of sims) {
      if (s.balance <= 0) continue;
      const interest = monthlyInterest(s.balance, s.debt.annualInterestRate);
      s.totalInterest += interest;
      interestThisMonth += interest;
      s.balance += interest;
      const pay = Math.min(s.debt.minimumPayment, s.balance);
      s.balance -= pay;
      const surplus = s.debt.minimumPayment - pay; // this debt's minimum, freed early
      if (surplus > 0) pool += surplus;
      if (s.balance <= 0) {
        s.balance = 0;
        s.payoffMonth = month;
      }
    }

    // Apply the pool to the active debts in strategy order, cascading leftovers.
    for (const s of sims) {
      if (pool <= 0) break;
      if (s.balance <= 0) continue;
      const applied = Math.min(pool, s.balance);
      s.balance -= applied;
      pool -= applied;
      if (s.balance <= 0) {
        s.balance = 0;
        s.payoffMonth = month;
      }
    }

    const totalBalance = sims.reduce((sum, s) => sum + s.balance, 0);
    schedule.push({ monthIndex: month, date: eomonth(today, month), totalBalance, interest: interestThisMonth });
  }

  const payoffs: DebtPayoff[] = sims.map((s) => {
    const owing = s.balance > 0;
    const paidOff = !owing;
    const clearsInFuture = s.payoffMonth !== null && s.payoffMonth > 0;
    return {
      debtId: s.debt.id,
      name: s.debt.name,
      paidOff,
      wontPayOff: owing,
      payoffDate: clearsInFuture ? eomonth(today, s.payoffMonth as number) : null,
      monthsLeft: owing ? null : s.payoffMonth,
      totalInterest: s.totalInterest,
    };
  });

  const anyWontPayOff = sims.some((s) => s.balance > 0);
  const totalInterest = sims.reduce((sum, s) => sum + s.totalInterest, 0);
  const lastPayoffMonth = sims.reduce((max, s) => {
    if (s.payoffMonth != null && s.payoffMonth > max) return s.payoffMonth;
    return max;
  }, 0);

  return {
    strategy: plan.strategy,
    debts: payoffs,
    ordered: ordered.map((d) => d.id),
    debtFreeDate: anyWontPayOff || lastPayoffMonth === 0 ? null : eomonth(today, lastPayoffMonth),
    monthsLeft: anyWontPayOff ? null : lastPayoffMonth,
    totalInterest,
    anyWontPayOff,
    schedule,
  };
}
