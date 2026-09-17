import { useData } from "@/state/DataProvider";
import { useCapture } from "@/state/CaptureProvider";
import type { Occurrence } from "@/domain/occurrences";

/**
 * The shared "Mark as paid" / "Skip" actions for a planned bill/income. One
 * implementation used by both Home and the Calendar, so the confirm→transaction
 * loop lives in exactly one place.
 *
 * - Mark as paid opens Quick Capture pre-filled from the item; on save it creates
 *   a real transaction through the existing path (FD-3: only on the user's Save).
 * - Skip writes a skip exception (no transaction, no money moves).
 * - A skipped item can be brought back (removes the exception).
 */
export function OccurrenceActions({ occurrence }: { occurrence: Occurrence }) {
  const { recurringRulesById, repo } = useData();
  const { openConfirm } = useCapture();

  if (occurrence.status === "paid") return null;

  if (occurrence.status === "skipped") {
    return (
      <button
        className="text-xs text-muted hover:text-ink"
        onClick={() => repo.deleteOverride(occurrence.ruleId, occurrence.date)}
      >
        Bring back
      </button>
    );
  }

  const rule = recurringRulesById.get(occurrence.ruleId);
  return (
    <div className="flex items-center gap-3 text-sm">
      <button
        className="text-gold hover:underline"
        onClick={() => rule && openConfirm(rule, occurrence)}
      >
        Mark as paid
      </button>
      <button
        className="text-muted hover:text-ink"
        onClick={() =>
          repo.createOrUpdateOverride({ ruleId: occurrence.ruleId, occurrenceDate: occurrence.date, action: "skip" })
        }
      >
        Skip
      </button>
    </div>
  );
}
