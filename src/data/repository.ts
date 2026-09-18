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
  BudgetPeriodLine,
  BudgetTemplate,
  Category,
  IncomeSource,
  IsoDate,
  Minor,
  OverrideAction,
  PeriodKey,
  Person,
  RecurringOverride,
  RecurringRule,
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
      schemaVersion: 4,
      setupComplete: false,
      safeToSpendHorizon: "endOfMonth",
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
    data: Omit<
      Transaction,
      keyof BaseRecord | "transferGroupId" | "goalId" | "debtId" | "investmentId" | "recurringRuleId" | "occurrenceDate"
    > &
      Partial<
        Pick<
          Transaction,
          "transferGroupId" | "goalId" | "debtId" | "investmentId" | "recurringRuleId" | "occurrenceDate"
        >
      >,
  ): Promise<Transaction> {
    const rec = stampNew<Transaction>({
      transferGroupId: null,
      recurringRuleId: null,
      occurrenceDate: null,
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
      recurringRuleId: null,
      occurrenceDate: null,
      goalId: null,
      debtId: null,
      investmentId: null,
    };
    const outRec = stampNew<Transaction>({ ...base, direction: "out", accountId: input.fromAccountId });
    const inRec = stampNew<Transaction>({ ...base, direction: "in", accountId: input.toAccountId });
    await this.db.transactions.bulkPut([outRec, inRec]);
    return { out: outRec, in: inRec };
  }

  // --- Recurring rules (Phase 2) ------------------------------------------
  // A rule is a *definition* of a repeating bill/income — never money by itself.
  // Occurrences are still computed, never stored (that arrives in later steps).

  async listRecurringRules(includeArchived = false): Promise<RecurringRule[]> {
    const all = await this.db.recurringRules.toArray();
    return includeArchived ? all : all.filter((r) => !r.archived);
  }

  async getRecurringRule(id: string): Promise<RecurringRule | undefined> {
    return this.db.recurringRules.get(id);
  }

  /**
   * Create a recurring rule. Integrity mirrors transactions: the account must
   * exist, and the group/person must exist when set (reuses assertReferences —
   * a rule's type is always expense/income, never transfer).
   */
  async createRecurringRule(
    data: Omit<RecurringRule, keyof BaseRecord | "active" | "archived" | "goalId" | "debtId" | "investmentId"> &
      Partial<Pick<RecurringRule, "active" | "archived" | "goalId" | "debtId" | "investmentId">>,
  ): Promise<RecurringRule> {
    const rec = stampNew<RecurringRule>({
      active: true,
      archived: false,
      goalId: null,
      debtId: null,
      investmentId: null,
      ...data,
    });
    await this.assertReferences({
      accountId: rec.accountId,
      categoryId: rec.categoryId,
      personId: rec.personId,
      type: rec.type,
    });
    await this.db.recurringRules.put(rec);
    return rec;
  }

  async updateRecurringRule(id: string, patch: Partial<RecurringRule>): Promise<void> {
    const existing = await this.db.recurringRules.get(id);
    if (!existing) throw new IntegrityError("That repeating item no longer exists.");
    const merged = { ...existing, ...patch };
    await this.assertReferences({
      accountId: merged.accountId,
      categoryId: merged.categoryId,
      personId: merged.personId,
      type: merged.type,
    });
    await this.db.recurringRules.update(id, { ...patch, updatedAt: Date.now() });
  }

  /** Pause a rule (generates no future occurrences); reversible with resume. */
  async pauseRecurringRule(id: string): Promise<void> {
    await this.updateRecurringRule(id, { active: false });
  }
  async resumeRecurringRule(id: string): Promise<void> {
    await this.updateRecurringRule(id, { active: true });
  }

  /**
   * Archive a rule (drops it from active lists but keeps it — and its linked
   * transactions — for history). The rule still exists, so its overrides are not
   * orphaned; they are inert while the rule generates nothing.
   */
  async archiveRecurringRule(id: string): Promise<void> {
    await this.updateRecurringRule(id, { archived: true });
  }

  /** True when any transaction was recorded against this rule. */
  async isRecurringRuleInUse(id: string): Promise<boolean> {
    const count = await this.db.transactions.where("recurringRuleId").equals(id).count();
    return count > 0;
  }

  /**
   * Hard-delete a rule only when no transaction references it — otherwise throw
   * (caller should archive), mirroring the dimension archive-vs-delete rule.
   * On a successful hard-delete, its overrides are removed so none are orphaned.
   */
  async deleteRecurringRule(id: string): Promise<void> {
    if (await this.isRecurringRuleInUse(id)) {
      throw new IntegrityError("This repeating item has recorded payments — archive it instead.");
    }
    await this.db.recurringOverrides.where("ruleId").equals(id).delete();
    await this.db.recurringRules.delete(id);
  }

  // --- Recurring overrides (exceptions only) ------------------------------

  async listRecurringOverrides(ruleId?: string): Promise<RecurringOverride[]> {
    if (ruleId) return this.db.recurringOverrides.where("ruleId").equals(ruleId).toArray();
    return this.db.recurringOverrides.toArray();
  }

  async getOverride(ruleId: string, occurrenceDate: IsoDate): Promise<RecurringOverride | undefined> {
    return this.db.recurringOverrides.where("[ruleId+occurrenceDate]").equals([ruleId, occurrenceDate]).first();
  }

  /**
   * Create or update the single override for a given (ruleId, occurrenceDate).
   * Uniqueness is enforced by updating in place when one already exists, so a
   * second call never duplicates. "skip" carries no adjusted fields; "adjust"
   * carries the changed amount and/or date.
   */
  async createOrUpdateOverride(input: {
    ruleId: string;
    occurrenceDate: IsoDate;
    action: OverrideAction;
    adjustedAmount?: Minor;
    adjustedDate?: IsoDate;
  }): Promise<RecurringOverride> {
    const existing = await this.getOverride(input.ruleId, input.occurrenceDate);
    const now = Date.now();
    const rec: RecurringOverride = {
      id: existing?.id ?? newId(),
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      ruleId: input.ruleId,
      occurrenceDate: input.occurrenceDate,
      action: input.action,
      ...(input.action === "adjust"
        ? {
            ...(input.adjustedAmount !== undefined ? { adjustedAmount: input.adjustedAmount } : {}),
            ...(input.adjustedDate !== undefined ? { adjustedDate: input.adjustedDate } : {}),
          }
        : {}),
    };
    await this.db.recurringOverrides.put(rec);
    return rec;
  }

  async deleteOverride(ruleId: string, occurrenceDate: IsoDate): Promise<void> {
    const existing = await this.getOverride(ruleId, occurrenceDate);
    if (existing) await this.db.recurringOverrides.delete(existing.id);
  }

  // --- Occurrence → transaction (the only way a rule becomes money) --------

  /**
   * Turn a confirmed occurrence into a real Transaction through the existing
   * createTransaction path (never a direct table write). Sets source:"recurring"
   * and links back to the rule + the scheduled occurrence date. An "adjust"
   * override changes the amount and/or the actual date, but the transaction's
   * occurrenceDate stays the ORIGINAL scheduled date so paid-detection matches on
   * it (Architecture §15). Runs on manual confirmation only (FD-3); the UI wires
   * it in Step 10. cleared is independent of fulfilment (FD-5).
   */
  async createTransactionFromOccurrence(
    rule: RecurringRule,
    occurrenceDate: IsoDate,
    opts?: {
      cleared?: boolean;
      note?: string;
      override?: RecurringOverride;
      // User-confirmed tweaks (from the "Mark as paid" sheet). When omitted, the
      // value falls back to the adjust override, then the rule's own value.
      amount?: Minor;
      date?: IsoDate;
      categoryId?: string | null;
      accountId?: string;
      personId?: string | null;
    },
  ): Promise<Transaction> {
    const override = opts?.override ?? (await this.getOverride(rule.id, occurrenceDate));
    const adjusting = override?.action === "adjust";
    const amount =
      opts?.amount ?? (adjusting && override?.adjustedAmount != null ? override.adjustedAmount : rule.amount);
    const date =
      opts?.date ?? (adjusting && override?.adjustedDate != null ? override.adjustedDate : occurrenceDate);
    return this.createTransaction({
      date,
      amount,
      direction: rule.direction,
      type: rule.type,
      categoryId: opts?.categoryId !== undefined ? opts.categoryId : rule.categoryId,
      accountId: opts?.accountId ?? rule.accountId,
      personId: opts?.personId !== undefined ? opts.personId : rule.personId,
      source: "recurring",
      note: opts?.note,
      cleared: opts?.cleared ?? true,
      recurringRuleId: rule.id,
      occurrenceDate, // the scheduled date it fulfills (matches even if paid early/late)
    });
  }

  // --- Budgets (Phase 3) --------------------------------------------------
  // Budgets store only targets — a planned amount per category. "Actual" is
  // never stored; it is always the transaction aggregation. Templates hold the
  // usual monthly amount; period lines override it for one specific month.

  async listBudgetTemplates(): Promise<BudgetTemplate[]> {
    return this.db.budgetTemplates.toArray();
  }

  /** The template for a category, if the user has set one. */
  async getBudgetTemplate(categoryId: string): Promise<BudgetTemplate | undefined> {
    return this.db.budgetTemplates.where("categoryId").equals(categoryId).first();
  }

  /**
   * Upsert the usual planned amount for a category — exactly one template per
   * category (updates in place if one exists, never duplicates).
   */
  async setBudgetTemplate(categoryId: string, plannedAmount: Minor): Promise<BudgetTemplate> {
    const existing = await this.getBudgetTemplate(categoryId);
    if (existing) {
      const updated: BudgetTemplate = { ...existing, plannedAmount, updatedAt: Date.now() };
      await this.db.budgetTemplates.put(updated);
      return updated;
    }
    const rec = stampNew<BudgetTemplate>({ categoryId, plannedAmount });
    await this.db.budgetTemplates.put(rec);
    return rec;
  }

  async deleteBudgetTemplate(categoryId: string): Promise<void> {
    await this.db.budgetTemplates.where("categoryId").equals(categoryId).delete();
  }

  async listBudgetPeriodLines(periodKey?: PeriodKey): Promise<BudgetPeriodLine[]> {
    if (periodKey) return this.db.budgetPeriodLines.where("periodKey").equals(periodKey).toArray();
    return this.db.budgetPeriodLines.toArray();
  }

  async getBudgetPeriodLine(periodKey: PeriodKey, categoryId: string): Promise<BudgetPeriodLine | undefined> {
    return this.db.budgetPeriodLines.where("[periodKey+categoryId]").equals([periodKey, categoryId]).first();
  }

  /**
   * Upsert the planned amount for one (month, category) — exactly one line per
   * (periodKey, categoryId), enforced via the compound index (updates in place).
   */
  async setBudgetPeriodLine(input: {
    periodKey: PeriodKey;
    categoryId: string;
    plannedAmount: Minor;
  }): Promise<BudgetPeriodLine> {
    const existing = await this.getBudgetPeriodLine(input.periodKey, input.categoryId);
    if (existing) {
      const updated: BudgetPeriodLine = { ...existing, plannedAmount: input.plannedAmount, updatedAt: Date.now() };
      await this.db.budgetPeriodLines.put(updated);
      return updated;
    }
    const rec = stampNew<BudgetPeriodLine>({ ...input });
    await this.db.budgetPeriodLines.put(rec);
    return rec;
  }

  async deleteBudgetPeriodLine(periodKey: PeriodKey, categoryId: string): Promise<void> {
    const existing = await this.getBudgetPeriodLine(periodKey, categoryId);
    if (existing) await this.db.budgetPeriodLines.delete(existing.id);
  }
}

let _repo: FinanceRepository | null = null;
export function getRepository(db: FinanceDB): FinanceRepository {
  if (!_repo) _repo = new FinanceRepository(db);
  return _repo;
}
