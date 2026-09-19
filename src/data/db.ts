/**
 * Persistence layer (Section 3). A local, structured, transactional store
 * (IndexedDB) accessed through Dexie. This module owns the schema and the
 * ordered, tested migration runner. All UI/logic access goes through the
 * repository (repository.ts), never these tables directly.
 */
import Dexie, { type Table } from "dexie";

/** Minimal subset of Dexie constructor options we use (test IndexedDB override). */
interface DBOptions {
  indexedDB?: IDBFactory;
  IDBKeyRange?: typeof IDBKeyRange;
}
import type {
  Account,
  Asset,
  AssetValuation,
  BudgetPeriodLine,
  BudgetTemplate,
  Category,
  Debt,
  Goal,
  IncomeSource,
  Person,
  RecurringOverride,
  RecurringRule,
  Settings,
  Transaction,
} from "@/domain/types";

/** The current app/data schema version. Bump when adding a migration. */
export const SCHEMA_VERSION = 6;

export class FinanceDB extends Dexie {
  settings!: Table<Settings, string>;
  accounts!: Table<Account, string>;
  categories!: Table<Category, string>;
  people!: Table<Person, string>;
  incomeSources!: Table<IncomeSource, string>;
  transactions!: Table<Transaction, string>;
  // Phase 2 (additive): recurring rules + their per-occurrence exceptions.
  recurringRules!: Table<RecurringRule, string>;
  recurringOverrides!: Table<RecurringOverride, string>;
  // Phase 3 (additive): budget templates + per-month planned-amount overrides.
  budgetTemplates!: Table<BudgetTemplate, string>;
  budgetPeriodLines!: Table<BudgetPeriodLine, string>;
  // Phase 4 (additive): savings goals + debts (progress/payoff are derived).
  goals!: Table<Goal, string>;
  debts!: Table<Debt, string>;
  // Phase 5 (additive): assets + their stated value observations (net worth is derived).
  assets!: Table<Asset, string>;
  assetValuations!: Table<AssetValuation, string>;

  constructor(name = "premierwork-finance", options?: DBOptions) {
    super(name, options as ConstructorParameters<typeof Dexie>[1]);

    // --- Migration 1 → base shape -------------------------------------------
    // Version 1 shipped categories WITHOUT the needs/wants/savings tag.
    this.version(1).stores({
      settings: "id",
      accounts: "id, name, type, archived",
      categories: "id, name, bucket, archived",
      people: "id, name, archived",
      incomeSources: "id, name, archived",
      transactions:
        "id, date, accountId, categoryId, personId, type, direction, transferGroupId, cleared",
    });

    // --- Migration 1 → 2 -----------------------------------------------------
    // Additive, non-destructive: add needsWantsSavings to existing categories
    // (defaulting to "none") and record the new schemaVersion in settings.
    this.version(2)
      .stores({
        settings: "id",
        accounts: "id, name, type, archived",
        categories: "id, name, bucket, needsWantsSavings, archived",
        people: "id, name, archived",
        incomeSources: "id, name, archived",
        transactions:
          "id, date, accountId, categoryId, personId, type, direction, transferGroupId, cleared",
      })
      .upgrade(async (tx) => {
        await tx
          .table("categories")
          .toCollection()
          .modify((c: Partial<Category>) => {
            if (c.needsWantsSavings == null) c.needsWantsSavings = "none";
          });
        await tx
          .table("settings")
          .toCollection()
          .modify((s: Partial<Settings>) => {
            s.schemaVersion = 2;
          });
      });

    // --- Migration 2 → 3 (Phase 2) ------------------------------------------
    // Additive, non-destructive: add the recurring-rules + overrides tables,
    // extend the transactions index with recurringRuleId, and backfill the two
    // new nullable transaction fields plus the Safe-to-Spend horizon setting.
    // Only changed/new stores are listed; unchanged tables carry forward.
    this.version(3)
      .stores({
        transactions:
          "id, date, accountId, categoryId, personId, type, direction, transferGroupId, cleared, recurringRuleId",
        recurringRules:
          "id, name, accountId, categoryId, personId, frequency, active, archived",
        recurringOverrides: "id, ruleId, occurrenceDate, [ruleId+occurrenceDate]",
      })
      .upgrade(async (tx) => {
        await tx
          .table("transactions")
          .toCollection()
          .modify((t: Partial<Transaction>) => {
            if (t.recurringRuleId === undefined) t.recurringRuleId = null;
            if (t.occurrenceDate === undefined) t.occurrenceDate = null;
          });
        await tx
          .table("settings")
          .toCollection()
          .modify((s: Partial<Settings>) => {
            if (s.safeToSpendHorizon == null) s.safeToSpendHorizon = "endOfMonth";
            s.schemaVersion = 3;
          });
      });

    // --- Migration 3 → 4 (Phase 3) ------------------------------------------
    // Additive, non-destructive: add the budget-template + per-month
    // budget-line tables. Nothing existing changes — budgets don't exist until
    // the user sets them — so the upgrade only records the new schemaVersion.
    this.version(4)
      .stores({
        budgetTemplates: "id, categoryId",
        budgetPeriodLines: "id, periodKey, categoryId, [periodKey+categoryId]",
      })
      .upgrade(async (tx) => {
        await tx
          .table("settings")
          .toCollection()
          .modify((s: Partial<Settings>) => {
            s.schemaVersion = 4;
          });
      });

    // --- Migration 4 → 5 (Phase 4) ------------------------------------------
    // Additive, non-destructive: add the goals + debts tables and default the
    // three new Settings fields (the emergency cushion + debt payoff plan).
    // Nothing existing changes — goals/debts don't exist until the user adds
    // them, and the transactions' goalId/debtId links already exist.
    this.version(5)
      .stores({
        goals: "id, name, archived, categoryId",
        debts: "id, name, archived",
      })
      .upgrade(async (tx) => {
        await tx
          .table("settings")
          .toCollection()
          .modify((s: Partial<Settings>) => {
            if (s.safetyFloor == null) s.safetyFloor = 0;
            if (s.debtStrategy == null) s.debtStrategy = "avalanche";
            if (s.debtMonthlyExtra == null) s.debtMonthlyExtra = 0;
            s.schemaVersion = 5;
          });
      });

    // --- Migration 5 → 6 (Phase 5) ------------------------------------------
    // Additive, non-destructive: add the assets + asset-valuations tables. An
    // asset stores only what it is; its value comes from valuations (net worth
    // is derived), so nothing existing changes — the upgrade only records the
    // new schemaVersion.
    this.version(6)
      .stores({
        assets: "id, name, kind, accountId, archived",
        assetValuations: "id, assetId, asOf, [assetId+asOf]",
      })
      .upgrade(async (tx) => {
        await tx
          .table("settings")
          .toCollection()
          .modify((s: Partial<Settings>) => {
            s.schemaVersion = 6;
          });
      });
  }
}

let _db: FinanceDB | null = null;

export function getDB(): FinanceDB {
  if (!_db) _db = new FinanceDB();
  return _db;
}

/** For tests: build an isolated DB instance against a provided IndexedDB impl. */
export function createDB(name: string, deps?: DBOptions): FinanceDB {
  return new FinanceDB(name, deps);
}
