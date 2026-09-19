/**
 * Wealth engine (Phase 5). Pure — no storage, no DB reads, no inline clock
 * beyond the injected `today`. Net worth is DERIVED here and never stored.
 *
 * Locked rules (each thing counted once):
 *   - An asset's value = its latest valuation with asOf <= the date (a step
 *     function; no interpolation). No valuation -> 0. Future-dated valuations are
 *     excluded from "now".
 *   - Net worth = assets - liabilities.
 *       Assets      = cash-account balances (checking/savings/cash)
 *                     + asset latest-valuations.
 *       Liabilities = credit/loan-account balances + Phase-4 debt currentBalance.
 *     `investment`-type account balances are EXCLUDED — that value lives in the
 *     linked Asset's valuation, so counting the account too would double count.
 *   - Contributions (transactions with investmentId set) are informational; they
 *     never value an asset. Only a valuation sets value.
 */
import type {
  Account,
  AccountType,
  Asset,
  AssetValuation,
  Debt,
  IsoDate,
  Minor,
  Transaction,
} from "@/domain/types";
import { accountBalanceAsOf } from "@/domain/balance";
import { addMinor, subMinor } from "@/lib/money";
import { todayIso } from "@/lib/period";

const CASH_TYPES: AccountType[] = ["checking", "savings", "cash"];
const LIABILITY_ACCOUNT_TYPES: AccountType[] = ["credit", "loan"];

export interface NetWorthBreakdown {
  cash: Minor; // cash-type account balances
  investments: Minor; // asset kind "investment"
  property: Minor; // asset kind "property"
  vehicle: Minor; // asset kind "vehicle"
  other: Minor; // asset kinds "cash" + "other"
  credit: Minor; // credit-account balances (liability)
  loans: Minor; // loan-account balances (liability)
  planDebts: Minor; // Phase-4 debt currentBalance (liability)
}

export interface NetWorth {
  netWorth: Minor;
  assetsTotal: Minor;
  liabilities: Minor;
  breakdown: NetWorthBreakdown;
}

export interface NetWorthPoint {
  date: IsoDate; // month-end
  netWorth: Minor;
}

/**
 * The value of an asset at a date: its latest valuation with asOf <= `asOf`.
 * Ties on asOf are broken by the greatest createdAt (latest observation wins).
 * No qualifying valuation -> 0.
 */
export function assetValueAt(
  assetId: string,
  valuations: AssetValuation[],
  asOf: IsoDate = todayIso(),
): Minor {
  let best: AssetValuation | null = null;
  for (const v of valuations) {
    if (v.assetId !== assetId) continue;
    if (v.asOf > asOf) continue; // future valuations excluded
    if (
      best === null ||
      v.asOf > best.asOf ||
      (v.asOf === best.asOf && v.createdAt > best.createdAt)
    ) {
      best = v;
    }
  }
  return best ? best.value : 0;
}

/** Net worth right now (locked rule), with a per-bucket breakdown. */
export function netWorthNow(
  accounts: Account[],
  balancesById: Record<string, Minor>,
  assets: Asset[],
  valuations: AssetValuation[],
  debts: Debt[],
  today: IsoDate = todayIso(),
): NetWorth {
  const b: NetWorthBreakdown = {
    cash: 0,
    investments: 0,
    property: 0,
    vehicle: 0,
    other: 0,
    credit: 0,
    loans: 0,
    planDebts: 0,
  };

  // Accounts: cash types are assets; credit/loan are liabilities; investment
  // accounts are excluded (their value lives in the linked Asset).
  for (const a of accounts) {
    if (a.archived) continue;
    const bal = balancesById[a.id] ?? 0;
    if (CASH_TYPES.includes(a.type)) b.cash = addMinor(b.cash, bal);
    else if (a.type === "credit") b.credit = addMinor(b.credit, bal);
    else if (a.type === "loan") b.loans = addMinor(b.loans, bal);
    // a.type === "investment" -> excluded on purpose (no double count)
  }

  // Assets: value from their latest valuation (never from any account).
  for (const asset of assets) {
    if (asset.archived) continue;
    const value = assetValueAt(asset.id, valuations, today);
    switch (asset.kind) {
      case "investment":
        b.investments = addMinor(b.investments, value);
        break;
      case "property":
        b.property = addMinor(b.property, value);
        break;
      case "vehicle":
        b.vehicle = addMinor(b.vehicle, value);
        break;
      default: // "cash" | "other"
        b.other = addMinor(b.other, value);
        break;
    }
  }

  // Phase-4 debts: the amount owed is a liability.
  for (const d of debts) {
    if (d.archived) continue;
    b.planDebts = addMinor(b.planDebts, d.currentBalance);
  }

  const assetsTotal = addMinor(b.cash, b.investments, b.property, b.vehicle, b.other);
  const liabilities = addMinor(b.credit, b.loans, b.planDebts);
  return { netWorth: subMinor(assetsTotal, liabilities), assetsTotal, liabilities, breakdown: b };
}

/**
 * Net worth at each month-end within `range` (inclusive of the months touched
 * by from..to). Cash and credit/loan account balances step from their cleared
 * transactions on/before that month-end; each asset steps at its valuation asOf;
 * each Phase-4 debt is flat at currentBalance once the month-end is on/after its
 * balanceAsOf (and 0 before). One shared balance derivation (accountBalanceAsOf).
 */
export function netWorthSeries(
  range: { from: IsoDate; to: IsoDate },
  accounts: Account[],
  transactions: Transaction[],
  assets: Asset[],
  valuations: AssetValuation[],
  debts: Debt[],
): NetWorthPoint[] {
  const points: NetWorthPoint[] = [];
  for (const monthEnd of monthEndsInRange(range.from, range.to)) {
    let assetsTotal = 0;
    let liabilities = 0;

    for (const a of accounts) {
      if (a.archived) continue;
      const bal = accountBalanceAsOf(a, transactions, monthEnd);
      if (CASH_TYPES.includes(a.type)) assetsTotal = addMinor(assetsTotal, bal);
      else if (LIABILITY_ACCOUNT_TYPES.includes(a.type)) liabilities = addMinor(liabilities, bal);
      // investment accounts excluded (value lives in the linked Asset)
    }
    for (const asset of assets) {
      if (asset.archived) continue;
      assetsTotal = addMinor(assetsTotal, assetValueAt(asset.id, valuations, monthEnd));
    }
    for (const d of debts) {
      if (d.archived) continue;
      if (monthEnd >= d.balanceAsOf) liabilities = addMinor(liabilities, d.currentBalance);
    }

    points.push({ date: monthEnd, netWorth: subMinor(assetsTotal, liabilities) });
  }
  return points;
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** The last-day-of-month ISO dates for every month touched by [from, to]. */
function monthEndsInRange(from: IsoDate, to: IsoDate): IsoDate[] {
  const [fy, fm] = from.split("-").map(Number);
  const [ty, tm] = to.split("-").map(Number);
  const out: IsoDate[] = [];
  let idx = fy * 12 + (fm - 1);
  const end = ty * 12 + (tm - 1);
  for (; idx <= end; idx++) {
    const y = Math.floor(idx / 12);
    const m = (idx % 12) + 1; // 1-12
    const lastDay = new Date(y, m, 0).getDate();
    out.push(`${y}-${pad2(m)}-${pad2(lastDay)}`);
  }
  return out;
}
