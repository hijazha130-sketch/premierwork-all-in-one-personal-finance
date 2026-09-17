/**
 * Ledger display rows. Collapses the two halves of a transfer into a single
 * "moved money" item so the user never sees two confusing entries (Section 8).
 * Pure — takes transactions, returns display rows newest first.
 */
import type { Transaction } from "@/domain/types";

export interface DisplayRow {
  kind: "single" | "transfer";
  id: string; // representative transaction id (the "out" half for transfers)
  date: string;
  amount: number;
  transaction: Transaction; // representative
  fromAccountId?: string;
  toAccountId?: string;
}

export function buildLedgerRows(transactions: Transaction[]): DisplayRow[] {
  const rows: DisplayRow[] = [];
  const seenGroups = new Set<string>();

  for (const t of transactions) {
    if (t.type === "transfer" && t.transferGroupId) {
      if (seenGroups.has(t.transferGroupId)) continue;
      seenGroups.add(t.transferGroupId);
      const pair = transactions.filter((x) => x.transferGroupId === t.transferGroupId);
      const out = pair.find((x) => x.direction === "out");
      const inn = pair.find((x) => x.direction === "in");
      const rep = out ?? t;
      rows.push({
        kind: "transfer",
        id: rep.id,
        date: rep.date,
        amount: rep.amount,
        transaction: rep,
        fromAccountId: out?.accountId,
        toAccountId: inn?.accountId,
      });
    } else {
      rows.push({
        kind: "single",
        id: t.id,
        date: t.date,
        amount: t.amount,
        transaction: t,
      });
    }
  }

  // Newest first (transactions come pre-sorted, but resort defensively).
  return rows.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}
