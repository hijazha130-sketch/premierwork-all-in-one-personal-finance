import { useState } from "react";
import { useData, useCurrency } from "@/state/dataContext";
import { Button, Card, Field, SelectInput, Sheet, Segmented, TextInput } from "@/components/ui";
import { MoneyAmount } from "@/components/MoneyAmount";
import { EmptyState } from "@/components/EmptyState";
import { nextUnpaidByRule } from "@/domain/occurrences";
import { parseMajorToMinor, minorToMajor } from "@/lib/money";
import { validateAmount, validateDate } from "@/lib/validation";
import { todayIso } from "@/lib/period";
import type { RecurringFrequency, RecurringRule, TransactionDirection } from "@/domain/types";

/**
 * "Repeating" view inside Money — manage repeating bills and income. Customer
 * language only: never shows the internal terms (a repeating item is a "bill" or
 * "income"; its next date is shown plainly). Reads the shared derived state and
 * uses the repository; it computes no money math itself.
 */

const FREQUENCIES: { value: RecurringFrequency; label: string }[] = [
  { value: "oneTime", label: "One time" },
  { value: "everyWeek", label: "Weekly" },
  { value: "every2Weeks", label: "Every 2 weeks" },
  { value: "every4Weeks", label: "Every 4 weeks" },
  { value: "everyMonth", label: "Monthly" },
  { value: "every2Months", label: "Every 2 months" },
  { value: "everyQuarter", label: "Every 3 months" },
  { value: "every6Months", label: "Every 6 months" },
  { value: "everyYear", label: "Yearly" },
];

function freqLabel(f: RecurringFrequency): string {
  return FREQUENCIES.find((x) => x.value === f)?.label ?? "";
}

function shortDate(iso: string, locale: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(locale, { day: "numeric", month: "short" });
}

export function RepeatingRules() {
  const { recurringRules, accounts, categories, people, repo, derived } = useData();
  const { locale } = useCurrency();
  const [editing, setEditing] = useState<RecurringRule | null>(null);
  const [adding, setAdding] = useState(false);

  const nextByRule = nextUnpaidByRule(derived.occurrences);

  function whenLine(item: RecurringRule): { text: string; tone: "muted" | "attention" } {
    const schedule = freqLabel(item.frequency);
    if (!item.active) return { text: `${schedule} · Paused`, tone: "muted" };
    const next = nextByRule.get(item.id);
    if (!next) return { text: `${schedule} · Nothing coming up`, tone: "muted" };
    const d = shortDate(next.displayDate, locale);
    return next.status === "overdue"
      ? { text: `${schedule} · Due ${d}`, tone: "attention" }
      : { text: `${schedule} · Next on ${d}`, tone: "muted" };
  }

  return (
    <Card>
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-display text-2xl text-ink">Repeating bills &amp; income</h2>
        <Button onClick={() => setAdding(true)}>+ Add</Button>
      </div>

      {recurringRules.length === 0 ? (
        <EmptyState
          icon="↻"
          title="No repeating items yet"
          message="Add a bill or your income once, and it will show up here with its next date — no re-typing every month."
          action={<Button onClick={() => setAdding(true)}>Add a bill or income</Button>}
        />
      ) : (
        <div className="divide-y divide-hairline">
          {recurringRules.map((item) => {
            const when = whenLine(item);
            const isIn = item.direction === "in";
            return (
              <div key={item.id} className="flex items-center gap-4 py-3">
                <span
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm ${
                    isIn ? "bg-positive/15 text-positive" : "bg-inset text-muted"
                  }`}
                  aria-hidden
                >
                  {isIn ? "↓" : "↑"}
                </span>
                <div className="min-w-0 flex-1">
                  <div className={`truncate font-medium ${item.active ? "text-ink" : "text-muted"}`}>{item.name}</div>
                  <div className={`truncate text-xs ${when.tone === "attention" ? "text-attention" : "text-muted"}`}>
                    {when.text}
                  </div>
                </div>
                <MoneyAmount amount={item.amount} size="sm" tone={isIn ? "positive" : "default"} />
                <div className="flex items-center gap-3 text-sm">
                  <button className="text-gold hover:underline" onClick={() => setEditing(item)}>
                    Edit
                  </button>
                  {item.active ? (
                    <button className="text-muted hover:text-ink" onClick={() => repo.pauseRecurringRule(item.id)}>
                      Pause
                    </button>
                  ) : (
                    <button className="text-muted hover:text-ink" onClick={() => repo.resumeRecurringRule(item.id)}>
                      Resume
                    </button>
                  )}
                  <button className="text-muted hover:text-attention" onClick={() => repo.archiveRecurringRule(item.id)}>
                    Remove
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <RepeatingForm
        open={adding || !!editing}
        item={editing}
        accounts={accounts}
        categories={categories}
        people={people}
        onClose={() => {
          setAdding(false);
          setEditing(null);
        }}
        onSave={async (data) => {
          if (editing) await repo.updateRecurringRule(editing.id, data);
          else await repo.createRecurringRule(data);
          setAdding(false);
          setEditing(null);
        }}
      />
    </Card>
  );
}

interface FormData {
  name: string;
  amount: number;
  direction: TransactionDirection;
  type: "expense" | "income";
  accountId: string;
  categoryId: string | null;
  personId: string | null;
  frequency: RecurringFrequency;
  anchorDate: string;
  endDate: string | null;
}

function RepeatingForm({
  open,
  item,
  accounts,
  categories,
  people,
  onClose,
  onSave,
}: {
  open: boolean;
  item: RecurringRule | null;
  accounts: ReturnType<typeof useData>["accounts"];
  categories: ReturnType<typeof useData>["categories"];
  people: ReturnType<typeof useData>["people"];
  onClose: () => void;
  onSave: (data: FormData) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [direction, setDirection] = useState<TransactionDirection>("out");
  const [amountText, setAmountText] = useState("");
  const [accountId, setAccountId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [personId, setPersonId] = useState("");
  const [frequency, setFrequency] = useState<RecurringFrequency>("everyMonth");
  const [anchorDate, setAnchorDate] = useState(todayIso());
  const [endDate, setEndDate] = useState("");
  const [error, setError] = useState("");

  const expenseCats = categories.filter((c) => c.bucket !== "income");
  const incomeCats = categories.filter((c) => c.bucket === "income");
  const activeCats = direction === "in" ? incomeCats : expenseCats;

  // Initialise on open / target change (adjust-state-during-render pattern).
  const key = (item?.id ?? "new") + String(open);
  const [lastKey, setLastKey] = useState("");
  if (open && key !== lastKey) {
    setLastKey(key);
    setName(item?.name ?? "");
    setDirection(item?.direction ?? "out");
    setAmountText(item ? String(minorToMajor(item.amount)) : "");
    setAccountId(item?.accountId ?? accounts[0]?.id ?? "");
    setCategoryId(item?.categoryId ?? "");
    setPersonId(item?.personId ?? "");
    setFrequency(item?.frequency ?? "everyMonth");
    setAnchorDate(item?.anchorDate ?? todayIso());
    setEndDate(item?.endDate ?? "");
    setError("");
  }

  async function submit() {
    if (!name.trim()) return setError("Give it a name.");
    const amount = parseMajorToMinor(amountText);
    const av = validateAmount(amount);
    if (!av.ok) return setError(av.error!);
    const dv = validateDate(anchorDate);
    if (!dv.ok) return setError(dv.error!);
    if (endDate) {
      const ev = validateDate(endDate);
      if (!ev.ok) return setError(ev.error!);
    }
    await onSave({
      name: name.trim(),
      amount: amount!,
      direction,
      type: direction === "in" ? "income" : "expense",
      accountId,
      categoryId: categoryId || null,
      personId: personId || null,
      frequency,
      anchorDate,
      endDate: endDate || null,
    });
  }

  return (
    <Sheet open={open} onClose={onClose} title={item ? "Edit repeating item" : "Add a bill or income"}>
      {accounts.length === 0 ? (
        <p className="text-muted">Add an account first, then you can set up repeating bills.</p>
      ) : (
        <div className="space-y-4">
          <Segmented
            ariaLabel="Money out or in"
            value={direction}
            onChange={(d) => {
              setDirection(d);
              setCategoryId("");
            }}
            options={[
              { value: "out", label: "Money out (a bill)" },
              { value: "in", label: "Money in (income)" },
            ]}
          />
          <Field label="Name">
            <TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Netflix" />
          </Field>
          <Field label="Amount">
            <TextInput inputMode="decimal" value={amountText} onChange={(e) => setAmountText(e.target.value)} placeholder="0" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Account">
              <SelectInput value={accountId} onChange={(e) => setAccountId(e.target.value)}>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </SelectInput>
            </Field>
            <Field label="Group">
              <SelectInput value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
                <option value="">None</option>
                {activeCats.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </SelectInput>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="How often">
              <SelectInput value={frequency} onChange={(e) => setFrequency(e.target.value as RecurringFrequency)}>
                {FREQUENCIES.map((f) => (
                  <option key={f.value} value={f.value}>
                    {f.label}
                  </option>
                ))}
              </SelectInput>
            </Field>
            {people.length > 0 && (
              <Field label="Who">
                <SelectInput value={personId} onChange={(e) => setPersonId(e.target.value)}>
                  <option value="">Anyone</option>
                  {people.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </SelectInput>
              </Field>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Start date">
              <TextInput type="date" value={anchorDate} onChange={(e) => setAnchorDate(e.target.value)} />
            </Field>
            <Field label="Ends (optional)">
              <TextInput type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </Field>
          </div>
          {error && <p className="text-sm text-attention">{error}</p>}
          <Button className="w-full" onClick={submit}>
            {item ? "Save changes" : "Add"}
          </Button>
        </div>
      )}
    </Sheet>
  );
}
