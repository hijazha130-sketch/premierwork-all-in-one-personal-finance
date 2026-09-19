import { useState } from "react";
import { useData, useCurrency } from "@/state/dataContext";
import { useCapture } from "@/state/CaptureProvider";
import { Card, Button, Segmented, Sheet, Field, TextInput } from "@/components/ui";
import { MoneyAmount } from "@/components/MoneyAmount";
import { EmptyState } from "@/components/EmptyState";
import { parseMajorToMinor, minorToMajor } from "@/lib/money";
import { formatDateLabel } from "@/lib/period";
import type { Debt, DebtStrategy } from "@/domain/types";

/**
 * Plan → Debt. The debts you're paying off, in the plan's payoff order, with the
 * debt-free date and the interest you'll pay — all read from derived state
 * (debtPlan). A method toggle and a monthly-extra input feed the plan; a
 * "Record payment" logs money against a debt (the balance stays yours to update).
 */
export function DebtView() {
  const { debts, settings, derived, repo } = useData();
  const { symbol, locale } = useCurrency();
  const { openDebtPayment } = useCapture();
  const [editing, setEditing] = useState<Debt | "new" | null>(null);

  const plan = derived.debtPlan;
  const byId = new Map(debts.map((d) => [d.id, d]));
  const orderedDebts = plan.debts.map((p) => byId.get(p.debtId)).filter((d): d is Debt => !!d);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-2xl text-ink">Your debts</h2>
        <Button variant="ghost" onClick={() => setEditing("new")}>
          Add a debt
        </Button>
      </div>

      {debts.length === 0 ? (
        <EmptyState
          icon="◔"
          title="No debts tracked"
          message="Add a debt — its balance, rate and minimum — and you'll see when you'll be debt-free and the interest you'll pay along the way."
          action={<Button onClick={() => setEditing("new")}>Add a debt</Button>}
        />
      ) : (
        <>
          {/* Plan controls + summary */}
          <Card>
            <div className="text-xs font-semibold uppercase tracking-widest text-muted mb-2">Your plan</div>
            <Segmented
              ariaLabel="How to pay off"
              value={(settings?.debtStrategy ?? "avalanche") as DebtStrategy}
              onChange={(s) => repo.saveSettings({ debtStrategy: s })}
              options={[
                { value: "avalanche", label: "Pay off highest-rate first" },
                { value: "snowball", label: "Pay off smallest first" },
              ]}
            />
            <div className="mt-4">
              <MonthlyExtra
                value={settings?.debtMonthlyExtra ?? 0}
                onCommit={(extra) => repo.saveSettings({ debtMonthlyExtra: extra })}
              />
            </div>

            <div className="mt-5 grid grid-cols-2 gap-4">
              <div>
                <div className="text-xs font-semibold uppercase tracking-widest text-muted mb-1">Debt-free date</div>
                {plan.debtFreeDate ? (
                  <div className="font-display text-2xl text-ink">{formatDateLabel(plan.debtFreeDate, locale)}</div>
                ) : (
                  <div className="text-sm text-muted">Not reached at this payment</div>
                )}
              </div>
              <div>
                <div className="text-xs font-semibold uppercase tracking-widest text-muted mb-1">Interest you'll pay</div>
                <MoneyAmount amount={plan.totalInterest} size="md" tone="attention" />
              </div>
            </div>

            {plan.anyWontPayOff && (
              <p className="mt-4 text-sm text-attention">
                At least one debt won't be cleared at its current payment — raise its minimum or add a little more each month.
              </p>
            )}
          </Card>

          {/* Debts, in payoff order */}
          <div className="space-y-4">
            {orderedDebts.map((d, i) => {
              const p = plan.debts.find((x) => x.debtId === d.id)!;
              return (
                <Card key={d.id}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted">#{i + 1}</span>
                        <h3 className="font-display text-xl text-ink truncate">{d.name}</h3>
                      </div>
                      <div className="text-sm text-muted mt-0.5">
                        <MoneyAmount amount={d.currentBalance} size="sm" /> · {d.annualInterestRate}%/yr · min{" "}
                        {formatShort(d.minimumPayment, symbol, locale)}/mo
                      </div>
                    </div>
                  </div>

                  <div className="mt-2 text-sm">
                    {p.wontPayOff ? (
                      <span className="text-attention">Won't be cleared at this payment</span>
                    ) : p.payoffDate ? (
                      <span className="text-positive">Debt-free by {formatDateLabel(p.payoffDate, locale)}</span>
                    ) : (
                      <span className="text-muted">Already cleared</span>
                    )}
                  </div>

                  <div className="mt-4 flex flex-wrap gap-3">
                    <Button onClick={() => openDebtPayment(d)}>Record payment</Button>
                    <Button variant="ghost" onClick={() => setEditing(d)}>
                      Edit
                    </Button>
                  </div>
                </Card>
              );
            })}
          </div>
        </>
      )}

      {editing && (
        <DebtSheet
          debt={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSave={async (data) => {
            if (editing === "new") await repo.createDebt(data);
            else await repo.updateDebt(editing.id, data);
            setEditing(null);
          }}
          onArchive={
            editing === "new"
              ? undefined
              : async () => {
                  await repo.archiveDebt((editing as Debt).id);
                  setEditing(null);
                }
          }
        />
      )}
    </div>
  );
}

function formatShort(minor: number, symbol: string, locale: string): string {
  const major = Math.abs(minor) / 100;
  return `${symbol} ${new Intl.NumberFormat(locale, { maximumFractionDigits: major % 1 === 0 ? 0 : 2 }).format(major)}`;
}

/** Extra-each-month input; commits the parsed amount on blur/Enter. */
function MonthlyExtra({ value, onCommit }: { value: number; onCommit: (extra: number) => void }) {
  const [text, setText] = useState(String(minorToMajor(value)));
  const [last, setLast] = useState(value);
  if (value !== last) {
    setLast(value);
    setText(String(minorToMajor(value)));
  }
  function commit() {
    const amount = parseMajorToMinor(text);
    if (amount != null && amount >= 0) onCommit(amount);
    else setText(String(minorToMajor(value)));
  }
  return (
    <label className="flex items-center justify-between gap-3">
      <span className="text-sm text-ink">A little extra each month</span>
      <input
        inputMode="decimal"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
        className="w-32 rounded-control bg-inset border border-hairline px-3 py-2 text-right text-ink focus:border-gold outline-none min-h-[44px]"
      />
    </label>
  );
}

type DebtDraft = Omit<Debt, "id" | "createdAt" | "updatedAt" | "archived" | "paidOffAt" | "customOrder">;

function DebtSheet({
  debt,
  onClose,
  onSave,
  onArchive,
}: {
  debt: Debt | null;
  onClose: () => void;
  onSave: (data: DebtDraft) => void | Promise<void>;
  onArchive?: () => void | Promise<void>;
}) {
  const [name, setName] = useState(debt?.name ?? "");
  const [balance, setBalance] = useState(debt ? String(minorToMajor(debt.currentBalance)) : "");
  const [rate, setRate] = useState(debt ? String(debt.annualInterestRate) : "");
  const [minimum, setMinimum] = useState(debt ? String(minorToMajor(debt.minimumPayment)) : "");
  const [error, setError] = useState("");

  function save() {
    const currentBalance = parseMajorToMinor(balance);
    if (currentBalance == null || currentBalance < 0) return setError("Enter the amount you owe.");
    const minimumPayment = parseMajorToMinor(minimum) ?? 0;
    const annualInterestRate = Number(rate);
    if (!Number.isFinite(annualInterestRate) || annualInterestRate < 0) return setError("Enter a yearly rate, e.g. 24.");
    onSave({
      name: name.trim() || "Untitled debt",
      currentBalance,
      annualInterestRate,
      minimumPayment,
      balanceAsOf: debt?.balanceAsOf ?? new Date().toISOString().slice(0, 10),
    });
  }

  return (
    <Sheet open onClose={onClose} title={debt ? "Edit debt" : "Add a debt"}>
      <div className="space-y-5">
        <Field label="Name">
          <TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Credit card" autoFocus />
        </Field>
        <Field label="Amount you owe">
          <TextInput inputMode="decimal" value={balance} onChange={(e) => { setBalance(e.target.value); setError(""); }} placeholder="0" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Yearly rate %">
            <TextInput inputMode="decimal" value={rate} onChange={(e) => { setRate(e.target.value); setError(""); }} placeholder="e.g. 24" />
          </Field>
          <Field label="Minimum a month">
            <TextInput inputMode="decimal" value={minimum} onChange={(e) => setMinimum(e.target.value)} placeholder="0" />
          </Field>
        </div>

        {error && <p className="text-sm text-attention">{error}</p>}

        <div className="flex items-center gap-3 pt-2">
          <Button className="flex-1" onClick={save}>
            {debt ? "Save changes" : "Add debt"}
          </Button>
          {onArchive && (
            <Button variant="danger" onClick={onArchive}>
              Archive
            </Button>
          )}
        </div>
      </div>
    </Sheet>
  );
}
