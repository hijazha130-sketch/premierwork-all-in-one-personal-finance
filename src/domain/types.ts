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

/** How the debt payoff plan directs any extra payment (Phase 4). */
export type DebtStrategy = "snowball" | "avalanche" | "custom";

/** The background tint the user picked (Design System §3); "none" = the base canvas. */
export type WallpaperId =
  | "none"
  | "sage"
  | "dustyRose"
  | "lavender"
  | "sky"
  | "sand"
  | "pearl"
  | "deepInk"
  | "charcoal";

/**
 * How far ahead "Safe to spend" reserves upcoming commitments (Phase 2, FD-1).
 * Default is end of the current month.
 */
export type SafeToSpendHorizon = "endOfMonth" | "nextIncome" | "rollingDays";

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
  // Phase 2: the window "Safe to spend" reserves against (FD-1, default endOfMonth).
  safeToSpendHorizon: SafeToSpendHorizon;
  safeToSpendRollingDays?: number; // used only when horizon = "rollingDays"
  // Phase 4 (additive): the emergency cushion + the debt payoff plan settings.
  safetyFloor: Minor; // minimum balance to protect from "Safe to spend" (default 0)
  debtStrategy: DebtStrategy; // how the extra payment is directed (default "avalanche")
  debtMonthlyExtra: Minor; // extra beyond minimums, applied by strategy (default 0)
  // Design layer (additive, presentation-only): the chosen background tint.
  // Optional + read with a "none" default, so existing settings rows are valid
  // without a migration (non-destructive).
  wallpaper?: WallpaperId;
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
  // Phase 2: set when this transaction fulfills a recurring rule's occurrence.
  // Both null for manual transactions; both set (with source:"recurring") when
  // a scheduled bill/income is confirmed via "Mark as paid".
  recurringRuleId: string | null;
  occurrenceDate: IsoDate | null;
  // Planner links — present in the schema now, unused until Phases 4-5.
  goalId: string | null;
  debtId: string | null;
  investmentId: string | null;
}

/** Entities referenced by id from transactions ("dimensions"). */
export type DimensionName = "accounts" | "categories" | "people" | "incomeSources";

// ---------------------------------------------------------------------------
// Phase 2 — Recurring & Cash Flow (Recurring & Cash Flow Architecture §7)
// ---------------------------------------------------------------------------

/**
 * Frequency of a repeating rule. Week-based frequencies add fixed days with a
 * per-year cap (52/26/13); month-based frequencies step by whole months and
 * clamp impossible days (e.g. the 31st) to the month's last valid day.
 */
export type RecurringFrequency =
  | "oneTime"
  | "everyWeek" // +7 days,  cap 52/yr
  | "every2Weeks" // +14 days, cap 26/yr
  | "every4Weeks" // +28 days, cap 13/yr
  | "everyMonth" // +1 month
  | "every2Months" // +2 months
  | "everyQuarter" // +3 months
  | "every6Months" // +6 months
  | "everyYear"; // +12 months

/**
 * A recurring rule is a *definition* of a repeating bill or income — never a
 * money movement by itself. Occurrences are computed from it on demand and are
 * never stored. Money moves only when a Transaction is created for an occurrence.
 */
export interface RecurringRule extends BaseRecord {
  name: string;
  amount: Minor; // always > 0
  direction: TransactionDirection; // "out" (bill) | "in" (income)
  type: Extract<TransactionType, "expense" | "income">; // no transfers in v1
  categoryId: string | null; // required in UI for expense/income; nullable in schema
  accountId: string; // which account it hits
  personId: string | null; // household attribution
  frequency: RecurringFrequency;
  anchorDate: IsoDate; // the "1st payment" date
  endDate: IsoDate | null; // optional bound; null = open-ended
  active: boolean; // false = paused, generates nothing
  archived: boolean;
  // Reserved for later phases (kept null now, so no migration later):
  goalId: string | null;
  debtId: string | null;
  investmentId: string | null;
}

export type OverrideAction = "skip" | "adjust";

/**
 * A per-occurrence exception (exceptions only — not a second ledger): skip a
 * specific occurrence, or adjust its amount/date. At most one override per
 * (ruleId, occurrenceDate), enforced in the repository.
 */
export interface RecurringOverride extends BaseRecord {
  ruleId: string; // FK -> RecurringRule.id
  occurrenceDate: IsoDate; // the specific projected date being overridden
  action: OverrideAction;
  adjustedAmount?: Minor; // when action = "adjust"
  adjustedDate?: IsoDate; // when action = "adjust" (moved to another day)
}

// ---------------------------------------------------------------------------
// Phase 3 — Budgeting (Budgeting Architecture §7)
// ---------------------------------------------------------------------------

/**
 * A month period key, "YYYY-MM" (e.g. "2026-09"). Budget planned amounts are
 * keyed per month; "actual" is always derived from transactions in that month.
 */
export type PeriodKey = string;

/**
 * The reusable default planned amount for a category — the "usual" monthly
 * budget. At most one per category (enforced in the repository). Editing it
 * changes the default for every month that has no explicit override.
 */
export interface BudgetTemplate extends BaseRecord {
  categoryId: string; // FK -> Category.id (unique: one template per category)
  plannedAmount: Minor; // the usual monthly planned amount, >= 0
}

/**
 * A per-(month, category) override of the planned amount for one specific month
 * (exceptions only — the same pattern as Phase 2's RecurringOverride, so months
 * are never pre-provisioned). At most one per (periodKey, categoryId).
 */
export interface BudgetPeriodLine extends BaseRecord {
  periodKey: PeriodKey; // "YYYY-MM"
  categoryId: string; // FK -> Category.id
  plannedAmount: Minor; // overrides the template for THIS month, >= 0
}

// ---------------------------------------------------------------------------
// Phase 4 — Goals, Debt & Safety Floor (Phase 4 Architecture §7)
// ---------------------------------------------------------------------------

/**
 * A savings goal (sinking fund) — stores only the target and its terms. How much
 * is saved is NEVER stored; it is derived from transactions linked via `goalId`
 * (startingAmount + Σ contributions). A goal can never disagree with the ledger.
 */
export interface Goal extends BaseRecord {
  name: string;
  targetAmount: Minor; // the goal, > 0
  startingAmount: Minor; // already-saved at creation (default 0)
  targetDate: IsoDate | null; // optional deadline
  monthlyContribution: Minor | null; // optional planned monthly set-aside
  categoryId: string | null; // optional savings category
  archived: boolean;
  completedAt: number | null; // epoch ms when target reached (derived-set)
}

/**
 * A debt to pay off — stores only the balance and its terms. The payoff plan
 * (schedule, debt-free date, total interest) is a forecast computed on demand
 * from these terms plus the plan-level extra/strategy; it is never stored.
 * Payments are transactions linked via `debtId`. `currentBalance` is the truth
 * anchor the forecast runs from (user-maintained per FD-4.1).
 */
export interface Debt extends BaseRecord {
  name: string;
  currentBalance: Minor; // amount owed (truth anchor; FD-4.1)
  annualInterestRate: number; // annual %, e.g. 24 for 24%/yr
  minimumPayment: Minor; // required monthly minimum
  balanceAsOf: IsoDate; // the date currentBalance was entered/updated
  customOrder: number | null; // ordering for the "custom" strategy
  archived: boolean;
  paidOffAt: number | null; // epoch ms when balance reached 0 (derived-set)
}

// ---------------------------------------------------------------------------
// Phase 5 — Wealth (net worth & assets)
// ---------------------------------------------------------------------------

export type AssetKind = "investment" | "property" | "vehicle" | "cash" | "other";

/**
 * An asset the user owns — stores only WHAT it is, never its value. The value at
 * any date comes from the latest AssetValuation (see below). `accountId` is an
 * optional, informational link to an investment Account and is NEVER used to
 * value the asset (accounts are valued from their transactions, assets from
 * their valuations — the two never mix).
 */
export interface Asset extends BaseRecord {
  name: string;
  kind: AssetKind;
  accountId: string | null; // optional informational link; never a value source
  note?: string;
  archived: boolean;
}

/**
 * A stated value observation for an asset — an input, like a transaction, never
 * a derived figure. The asset's value at a date D is the value of its latest
 * valuation with `asOf ≤ D` (a step function; no interpolation between points).
 */
export interface AssetValuation extends BaseRecord {
  assetId: string; // FK -> Asset.id
  value: Minor; // the stated value at asOf
  asOf: IsoDate; // the date this value was observed
}
