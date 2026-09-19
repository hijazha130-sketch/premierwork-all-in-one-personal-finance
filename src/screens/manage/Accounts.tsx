import { useState } from "react";
import { useData } from "@/state/dataContext";
import { Button, Card, Field, SectionTitle, SelectInput, Sheet, TextInput } from "@/components/ui";
import { MoneyAmount } from "@/components/MoneyAmount";
import { EmptyState } from "@/components/EmptyState";
import { IntegrityError } from "@/data/repository";
import { parseMajorToMinor, minorToMajor } from "@/lib/money";
import type { Account, AccountType } from "@/domain/types";

const ACCOUNT_TYPES: { value: AccountType; label: string }[] = [
  { value: "checking", label: "Everyday / Checking" },
  { value: "savings", label: "Savings" },
  { value: "cash", label: "Cash" },
  { value: "credit", label: "Credit card" },
  { value: "investment", label: "Investment" },
  { value: "loan", label: "Loan" },
];

export function Accounts() {
  const { accounts, derived, repo, settings } = useData();
  const [editing, setEditing] = useState<Account | null>(null);
  const [adding, setAdding] = useState(false);
  const [note, setNote] = useState("");

  async function remove(a: Account) {
    try {
      await repo.deleteAccount(a.id);
      setNote(`"${a.name}" removed.`);
    } catch (e) {
      if (e instanceof IntegrityError) {
        await repo.archiveAccount(a.id);
        setNote("This is used by past transactions, so it's archived instead of deleted.");
      }
    }
  }

  return (
    <div className="space-y-8">
      <SectionTitle overline="Accounts" title="Where your money is" subtitle="Everyday, savings, cash, cards — one connected view of every balance." />

      <div className="flex justify-end">
        <Button onClick={() => setAdding(true)}>+ Add account</Button>
      </div>

      {accounts.length === 0 ? (
        <EmptyState icon="✦" title="No accounts yet" message="Add your first account and every balance draws from it automatically." action={<Button onClick={() => setAdding(true)}>Add your first account</Button>} />
      ) : (
        <Card>
          <div className="divide-y divide-hairline">
            {accounts.map((a) => (
              <div key={a.id} className="flex items-center justify-between gap-4 py-3">
                <div className="min-w-0">
                  <div className="text-ink font-medium truncate">{a.name}</div>
                  <div className="text-xs text-muted capitalize">{a.type}</div>
                </div>
                <div className="flex items-center gap-3">
                  <MoneyAmount amount={derived.balances[a.id] ?? a.openingBalance} size="sm" />
                  <button className="text-sm text-gold hover:underline" onClick={() => setEditing(a)}>
                    Edit
                  </button>
                  <button className="text-sm text-muted hover:text-attention" onClick={() => remove(a)}>
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {note && <p className="text-sm text-muted">{note}</p>}

      <AccountForm
        open={adding || !!editing}
        account={editing}
        currencyCode={settings?.currencyCode ?? "PKR"}
        onClose={() => {
          setAdding(false);
          setEditing(null);
        }}
        onSave={async (data) => {
          if (editing) await repo.updateAccount(editing.id, data);
          else await repo.createAccount({ ...data, archived: false });
          setAdding(false);
          setEditing(null);
        }}
      />
    </div>
  );
}

function AccountForm({
  open,
  account,
  currencyCode,
  onClose,
  onSave,
}: {
  open: boolean;
  account: Account | null;
  currencyCode: string;
  onClose: () => void;
  onSave: (data: { name: string; type: AccountType; openingBalance: number; currencyCode: string }) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [type, setType] = useState<AccountType>("checking");
  const [balanceText, setBalanceText] = useState("");
  const [error, setError] = useState("");

  // Initialise fields when the sheet opens or the target account changes
  // (adjusting state during render — a supported React pattern).
  const key = (account?.id ?? "new") + String(open);
  const [lastKey, setLastKey] = useState("");
  if (open && key !== lastKey) {
    setLastKey(key);
    setName(account?.name ?? "");
    setType(account?.type ?? "checking");
    setBalanceText(account ? String(minorToMajor(account.openingBalance)) : "");
    setError("");
  }

  async function submit() {
    if (!name.trim()) return setError("Give the account a name.");
    const opening = parseMajorToMinor(balanceText || "0") ?? 0;
    await onSave({ name: name.trim(), type, openingBalance: opening, currencyCode });
  }

  return (
    <Sheet open={open} onClose={onClose} title={account ? "Edit account" : "Add account"}>
      <div className="space-y-4">
        <Field label="Name">
          <TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Everyday" />
        </Field>
        <Field label="Type">
          <SelectInput value={type} onChange={(e) => setType(e.target.value as AccountType)}>
            {ACCOUNT_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </SelectInput>
        </Field>
        <Field label="Starting balance" hint="What's in it right now.">
          <TextInput inputMode="decimal" value={balanceText} onChange={(e) => setBalanceText(e.target.value)} placeholder="0" />
        </Field>
        {error && <p className="text-sm text-attention">{error}</p>}
        <Button className="w-full" onClick={submit}>
          {account ? "Save changes" : "Add account"}
        </Button>
      </div>
    </Sheet>
  );
}
