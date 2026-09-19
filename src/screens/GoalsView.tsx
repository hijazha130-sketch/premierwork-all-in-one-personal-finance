import { useState } from "react";
import { useData, useCurrency } from "@/state/dataContext";
import { useCapture } from "@/state/CaptureProvider";
import { Card, Button, Sheet, Field, TextInput, SelectInput } from "@/components/ui";
import { MoneyAmount } from "@/components/MoneyAmount";
import { EmptyState } from "@/components/EmptyState";
import { parseMajorToMinor, minorToMajor } from "@/lib/money";
import { formatDateLabel } from "@/lib/period";
import type { Goal } from "@/domain/types";

/**
 * Plan → Goals. Progress cards for each savings goal — Saved / Target / Remaining
 * with a bar, plus "on track for" / "Rs X/month" guidance. Everything shown is
 * read from derived state (goalsProgress); the screen does no money math itself.
 */
export function GoalsView() {
  const { goals, derived, categories, repo } = useData();
  const { symbol, locale } = useCurrency();
  const { openContribution } = useCapture();
  const [editing, setEditing] = useState<Goal | "new" | null>(null);

  const rows = derived.goalsProgress.goals;
  const byId = new Map(goals.map((g) => [g.id, g]));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-2xl text-ink">Your goals</h2>
        <Button variant="ghost" onClick={() => setEditing("new")}>
          Add a goal
        </Button>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon="◎"
          title="No goals yet"
          message="Set a target to save toward — a trip, a cushion, a big purchase — and watch it fill up as you set money aside."
          action={<Button onClick={() => setEditing("new")}>Add your first goal</Button>}
        />
      ) : (
        <>
          <Card>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <div className="text-xs font-semibold uppercase tracking-widest text-muted mb-2">Saved</div>
                <MoneyAmount amount={derived.goalsProgress.totalSaved} size="md" tone="positive" />
              </div>
              <div>
                <div className="text-xs font-semibold uppercase tracking-widest text-muted mb-2">Target</div>
                <MoneyAmount amount={derived.goalsProgress.totalTarget} size="md" />
              </div>
              <div>
                <div className="text-xs font-semibold uppercase tracking-widest text-muted mb-2">Remaining</div>
                <MoneyAmount amount={derived.goalsProgress.totalRemaining} size="md" />
              </div>
            </div>
          </Card>

          {rows.map((r) => {
            const goal = byId.get(r.goalId);
            if (!goal) return null;
            const pct = Math.min(Math.round(r.progress * 100), 100);
            return (
              <Card key={r.goalId}>
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="font-display text-xl text-ink truncate">{r.name}</h3>
                      {r.complete && (
                        <span className="rounded-pill bg-gold/15 text-gold text-xs px-2 py-0.5 whitespace-nowrap">Reached</span>
                      )}
                    </div>
                    <div className="text-sm text-muted mt-0.5">
                      <MoneyAmount amount={r.saved} size="sm" tone="positive" /> saved of{" "}
                      <MoneyAmount amount={r.target} size="sm" tone="muted" />
                    </div>
                  </div>
                </div>

                <div className="relative h-2 rounded-pill bg-inset overflow-hidden">
                  <div className="absolute inset-y-0 left-0 bg-gold rounded-pill" style={{ width: `${pct}%` }} />
                </div>

                <div className="mt-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-sm">
                  <span className="text-muted">
                    {r.remaining > 0 ? (
                      <>
                        <MoneyAmount amount={r.remaining} size="sm" tone="muted" /> to go
                      </>
                    ) : (
                      "You've hit your target."
                    )}
                  </span>
                  <span className="text-muted">{guidance(r, symbol, locale)}</span>
                </div>

                <div className="mt-4 flex flex-wrap gap-3">
                  <Button onClick={() => openContribution(goal)}>Set aside</Button>
                  <Button variant="ghost" onClick={() => setEditing(goal)}>
                    Edit
                  </Button>
                </div>
              </Card>
            );
          })}
        </>
      )}

      {editing && (
        <GoalSheet
          goal={editing === "new" ? null : editing}
          savingsCategories={categories.filter((c) => c.bucket === "savings")}
          onClose={() => setEditing(null)}
          onSave={async (data) => {
            if (editing === "new") await repo.createGoal(data);
            else await repo.updateGoal(editing.id, data);
            setEditing(null);
          }}
          onArchive={
            editing === "new"
              ? undefined
              : async () => {
                  await repo.archiveGoal((editing as Goal).id);
                  setEditing(null);
                }
          }
        />
      )}
    </div>
  );
}

/** One-line guidance under a goal, in plain words (no internal terms). */
function guidance(
  r: { monthlyTarget: number | null; projectedDate: string | null; complete: boolean },
  symbol: string,
  locale: string,
): string {
  if (r.complete) return "";
  if (r.projectedDate) return `On track for ${formatDateLabel(r.projectedDate, locale)}`;
  if (r.monthlyTarget != null && r.monthlyTarget > 0) return `${formatShort(r.monthlyTarget, symbol, locale)}/month to hit your date`;
  return "";
}

function formatShort(minor: number, symbol: string, locale: string): string {
  const major = Math.abs(minor) / 100;
  return `${symbol} ${new Intl.NumberFormat(locale, { maximumFractionDigits: major % 1 === 0 ? 0 : 2 }).format(major)}`;
}

type GoalDraft = Omit<Goal, "id" | "createdAt" | "updatedAt" | "archived" | "completedAt">;

function GoalSheet({
  goal,
  savingsCategories,
  onClose,
  onSave,
  onArchive,
}: {
  goal: Goal | null;
  savingsCategories: { id: string; name: string }[];
  onClose: () => void;
  onSave: (data: GoalDraft) => void | Promise<void>;
  onArchive?: () => void | Promise<void>;
}) {
  const [name, setName] = useState(goal?.name ?? "");
  const [target, setTarget] = useState(goal ? String(minorToMajor(goal.targetAmount)) : "");
  const [starting, setStarting] = useState(goal ? String(minorToMajor(goal.startingAmount)) : "0");
  const [date, setDate] = useState(goal?.targetDate ?? "");
  const [monthly, setMonthly] = useState(goal?.monthlyContribution != null ? String(minorToMajor(goal.monthlyContribution)) : "");
  const [categoryId, setCategoryId] = useState(goal?.categoryId ?? "");
  const [error, setError] = useState("");

  function save() {
    const targetAmount = parseMajorToMinor(target);
    if (targetAmount == null || targetAmount <= 0) return setError("Enter a target amount.");
    const startingAmount = parseMajorToMinor(starting) ?? 0;
    const monthlyContribution = monthly.trim() === "" ? null : parseMajorToMinor(monthly);
    onSave({
      name: name.trim() || "Untitled goal",
      targetAmount,
      startingAmount,
      targetDate: date || null,
      monthlyContribution: monthlyContribution ?? null,
      categoryId: categoryId || null,
    });
  }

  return (
    <Sheet open onClose={onClose} title={goal ? "Edit goal" : "Add a goal"}>
      <div className="space-y-5">
        <Field label="Name">
          <TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Emergency cushion" autoFocus />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Target amount">
            <TextInput inputMode="decimal" value={target} onChange={(e) => { setTarget(e.target.value); setError(""); }} placeholder="0" />
          </Field>
          <Field label="Already saved">
            <TextInput inputMode="decimal" value={starting} onChange={(e) => setStarting(e.target.value)} placeholder="0" />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Target date (optional)">
            <TextInput type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="Monthly plan (optional)">
            <TextInput inputMode="decimal" value={monthly} onChange={(e) => setMonthly(e.target.value)} placeholder="0" />
          </Field>
        </div>
        {savingsCategories.length > 0 && (
          <Field label="Savings group (optional)">
            <SelectInput value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              <option value="">None</option>
              {savingsCategories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </SelectInput>
          </Field>
        )}

        {error && <p className="text-sm text-attention">{error}</p>}

        <div className="flex items-center gap-3 pt-2">
          <Button className="flex-1" onClick={save}>
            {goal ? "Save changes" : "Add goal"}
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
