/**
 * Phase 1 concrete data schema (Section 6).
 * All money is stored as integer minor units (paisa) — never floats.
 * Fields marked "derived" in the spec (e.g. account balance) are NEVER stored.
 */

/** Integer minor units (e.g. paisa). A hard rule: currency never uses floats. */
export type Minor = number;

/** ISO date string, day-precision: "YYYY-MM-DD". */
export type IsoDate = string;

/** Every stored record carries these. */
export interface BaseRecord {
  id: string;
  createdAt: number; // epoch ms
  updatedAt: number; // epoch ms
}

export type BudgetMethod = "zeroBased" | "carryOver";

/** Single settings record. */
export interface Settings extends BaseRecord {
  currencyCode: string; // e.g. "PKR"
  currencySymbol: string; // e.g. "Rs"
  budgetMethod: BudgetMethod; // stored now, used in Phase 3
  periodStartMonth: number; // 1-12, captured at setup, used later
  periodStartYear: number; // captured at setup, used later
  locale: string; // e.g. "en-PK"
  schemaVersion: number; // app's own schema version
  setupComplete: boolean;
}

export type AccountType =
  | "checking"
  | "savings"
  | "cash"
  | "credit"
  | "investment"
  | "loan";

export interface Account extends BaseRecord {
  name: string;
  type: AccountType;
  openingBalance: Minor;
  currencyCode: string;
  archived: boolean;
}

export type CategoryBucket = "bills" | "expenses" | "savings" | "debt" | "income";
export type NeedsWantsSavings = "needs" | "wants" | "savings" | "none";

export interface Category extends BaseRecord {
  name: string;
  bucket: CategoryBucket;
  needsWantsSavings: NeedsWantsSavings; // for the later 50/30/20 lens
  color: string;
  archived: boolean;
}

export interface Person extends BaseRecord {
  name: string;
  archived: boolean;
}

export interface IncomeSource extends BaseRecord {
  name: string;
  defaultAmount?: Minor;
  defaultAccountId?: string;
  archived: boolean;
}

export type TransactionType = "expense" | "income" | "transfer";
export type TransactionDirection = "out" | "in";
export type TransactionSource = "manual" | "recurring" | "import";

/**
 * Transaction is the single source of truth. Amount is always a positive
 * minor-unit value; `direction`/`type` carry the sign meaning.
 */
export interface Transaction extends BaseRecord {
  date: IsoDate;
  amount: Minor; // always > 0
  direction: TransactionDirection;
  type: TransactionType;
  categoryId: string | null; // null for transfers
  accountId: string;
  personId: string | null;
  source: TransactionSource; // only "manual" in Phase 1
  note?: string;
  cleared: boolean; // default true
  transferGroupId: string | null; // pairs the two halves of a transfer
  // Planner links — present in the schema now, unused until Phases 4-5.
  goalId: string | null;
  debtId: string | null;
  investmentId: string | null;
}

/** Entities referenced by id from transactions ("dimensions"). */
export type DimensionName = "accounts" | "categories" | "people" | "incomeSources";
