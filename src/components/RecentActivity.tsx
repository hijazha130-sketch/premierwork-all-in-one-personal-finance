import { useData } from "@/state/dataContext";
import { useCapture } from "@/state/CaptureProvider";
import { MoneyAmount } from "@/components/MoneyAmount";
import { buildLedgerRows, type DisplayRow } from "@/domain/ledger";
import { formatDateLabel } from "@/lib/period";

/** A tappable transaction row (opens the editor). Shared by Home and Money. */
export function TransactionRow({ row }: { row: DisplayRow }) {
  const { categoriesById, accountsById } = useData();
  const { openEditor } = useCapture();
  const t = row.transaction;

  const isTransfer = row.kind === "transfer";
  const isIncome = t.type === "income";
  const category = t.categoryId ? categoriesById.get(t.categoryId) : undefined;

  const label = isTransfer
    ? "Moved money"
    : category?.name ?? (isIncome ? "Money coming in" : "Uncategorized");

  const sub = isTransfer
    ? `${accountsById.get(row.fromAccountId ?? "")?.name ?? "—"} → ${
        accountsById.get(row.toAccountId ?? "")?.name ?? "—"
      }`
    : accountsById.get(t.accountId)?.name ?? "—";

  return (
    <button
      onClick={() => openEditor(row.id)}
      className="w-full flex items-center gap-4 py-3 text-left border-b border-hairline last:border-0 hover:bg-inset/40 -mx-2 px-2 rounded-control"
    >
      <span
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm"
        style={{ backgroundColor: (category?.color ?? "#8888") + "22", color: category?.color ?? undefined }}
        aria-hidden
      >
        {isTransfer ? "⇄" : isIncome ? "↓" : "↑"}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-ink font-medium">{label}</span>
        <span className="block truncate text-xs text-muted">
          {sub} · {formatDateLabel(t.date)}
          {t.note ? ` · ${t.note}` : ""}
        </span>
      </span>
      <MoneyAmount
        amount={isTransfer ? row.amount : isIncome ? row.amount : -row.amount}
        size="sm"
        signed={isIncome && !isTransfer}
        tone={isTransfer ? "muted" : isIncome ? "positive" : "default"}
      />
    </button>
  );
}

export function RecentActivity({ limit }: { limit?: number }) {
  const { transactions } = useData();
  const rows = buildLedgerRows(transactions);
  const shown = limit ? rows.slice(0, limit) : rows;
  return (
    <div>
      {shown.map((row) => (
        <TransactionRow key={row.id} row={row} />
      ))}
    </div>
  );
}
