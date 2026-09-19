import { useState } from "react";
import { useData } from "@/state/dataContext";
import { Button, Card, Field, Pill, SectionTitle, SelectInput, Sheet, TextInput } from "@/components/ui";
import { EmptyState } from "@/components/EmptyState";
import { IntegrityError } from "@/data/repository";
import type { Category, CategoryBucket, NeedsWantsSavings } from "@/domain/types";

const BUCKETS: { value: CategoryBucket; label: string }[] = [
  { value: "bills", label: "Bills" },
  { value: "expenses", label: "Everyday spending" },
  { value: "savings", label: "Savings" },
  { value: "debt", label: "Debt" },
  { value: "income", label: "Money coming in" },
];

const NWS: { value: NeedsWantsSavings; label: string }[] = [
  { value: "needs", label: "Need" },
  { value: "wants", label: "Want" },
  { value: "savings", label: "Saving" },
  { value: "none", label: "Not set" },
];

export function Groups() {
  const { categories, repo } = useData();
  const [editing, setEditing] = useState<Category | null>(null);
  const [adding, setAdding] = useState(false);
  const [note, setNote] = useState("");

  async function remove(c: Category) {
    try {
      await repo.deleteCategory(c.id);
      setNote(`"${c.name}" removed.`);
    } catch (e) {
      if (e instanceof IntegrityError) {
        await repo.archiveCategory(c.id);
        setNote("This is used by past transactions, so it's archived instead of deleted.");
      }
    }
  }

  return (
    <div className="space-y-8">
      <SectionTitle overline="Groups" title="How your money is grouped" subtitle="The buckets your spending and income fall into. Edit them anytime." />

      <div className="flex justify-end">
        <Button onClick={() => setAdding(true)}>+ Add group</Button>
      </div>

      {categories.length === 0 ? (
        <EmptyState icon="✦" title="No groups yet" message="Add a group so your money has somewhere to go." action={<Button onClick={() => setAdding(true)}>Add a group</Button>} />
      ) : (
        <Card>
          <div className="divide-y divide-hairline">
            {categories.map((c) => (
              <div key={c.id} className="flex items-center justify-between gap-4 py-3">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: c.color }} aria-hidden />
                  <div className="min-w-0">
                    <div className="text-ink font-medium truncate">{c.name}</div>
                    <div className="text-xs text-muted capitalize">{BUCKETS.find((b) => b.value === c.bucket)?.label ?? c.bucket}</div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {c.needsWantsSavings !== "none" && <Pill>{NWS.find((n) => n.value === c.needsWantsSavings)?.label}</Pill>}
                  <button className="text-sm text-gold hover:underline" onClick={() => setEditing(c)}>
                    Edit
                  </button>
                  <button className="text-sm text-muted hover:text-attention" onClick={() => remove(c)}>
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {note && <p className="text-sm text-muted">{note}</p>}

      <GroupForm
        open={adding || !!editing}
        category={editing}
        onClose={() => {
          setAdding(false);
          setEditing(null);
        }}
        onSave={async (data) => {
          if (editing) await repo.updateCategory(editing.id, data);
          else await repo.createCategory({ ...data, archived: false });
          setAdding(false);
          setEditing(null);
        }}
      />
    </div>
  );
}

function GroupForm({
  open,
  category,
  onClose,
  onSave,
}: {
  open: boolean;
  category: Category | null;
  onClose: () => void;
  onSave: (data: { name: string; bucket: CategoryBucket; needsWantsSavings: NeedsWantsSavings; color: string }) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [bucket, setBucket] = useState<CategoryBucket>("expenses");
  const [nws, setNws] = useState<NeedsWantsSavings>("none");
  const [color, setColor] = useState("#C8A860");
  const [error, setError] = useState("");

  const key = (category?.id ?? "new") + String(open);
  const [lastKey, setLastKey] = useState("");
  if (open && key !== lastKey) {
    setLastKey(key);
    setName(category?.name ?? "");
    setBucket(category?.bucket ?? "expenses");
    setNws(category?.needsWantsSavings ?? "none");
    setColor(category?.color ?? "#C8A860");
    setError("");
  }

  async function submit() {
    if (!name.trim()) return setError("Give the group a name.");
    await onSave({ name: name.trim(), bucket, needsWantsSavings: nws, color });
  }

  return (
    <Sheet open={open} onClose={onClose} title={category ? "Edit group" : "Add group"}>
      <div className="space-y-4">
        <Field label="Name">
          <TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Groceries" />
        </Field>
        <Field label="Kind">
          <SelectInput value={bucket} onChange={(e) => setBucket(e.target.value as CategoryBucket)}>
            {BUCKETS.map((b) => (
              <option key={b.value} value={b.value}>
                {b.label}
              </option>
            ))}
          </SelectInput>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Need or want" hint="Used later for the 50/30/20 view.">
            <SelectInput value={nws} onChange={(e) => setNws(e.target.value as NeedsWantsSavings)}>
              {NWS.map((n) => (
                <option key={n.value} value={n.value}>
                  {n.label}
                </option>
              ))}
            </SelectInput>
          </Field>
          <Field label="Colour">
            <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="h-[44px] w-full rounded-control bg-inset border border-hairline" />
          </Field>
        </div>
        {error && <p className="text-sm text-attention">{error}</p>}
        <Button className="w-full" onClick={submit}>
          {category ? "Save changes" : "Add group"}
        </Button>
      </div>
    </Sheet>
  );
}
