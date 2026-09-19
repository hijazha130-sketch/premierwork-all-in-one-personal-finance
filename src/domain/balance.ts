/**
 * Balance calculator (Section 7). Pure and fully unit-tested.
 *   current balance = openingBalance + Σ(cleared in) − Σ(cleared out)
 * Transfers net correctly (out of one account, in to another) because each
 * half carries its own direction on its own account.
 */
import type { Account, IsoDate, Minor, Transaction } from "@/domain/types";
import { addMinor } from "@/lib/money";

/**
 * Balance for one account from its cleared transactions, as of a date. When
 * `asOf` is given, only transactions dated on/before it count (the opening
 * balance is always the baseline) — this is the single balance derivation both
 * "now" and the net-worth-over-time series share. Omit `asOf` for "now".
 */
export function accountBalanceAsOf(
  account: Account,
  transactions: Transaction[],
  asOf?: IsoDate,
): Minor {
  let balance = account.openingBalance;
  for (const t of transactions) {
    if (t.accountId !== account.id) continue;
    if (!t.cleared) continue;
    if (asOf != null && t.date > asOf) continue;
    balance = t.direction === "in" ? addMinor(balance, t.amount) : addMinor(balance, -t.amount);
  }
  return balance;
}

/** Balance for one account from its cleared transactions (now). */
export function accountBalance(account: Account, transactions: Transaction[]): Minor {
  return accountBalanceAsOf(account, transactions);
}

/** Total balance across all (non-archived) accounts. Transfers net to zero. */
export function totalBalance(accounts: Account[], transactions: Transaction[]): Minor {
  const byId = new Map(accounts.map((a) => [a.id, a]));
  let total = 0;
  for (const a of accounts) total = addMinor(total, a.openingBalance);
  for (const t of transactions) {
    if (!t.cleared) continue;
    if (!byId.has(t.accountId)) continue; // orphan-guard
    total = t.direction === "in" ? addMinor(total, t.amount) : addMinor(total, -t.amount);
  }
  return total;
}

/** Balances keyed by accountId, for list views. */
export function balancesByAccount(
  accounts: Account[],
  transactions: Transaction[],
): Record<string, Minor> {
  const out: Record<string, Minor> = {};
  for (const a of accounts) out[a.id] = accountBalance(a, transactions);
  return out;
}
