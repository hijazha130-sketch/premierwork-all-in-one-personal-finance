/**
 * Data export/import (Section 3). A plain JSON export of the whole database and
 * re-import. This is the safety net in a local-first app: before any migration
 * that could lose data, and as the user-facing backup mechanism.
 */
import type { FinanceDB } from "@/data/db";
import { SCHEMA_VERSION } from "@/data/db";
import type {
  Account,
  Category,
  IncomeSource,
  Person,
  Settings,
  Transaction,
} from "@/domain/types";

export interface BackupFile {
  app: "premierwork-all-in-one-personal-finance";
  schemaVersion: number;
  exportedAt: string;
  data: {
    settings: Settings[];
    accounts: Account[];
    categories: Category[];
    people: Person[];
    incomeSources: IncomeSource[];
    transactions: Transaction[];
  };
}

export async function exportDatabase(db: FinanceDB): Promise<BackupFile> {
  const [settings, accounts, categories, people, incomeSources, transactions] = await Promise.all([
    db.settings.toArray(),
    db.accounts.toArray(),
    db.categories.toArray(),
    db.people.toArray(),
    db.incomeSources.toArray(),
    db.transactions.toArray(),
  ]);
  return {
    app: "premierwork-all-in-one-personal-finance",
    schemaVersion: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    data: { settings, accounts, categories, people, incomeSources, transactions },
  };
}

export async function exportDatabaseString(db: FinanceDB): Promise<string> {
  return JSON.stringify(await exportDatabase(db), null, 2);
}

function isBackup(v: unknown): v is BackupFile {
  return (
    !!v &&
    typeof v === "object" &&
    (v as BackupFile).app === "premierwork-all-in-one-personal-finance" &&
    typeof (v as BackupFile).data === "object"
  );
}

/**
 * Replace the entire database with the contents of a backup. Used for restore
 * and for round-trip verification. Runs inside a transaction so a failed import
 * never leaves a half-written database.
 */
export async function importDatabase(db: FinanceDB, backup: unknown): Promise<void> {
  if (!isBackup(backup)) throw new Error("This file is not a PremierWork backup.");
  const { data } = backup;
  await db.transaction(
    "rw",
    [db.settings, db.accounts, db.categories, db.people, db.incomeSources, db.transactions],
    async () => {
      await Promise.all([
        db.settings.clear(),
        db.accounts.clear(),
        db.categories.clear(),
        db.people.clear(),
        db.incomeSources.clear(),
        db.transactions.clear(),
      ]);
      await Promise.all([
        db.settings.bulkPut(data.settings ?? []),
        db.accounts.bulkPut(data.accounts ?? []),
        db.categories.bulkPut(data.categories ?? []),
        db.people.bulkPut(data.people ?? []),
        db.incomeSources.bulkPut(data.incomeSources ?? []),
        db.transactions.bulkPut(data.transactions ?? []),
      ]);
    },
  );
}

export async function importDatabaseString(db: FinanceDB, json: string): Promise<void> {
  await importDatabase(db, JSON.parse(json));
}

/** Trigger a browser download of the backup (UI helper). */
export async function downloadBackup(db: FinanceDB): Promise<void> {
  const json = await exportDatabaseString(db);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `premierwork-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}
