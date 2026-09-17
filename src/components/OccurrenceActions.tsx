import { useState } from "react";
import { useData } from "@/state/dataContext";
import { useCapture } from "@/state/CaptureProvider";
import { Button, Field, Sheet, TextInput } from "@/components/ui";
import { parseMajorToMinor, minorToMajor } from "@/lib/money";
import type { Occurrence } from "@/domain/occurrences";

/**
 * The shared "Mark as paid" / "Skip" / "Adjust" actions for a planned bill or
 * income. One implementation used by both Home and the Calendar, so the
 * confirm→transaction loop lives in exactly one place.
 *
 * - Mark as paid opens Quick Capture pre-filled; on save it creates a real
 *   transaction through the existing path (FD-3: only on the user's Save).
 * - Skip writes a skip exception (no transaction, no money moves).
 * - Adjust changes just this one date's amount and/or date without touching the
 *   whole schedule (a "adjust" exception). The scheduled date stays the key.
 * - A skipped item can be brought back (removes the exception).
 */
export function OccurrenceActions({ occurrence }: { occurrence: Occurrence }) {
  const { recurringRulesById, repo } = useData();
  const { openConfirm } = useCapture();
  const [adjusting, setAdjusting] = useState(false);
  const [amountText, setAmountText] = useState("");
  const [dateText, setDateText] = useState("");
  const [error, setError] = useState("");

  if (occurrence.status === "paid") return null;

  if (occurrence.status === "skipped") {
    return (
      <button
        className="rounded-control px-1 py-2 text-xs text-muted hover:text-ink"
        onClick={() => repo.deleteOverride(occurrence.ruleId, occurrence.date)}
      >
        Bring back
      </button>
    );
  }

  const rule = recurringRulesById.get(occurrence.ruleId);

  function openAdjust() {
    setAmountText(String(minorToMajor(occurrence.amount)));
    setDateText(occurrence.displayDate);
    setError("");
    setAdjusting(true);
  }

  async function saveAdjust() {
    const amount = parseMajorToMinor(amountText);
    if (amount == null || amount <= 0) return setError("Enter an amount more than zero.");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateText)) return setError("Pick a date.");
    await repo.createOrUpdateOverride({
      ruleId: occurrence.ruleId,
      occurrenceDate: occurrence.date, // the scheduled date stays the key
      action: "adjust",
      adjustedAmount: amount,
      adjustedDate: dateText,
    });
    setAdjusting(false);
  }

  return (
    <div className="flex items-center gap-3 text-sm">
      <button className="rounded-control py-2 text-gold hover:underline" onClick={() => rule && openConfirm(rule, occurrence)}>
        Mark as paid
      </button>
      <button className="rounded-control py-2 text-muted hover:text-ink" onClick={openAdjust}>
        Adjust
      </button>
      <button
        className="rounded-control py-2 text-muted hover:text-ink"
        onClick={() =>
          repo.createOrUpdateOverride({ ruleId: occurrence.ruleId, occurrenceDate: occurrence.date, action: "skip" })
        }
      >
        Skip
      </button>

      <Sheet open={adjusting} onClose={() => setAdjusting(false)} title="Adjust just this one">
        <div className="space-y-4">
          <p className="text-sm text-muted">
            Change the amount or date for this one time only. The repeating pattern stays the same.
          </p>
          <Field label="Amount">
            <TextInput inputMode="decimal" value={amountText} onChange={(e) => setAmountText(e.target.value)} placeholder="0" />
          </Field>
          <Field label="Date">
            <TextInput type="date" value={dateText} onChange={(e) => setDateText(e.target.value)} />
          </Field>
          {error && <p className="text-sm text-attention">{error}</p>}
          <div className="flex items-center gap-3">
            <Button className="flex-1" onClick={saveAdjust}>
              Save
            </Button>
            <Button
              variant="ghost"
              onClick={async () => {
                await repo.deleteOverride(occurrence.ruleId, occurrence.date);
                setAdjusting(false);
              }}
            >
              Reset to the usual
            </Button>
          </div>
        </div>
      </Sheet>
    </div>
  );
}
