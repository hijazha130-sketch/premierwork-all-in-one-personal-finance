import { useEffect, useMemo, useState } from "react";
import { useData } from "@/state/dataContext";
import { useCapture } from "@/state/CaptureProvider";
import { Button, Field, SelectInput, Sheet, Segmented, TextInput } from "@/components/ui";
import { parseMajorToMinor, minorToMajor } from "@/lib/money";
import { validateAmount, validateDate } from "@/lib/validation";
import { todayIso } from "@/lib/period";
import type { TransactionType } from "@/domain/types";

/**
 * Quick capture (Section 8 & 9). One field required — the amount. Category,
 * account, person and date are pre-filled and one-tap editable. A prominent
 * Save. Optional note behind a "more" affordance. Also serves as the editor for
 * an existing transaction (edit or delete).
 */
export function QuickCapture() {
  const { open, mode, editingId, confirm, link, close } = useCapture();
  const { repo, accounts, categories, people, transactions } = useData();

  const editing = useMemo(
    () => (editingId ? transactions.find((t) => t.id === editingId) : undefined),
    [editingId, transactions],
  );

  const expenseCategories = categories.filter((c) => c.bucket !== "income");
  const incomeCategories = categories.filter((c) => c.bucket === "income");

  const [type, setType] = useState<TransactionType>("expense");
  const [amountText, setAmountText] = useState("");
  const [categoryId, setCategoryId] = useState<string>("");
  const [accountId, setAccountId] = useState<string>("");
  const [toAccountId, setToAccountId] = useState<string>("");
  const [personId, setPersonId] = useState<string>("");
  const [date, setDate] = useState(todayIso());
  const [note, setNote] = useState("");
  const [showNote, setShowNote] = useState(false);
  const [error, setError] = useState<string>("");
  const [saving, setSaving] = useState(false);

  // Initialise the form whenever the sheet opens (confirm a bill, edit, or new).
  useEffect(() => {
    if (!open) return;
    if (confirm) {
      const { rule, occurrence } = confirm;
      setType(rule.type);
      setAmountText(String(minorToMajor(occurrence.amount)));
      setCategoryId(rule.categoryId ?? "");
      setAccountId(rule.accountId);
      setPersonId(rule.personId ?? "");
      setDate(occurrence.displayDate);
      setNote("");
      setShowNote(false);
    } else if (link) {
      // A contribution toward a goal or a payment on a debt — always money out.
      setType("expense");
      setAmountText("");
      const defaultCat = link.kind === "goal" ? link.goal.categoryId : null;
      setCategoryId(defaultCat ?? expenseCategories[0]?.id ?? "");
      setAccountId(accounts[0]?.id ?? "");
      setPersonId("");
      setDate(todayIso());
      setNote("");
      setShowNote(false);
    } else if (editing) {
      setType(editing.type);
      setAmountText(String(minorToMajor(editing.amount)));
      setCategoryId(editing.categoryId ?? "");
      setAccountId(editing.accountId);
      setPersonId(editing.personId ?? "");
      setDate(editing.date);
      setNote(editing.note ?? "");
      setShowNote(!!editing.note);
    } else {
      setType(mode);
      setAmountText("");
      setCategoryId((mode === "income" ? incomeCategories[0] : expenseCategories[0])?.id ?? "");
      setAccountId(accounts[0]?.id ?? "");
      setToAccountId(accounts[1]?.id ?? accounts[0]?.id ?? "");
      setPersonId("");
      setDate(todayIso());
      setNote("");
      setShowNote(false);
    }
    setError("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editingId, mode, confirm, link]);

  const isTransfer = type === "transfer";

  async function handleSave() {
    const amount = parseMajorToMinor(amountText);
    const av = validateAmount(amount);
    if (!av.ok) return setError(av.error!);
    const dv = validateDate(date);
    if (!dv.ok) return setError(dv.error!);

    setSaving(true);
    try {
      if (confirm) {
        // Mark as paid: confirm the planned item into a real transaction through
        // the single existing path. occurrenceDate stays the SCHEDULED date (the
        // canonical key) even if the user edited the actual date.
        await repo.createTransactionFromOccurrence(confirm.rule, confirm.occurrence.date, {
          amount: amount!,
          date,
          categoryId: categoryId || null,
          accountId,
          personId: personId || null,
          note: note.trim() || undefined,
          cleared: true,
        });
      } else if (link) {
        // A goal contribution or a debt payment — a real "out" transaction with
        // the goal/debt link set (recordContribution / recordDebtPayment).
        const common = {
          amount: amount!,
          date,
          accountId,
          categoryId: categoryId || null,
          personId: personId || null,
          note: note.trim() || undefined,
          cleared: true,
        };
        if (link.kind === "goal") await repo.recordContribution(link.goal, common);
        else await repo.recordDebtPayment(link.debt, common);
      } else if (editing) {
        await repo.updateTransaction(editing.id, {
          amount: amount!,
          categoryId: editing.type === "transfer" ? null : categoryId || null,
          accountId,
          personId: personId || null,
          date,
          note: note.trim() || undefined,
        });
      } else if (isTransfer) {
        await repo.createTransfer({
          date,
          amount: amount!,
          fromAccountId: accountId,
          toAccountId,
          personId: personId || null,
          note: note.trim() || undefined,
        });
      } else {
        await repo.createTransaction({
          date,
          amount: amount!,
          direction: type === "income" ? "in" : "out",
          type,
          categoryId: categoryId || null,
          accountId,
          personId: personId || null,
          source: "manual",
          note: note.trim() || undefined,
          cleared: true,
        });
      }
      close();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!editing) return;
    setSaving(true);
    try {
      await repo.deleteTransaction(editing.id);
      close();
    } finally {
      setSaving(false);
    }
  }

  const title = confirm
    ? confirm.rule.type === "income"
      ? "Confirm money in"
      : "Confirm this bill"
    : link
      ? link.kind === "goal"
        ? `Set aside for ${link.goal.name}`
        : `Record a payment on ${link.debt.name}`
      : editing
        ? editing.type === "transfer"
          ? "Edit moved money"
          : "Edit"
        : isTransfer
          ? "Move money"
          : type === "income"
            ? "Add money coming in"
            : "Add a spend";

  const activeCategories = type === "income" ? incomeCategories : expenseCategories;

  return (
    <Sheet open={open} onClose={close} title={title}>
      {accounts.length === 0 ? (
        <p className="text-muted">Add an account first, then you can record money here.</p>
      ) : (
        <div className="space-y-5">
          {!editing && !confirm && !link && (
            <Segmented
              ariaLabel="Type"
              value={type}
              onChange={(t) => {
                setType(t);
                if (t !== "transfer") {
                  const list = t === "income" ? incomeCategories : expenseCategories;
                  setCategoryId(list[0]?.id ?? "");
                }
              }}
              options={[
                { value: "expense", label: "Spend" },
                { value: "income", label: "Money in" },
                { value: "transfer", label: "Move" },
              ]}
            />
          )}

          {/* Amount — the hero field */}
          <div>
            <label className="block text-sm font-medium text-ink mb-2">Amount</label>
            <input
              inputMode="decimal"
              autoFocus
              value={amountText}
              onChange={(e) => {
                setAmountText(e.target.value);
                setError("");
              }}
              placeholder="0"
              className="w-full rounded-control bg-inset border border-hairline px-4 py-4 font-amount text-4xl text-ink placeholder:text-muted focus:border-gold outline-none"
            />
          </div>

          {isTransfer ? (
            <div className="grid grid-cols-2 gap-3">
              <Field label="From">
                <SelectInput value={accountId} onChange={(e) => setAccountId(e.target.value)}>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </SelectInput>
              </Field>
              <Field label="To">
                <SelectInput value={toAccountId} onChange={(e) => setToAccountId(e.target.value)}>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </SelectInput>
              </Field>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Group">
                <SelectInput value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
                  {activeCategories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </SelectInput>
              </Field>
              <Field label="Account">
                <SelectInput value={accountId} onChange={(e) => setAccountId(e.target.value)}>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </SelectInput>
              </Field>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <Field label="Date">
              <TextInput type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </Field>
            {people.length > 0 && !isTransfer && (
              <Field label="Who spent it">
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

          {showNote ? (
            <Field label="Note">
              <TextInput value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional" />
            </Field>
          ) : (
            <button className="text-sm text-gold hover:underline" onClick={() => setShowNote(true)}>
              + Add a note
            </button>
          )}

          {error && <p className="text-sm text-attention">{error}</p>}

          <div className="flex items-center gap-3 pt-2">
            <Button className="flex-1" onClick={handleSave} disabled={saving}>
              {confirm
                ? "Mark as paid"
                : link
                  ? link.kind === "goal"
                    ? "Set aside"
                    : "Record payment"
                  : editing
                    ? "Save changes"
                    : "Save"}
            </Button>
            {editing && (
              <Button variant="danger" onClick={handleDelete} disabled={saving}>
                Delete
              </Button>
            )}
          </div>
        </div>
      )}
    </Sheet>
  );
}
