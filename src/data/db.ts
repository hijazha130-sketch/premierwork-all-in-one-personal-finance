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
  Category,
  IncomeSource,
  Person,
  RecurringOverride,
  RecurringRule,
  Settings,
  Transaction,
} from "@/domain/types";

/** The current app/data schema version. Bump when adding a migration. */
export const SCHEMA_VERSION = 3;

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
