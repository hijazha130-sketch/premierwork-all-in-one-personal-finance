import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useData } from "@/state/dataContext";
import { useCapture } from "@/state/CaptureProvider";
import { Button, Card, SectionTitle, Segmented, SelectInput, TextInput } from "@/components/ui";
import { MoneyAmount } from "@/components/MoneyAmount";
import { EmptyState } from "@/components/EmptyState";
import { TransactionRow } from "@/components/RecentActivity";
import { RepeatingRules } from "@/screens/RepeatingRules";
import { Calendar } from "@/screens/Calendar";
import { buildLedgerRows } from "@/domain/ledger";
import { filterTransactions, sumTransactions } from "@/domain/aggregation";
import type { DateRange } from "@/lib/period";

type MoneyView = "activity" | "repeating" | "calendar";

/**
 * Money (Section 8). The ledger: transactions newest first with money in/out
 * visually distinct, filters by date/group/account/person, account balances as
 * a simple list, and a running total of what's shown.
 */
export function Money() {
  const { accounts, categories, people, transactions, derived } = useData();
  const { openCapture } = useCapture();

  const [view, setView] = useState<MoneyView>("activity");
  const [categoryId, setCategoryId] = useState("");
  const [accountId, setAccountId] = useState("");
  const [personId, setPersonId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const range: DateRange | undefined = from || to ? { from: from || "0000-01-01", to: to || "9999-12-31" } : undefined;

  const filtered = useMemo(
    () =>
      filterTransactions(transactions, {
        categoryId: categoryId || undefined,
        accountId: accountId || undefined,
        personId: personId || undefined,
        range,
        includeTransfers: true,
        includeUncleared: true,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [transactions, categoryId, accountId, personId, from, to],
  );

  const rows = buildLedgerRows(filtered);

  const filteredOut = sumTransactions(transactions, {
    type: "expense",
    categoryId: categoryId || undefined,
    accountId: accountId || undefined,
    personId: personId || undefined,
    range,
  });
  const filteredIn = sumTransactions(transactions, {
    type: "income",
    categoryId: categoryId || undefined,
    accountId: accountId || undefined,
    personId: personId || undefined,
    range,
  });

  const hasFilters = !!(categoryId || accountId || personId || from || to);

  if (accounts.length === 0) {
    return (
      <div className="max-w-2xl">
        <SectionTitle overline="Money" title="Your ledger" subtitle="Every bit of money in and out, in one place." />
        <EmptyState
          icon="✦"
          title="No accounts yet"
          message="Add your first account in setup, then your transactions and balances show up here."
          action={
            <Link to="/setup">
              <Button>Start setup</Button>
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <SectionTitle
        overline="Money"
        title="Your money"
        subtitle={
          view === "activity"
            ? "Everything in and out — and what's in each account."
            : view === "repeating"
              ? "Bills and income that repeat — set once, tracked automatically."
              : "What's due and when — planned bills and money you've recorded."
        }
      />

      <Segmented
        ariaLabel="View"
        value={view}
        onChange={setView}
        options={[
          { value: "activity", label: "Activity" },
          { value: "repeating", label: "Repeating" },
          { value: "calendar", label: "Calendar" },
        ]}
      />

      {view === "repeating" ? (
        <RepeatingRules />
      ) : view === "calendar" ? (
        <Calendar />
      ) : (
        <>
      {/* Account balances */}
      <Card>
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display text-2xl text-ink">Balances</h2>
          <Link to="/accounts" className="text-sm text-gold hover:underline">
            Manage accounts
          </Link>
        </div>
        <div className="divide-y divide-hairline">
          {accounts.map((a) => (
            <div key={a.id} className="flex items-center justify-between py-3">
              <span className="text-ink">{a.name}</span>
              <MoneyAmount amount={derived.balances[a.id] ?? a.openingBalance} size="sm" />
            </div>
          ))}
          <div className="flex items-center justify-between py-3">
            <span className="text-muted text-sm uppercase tracking-widest font-semibold">Total</span>
            <MoneyAmount amount={derived.total} size="md" />
          </div>
        </div>
      </Card>

      {/* Filters */}
      <Card>
        <h2 className="font-display text-2xl text-ink mb-4">Activity</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
          <SelectInput value={accountId} onChange={(e) => setAccountId(e.target.value)} aria-label="Account">
            <option value="">All accounts</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </SelectInput>
          <SelectInput value={categoryId} onChange={(e) => setCategoryId(e.target.value)} aria-label="Group">
            <option value="">All groups</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </SelectInput>
          {people.length > 0 && (
            <SelectInput value={personId} onChange={(e) => setPersonId(e.target.value)} aria-label="Person">
              <option value="">Anyone</option>
              {people.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </SelectInput>
          )}
          <TextInput type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="From date" />
          <TextInput type="date" value={to} onChange={(e) => setTo(e.target.value)} aria-label="To date" />
          {hasFilters && (
            <Button
              variant="quiet"
              onClick={() => {
                setCategoryId("");
                setAccountId("");
                setPersonId("");
                setFrom("");
                setTo("");
              }}
            >
              Clear
            </Button>
          )}
        </div>

        {/* Filtered totals */}
        {hasFilters && (
          <div className="flex flex-wrap gap-6 mb-4 text-sm">
            <span className="text-muted">
              In: <MoneyAmount amount={filteredIn} size="sm" tone="positive" />
            </span>
            <span className="text-muted">
              Out: <MoneyAmount amount={filteredOut} size="sm" tone="attention" />
            </span>
          </div>
        )}

        {rows.length === 0 ? (
          <EmptyState
            icon="＋"
            title={hasFilters ? "Nothing matches" : "No transactions yet"}
            message={hasFilters ? "Try clearing a filter." : "Add your first one — it takes a couple of taps."}
            action={!hasFilters ? <Button onClick={() => openCapture("expense")}>Log a spend</Button> : undefined}
          />
        ) : (
          <div>
            {rows.map((row) => (
              <TransactionRow key={row.id} row={row} />
            ))}
          </div>
        )}
      </Card>
        </>
      )}
    </div>
  );
}
