import type { Account, Transaction, TransactionType } from "@/domain/types";

let n = 0;
const uid = (p: string) => `${p}_${++n}`;

export function makeAccount(partial: Partial<Account> = {}): Account {
  const now = Date.now();
  return {
    id: partial.id ?? uid("acc"),
    name: partial.name ?? "Everyday",
    type: partial.type ?? "checking",
    openingBalance: partial.openingBalance ?? 0,
    currencyCode: "PKR",
    archived: partial.archived ?? false,
    createdAt: now,
    updatedAt: now,
  };
}

export function makeTx(partial: Partial<Transaction> & { accountId: string }): Transaction {
  const now = Date.now();
  const type: TransactionType = partial.type ?? "expense";
  return {
    id: partial.id ?? uid("tx"),
    date: partial.date ?? "2026-09-15",
    amount: partial.amount ?? 0,
    direction: partial.direction ?? (type === "income" ? "in" : "out"),
    type,
    categoryId: partial.categoryId ?? (type === "transfer" ? null : "cat_1"),
    accountId: partial.accountId,
    personId: partial.personId ?? null,
    source: "manual",
    note: partial.note,
    cleared: partial.cleared ?? true,
    transferGroupId: partial.transferGroupId ?? null,
    recurringRuleId: partial.recurringRuleId ?? null,
    occurrenceDate: partial.occurrenceDate ?? null,
    goalId: null,
    debtId: null,
    investmentId: null,
    createdAt: now,
    updatedAt: now,
  };
}

/** A pair of transfer transactions sharing a group id. */
export function makeTransfer(fromId: string, toId: string, amount: number, date = "2026-09-16"): Transaction[] {
  const group = uid("grp");
  return [
    makeTx({ accountId: fromId, amount, type: "transfer", direction: "out", categoryId: null, transferGroupId: group, date }),
    makeTx({ accountId: toId, amount, type: "transfer", direction: "in", categoryId: null, transferGroupId: group, date }),
  ];
}
