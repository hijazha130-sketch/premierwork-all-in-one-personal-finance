/**
 * Repository abstraction (Section 3). All reads and writes go through this
 * interface — never direct store calls from UI or logic. This is the seam that
 * lets a future cloud/sync backend replace the local store.
 *
 * Integrity rules enforced here:
 *  - referential checks (a transaction's account/category/person must exist)
 *  - archive-instead-of-delete for dimensions in use
 *  - rejection of writes that would orphan a linked record
 *  - deleting one half of a transfer deletes both
 */
import type { FinanceDB } from "@/data/db";
import type {
  Account,
  BaseRecord,
  Category,
  IncomeSource,
  Person,
  Settings,
  Transaction,
} from "@/domain/types";

export function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return "id_" + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function stampNew<T extends BaseRecord>(data: Omit<T, keyof BaseRecord> & Partial<BaseRecord>): T {
  const now = Date.now();
  return {
    ...(data as object),
    id: data.id ?? newId(),
    createdAt: data.createdAt ?? now,
    updatedAt: now,
  } as T;
}

export class IntegrityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "IntegrityError";
  }
}

/** Generic per-entity repository. */
export interface Repository<T extends BaseRecord> {
  getAll(): Promise<T[]>;
  get(id: string): Promise<T | undefined>;
  put(record: T): Promise<T>;
  delete(id: string): Promise<void>;
}

export class FinanceRepository {
  constructor(private db: FinanceDB) {}

  // --- Settings -----------------------------------------------------------
  async getSettings(): Promise<Settings | undefined> {
    const all = await this.db.settings.toArray();
    return all[0];
  }

  async saveSettings(patch: Partial<Settings> & { id?: string }): Promise<Settings> {
    const existing = await this.getSettings();
    if (existing) {
      const updated: Settings = { ...existing, ...patch, id: existing.id, updatedAt: Date.now() };
      await this.db.settings.put(updated);
      return updated;
    }
    const created = stampNew<Settings>({
      currencyCode: "PKR",
      currencySymbol: "Rs",
      budgetMethod: "carryOver",
      periodStartMonth: new Date().getMonth() + 1,
      periodStartYear: new Date().getFullYear(),
      locale: "en-PK",
      schemaVersion: 2,
      setupComplete: false,
      ...patch,
    });
    await this.db.settings.put(created);
    return created;
  }

  // --- Dimensions ---------------------------------------------------------
  async listAccounts(includeArchived = false): Promise<Account[]> {
    const all = await this.db.accounts.toArray();
    return includeArchived ? all : all.filter((a) => !a.archived);
  }
  async listCategories(includeArchived = false): Promise<Category[]> {
    const all = await this.db.categories.toArray();
    return includeArchived ? all : all.filter((c) => !c.archived);
  }
  async listPeople(includeArchived = false): Promise<Person[]> {
    const all = await this.db.people.toArray();
    return includeArchived ? all : all.filter((p) => !p.archived);
  }
  async listIncomeSources(includeArchived = false): Promise<IncomeSource[]> {
    const all = await this.db.incomeSources.toArray();
    return includeArchived ? all : all.filter((s) => !s.archived);
  }

  async createAccount(data: Omit<Account, keyof BaseRecord>): Promise<Account> {
    const rec = stampNew<Account>(data);
    await this.db.accounts.put(rec);
    return rec;
  }
  async createCategory(data: Omit<Category, keyof BaseRecord>): Promise<Category> {
    const rec = stampNew<Category>(data);
    await this.db.categories.put(rec);
    return rec;
  }
  async createPerson(data: Omit<Person, keyof BaseRecord>): Promise<Person> {
    const rec = stampNew<Person>(data);
    await this.db.people.put(rec);
    return rec;
  }
  async createIncomeSource(data: Omit<IncomeSource, keyof BaseRecord>): Promise<IncomeSource> {
    const rec = stampNew<IncomeSource>(data);
    await this.db.incomeSources.put(rec);
    return rec;
  }

  async updateAccount(id: string, patch: Partial<Account>): Promise<void> {
    await this.db.accounts.update(id, { ...patch, updatedAt: Date.now() });
  }
  async updateCategory(id: string, patch: Partial<Category>): Promise<void> {
    await this.db.categories.update(id, { ...patch, updatedAt: Date.now() });
  }
  async updatePerson(id: string, patch: Partial<Person>): Promise<void> {
    await this.db.people.update(id, { ...patch, updatedAt: Date.now() });
  }
  async updateIncomeSource(id: string, patch: Partial<IncomeSource>): Promise<void> {
    await this.db.incomeSources.update(id, { ...patch, updatedAt: Date.now() });
  }

  /** Archive a dimension (never hard-delete something that is in use). */
  async archiveAccount(id: string): Promise<void> {
    await this.updateAccount(id, { archived: true });
  }
  async archiveCategory(id: string): Promise<void> {
    await this.updateCategory(id, { archived: true });
  }
  async archivePerson(id: string): Promise<void> {
    await this.updatePerson(id, { archived: true });
  }
  async archiveIncomeSource(id: string): Promise<void> {
    await this.updateIncomeSource(id, { archived: true });
  }

  /** True when any transaction references this dimension id. */
  async isDimensionInUse(field: "accountId" | "categoryId" | "personId", id: string): Promise<boolean> {
    const count = await this.db.transactions.where(field).equals(id).count();
    return count > 0;
  }

  /**
   * Hard-delete a dimension only when nothing references it. Otherwise this
   * throws — callers should archive instead. This protects historical data.
   */
  async deleteAccount(id: string): Promise<void> {
    if (await this.isDimensionInUse("accountId", id)) {
      throw new IntegrityError("Account is used by past transactions — archive it instead.");
    }
    await this.db.accounts.delete(id);
  }
  async deleteCategory(id: string): Promise<void> {
    if (await this.isDimensionInUse("categoryId", id)) {
      throw new IntegrityError("Category is used by past transactions — archive it instead.");
    }
    await this.db.categories.delete(id);
  }
  async deletePerson(id: string): Promise<void> {
    if (await this.isDimensionInUse("personId", id)) {
      throw new IntegrityError("Person is used by past transactions — archive it instead.");
    }
    await this.db.people.delete(id);
  }

  // --- Transactions -------------------------------------------------------
  async listTransactions(): Promise<Transaction[]> {
    return this.db.transactions.orderBy("date").reverse().toArray();
  }
  async getTransaction(id: string): Promise<Transaction | undefined> {
    return this.db.transactions.get(id);
  }

  private async assertReferences(
    t: Pick<Transaction, "accountId" | "categoryId" | "personId" | "type">,
  ): Promise<void> {
    if (!(await this.db.accounts.get(t.accountId))) {
      throw new IntegrityError("That account no longer exists.");
    }
    if (t.type !== "transfer" && t.categoryId != null) {
      if (!(await this.db.categories.get(t.categoryId))) {
        throw new IntegrityError("That category no longer exists.");
      }
    }
    if (t.personId != null && !(await this.db.people.get(t.personId))) {
      throw new IntegrityError("That person no longer exists.");
    }
  }

  /** Create a single expense/income transaction. */
  async createTransaction(
    data: Omit<Transaction, keyof BaseRecord | "transferGroupId" | "goalId" | "debtId" | "investmentId"> &
      Partial<Pick<Transaction, "transferGroupId" | "goalId" | "debtId" | "investmentId">>,
  ): Promise<Transaction> {
    const rec = stampNew<Transaction>({
      transferGroupId: null,
      goalId: null,
      debtId: null,
      investmentId: null,
      ...data,
    });
    await this.assertReferences(rec);
    await this.db.transactions.put(rec);
    return rec;
  }

  async updateTransaction(id: string, patch: Partial<Transaction>): Promise<void> {
    const existing = await this.db.transactions.get(id);
    if (!existing) throw new IntegrityError("Transaction not found.");
    const merged = { ...existing, ...patch };
    await this.assertReferences(merged);
    await this.db.transactions.update(id, { ...patch, updatedAt: Date.now() });
  }

  /** Deleting one half of a transfer deletes both halves (one movement). */
  async deleteTransaction(id: string): Promise<void> {
    const t = await this.db.transactions.get(id);
    if (!t) return;
    if (t.transferGroupId) {
      await this.db.transactions.where("transferGroupId").equals(t.transferGroupId).delete();
      return;
    }
    await this.db.transactions.delete(id);
  }

  /**
   * Create a transfer as a pair of transactions sharing a transferGroupId:
   * one "out" of the source account, one "in" to the destination. Equal amount,
   * type=transfer, no category. Nets to zero across net worth.
   */
  async createTransfer(input: {
    date: string;
    amount: number;
    fromAccountId: string;
    toAccountId: string;
    personId?: string | null;
    note?: string;
    cleared?: boolean;
  }): Promise<{ out: Transaction; in: Transaction }> {
    if (input.fromAccountId === input.toAccountId) {
      throw new IntegrityError("Choose two different accounts to move money between.");
    }
    if (!(await this.db.accounts.get(input.fromAccountId)) || !(await this.db.accounts.get(input.toAccountId))) {
      throw new IntegrityError("One of those accounts no longer exists.");
    }
    const groupId = newId();
    const cleared = input.cleared ?? true;
    const base = {
      date: input.date,
      amount: input.amount,
      type: "transfer" as const,
      categoryId: null,
      personId: input.personId ?? null,
      source: "manual" as const,
      note: input.note,
      cleared,
      transferGroupId: groupId,
      goalId: null,
      debtId: null,
      investmentId: null,
    };
    const outRec = stampNew<Transaction>({ ...base, direction: "out", accountId: input.fromAccountId });
    const inRec = stampNew<Transaction>({ ...base, direction: "in", accountId: input.toAccountId });
    await this.db.transactions.bulkPut([outRec, inRec]);
    return { out: outRec, in: inRec };
  }
}

let _repo: FinanceRepository | null = null;
export function getRepository(db: FinanceDB): FinanceRepository {
  if (!_repo) _repo = new FinanceRepository(db);
  return _repo;
}
