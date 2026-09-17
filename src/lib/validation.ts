/**
 * Validation (Section 7). Central input validators feeding inline form
 * validation. Pure functions — no storage, no UI.
 */
import type { Minor } from "@/domain/types";

export interface ValidationResult {
  ok: boolean;
  error?: string;
}

const OK: ValidationResult = { ok: true };

export function validateAmount(amount: Minor | null): ValidationResult {
  if (amount == null) return { ok: false, error: "Enter an amount." };
  if (!Number.isInteger(amount)) return { ok: false, error: "Amount looks invalid." };
  if (amount <= 0) return { ok: false, error: "Amount must be more than zero." };
  return OK;
}

export function validateDate(date: string): ValidationResult {
  if (!date) return { ok: false, error: "Pick a date." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { ok: false, error: "Date looks invalid." };
  const [y, m, d] = date.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  if (dt.getFullYear() !== y || dt.getMonth() + 1 !== m || dt.getDate() !== d) {
    return { ok: false, error: "That date doesn't exist." };
  }
  return OK;
}

export function validateRequiredText(value: string, label = "This"): ValidationResult {
  if (!value || value.trim() === "") return { ok: false, error: `${label} is required.` };
  return OK;
}

/** A reference id must resolve to an existing (non-archived for pickers) record. */
export function validateReference(
  id: string | null,
  exists: (id: string) => boolean,
  label = "Selection",
): ValidationResult {
  if (id == null) return OK; // nullable references are allowed where the schema permits
  if (!exists(id)) return { ok: false, error: `${label} no longer exists.` };
  return OK;
}
