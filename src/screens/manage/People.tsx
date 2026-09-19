import { useState } from "react";
import { useData } from "@/state/dataContext";
import { Button, Card, Field, SectionTitle, Sheet, TextInput } from "@/components/ui";
import { EmptyState } from "@/components/EmptyState";
import { IntegrityError } from "@/data/repository";
import type { Person } from "@/domain/types";

export function People() {
  const { people, repo } = useData();
  const [editing, setEditing] = useState<Person | null>(null);
  const [adding, setAdding] = useState(false);
  const [note, setNote] = useState("");

  async function remove(p: Person) {
    try {
      await repo.deletePerson(p.id);
      setNote(`"${p.name}" removed.`);
    } catch (e) {
      if (e instanceof IntegrityError) {
        await repo.archivePerson(p.id);
        setNote("This is used by past transactions, so it's archived instead of deleted.");
      }
    }
  }

  return (
    <div className="space-y-8">
      <SectionTitle overline="People" title="Who spends in your household" subtitle="Optional. Track who spent what — handy for shared households." />

      <div className="flex justify-end">
        <Button onClick={() => setAdding(true)}>+ Add person</Button>
      </div>

      {people.length === 0 ? (
        <EmptyState icon="✦" title="No people added" message="This is optional — add household members if you'd like to see who spent what." action={<Button onClick={() => setAdding(true)}>Add a person</Button>} />
      ) : (
        <Card>
          <div className="divide-y divide-hairline">
            {people.map((p) => (
              <div key={p.id} className="flex items-center justify-between gap-4 py-3">
                <span className="text-ink font-medium">{p.name}</span>
                <div className="flex items-center gap-3">
                  <button className="text-sm text-gold hover:underline" onClick={() => setEditing(p)}>
                    Edit
                  </button>
                  <button className="text-sm text-muted hover:text-attention" onClick={() => remove(p)}>
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {note && <p className="text-sm text-muted">{note}</p>}

      <PersonForm
        open={adding || !!editing}
        person={editing}
        onClose={() => {
          setAdding(false);
          setEditing(null);
        }}
        onSave={async (name) => {
          if (editing) await repo.updatePerson(editing.id, { name });
          else await repo.createPerson({ name, archived: false });
          setAdding(false);
          setEditing(null);
        }}
      />
    </div>
  );
}

function PersonForm({
  open,
  person,
  onClose,
  onSave,
}: {
  open: boolean;
  person: Person | null;
  onClose: () => void;
  onSave: (name: string) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [error, setError] = useState("");

  const key = (person?.id ?? "new") + String(open);
  const [lastKey, setLastKey] = useState("");
  if (open && key !== lastKey) {
    setLastKey(key);
    setName(person?.name ?? "");
    setError("");
  }

  async function submit() {
    if (!name.trim()) return setError("Enter a name.");
    await onSave(name.trim());
  }

  return (
    <Sheet open={open} onClose={onClose} title={person ? "Edit person" : "Add person"}>
      <div className="space-y-4">
        <Field label="Name">
          <TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Ayesha" />
        </Field>
        {error && <p className="text-sm text-attention">{error}</p>}
        <Button className="w-full" onClick={submit}>
          {person ? "Save changes" : "Add person"}
        </Button>
      </div>
    </Sheet>
  );
}
