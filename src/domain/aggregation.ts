/**
 * Aggregation selectors (Section 7). A single query function over transactions.
 * Every total the product shows — spending by category, money in vs out for a
 * period, per-account, per-person — is a call to `sumTransactions`.
 *
 * Memoized by filter signature and invalidated when the transaction list
 * identity changes.
 */
import type {
  Category,
  CategoryBucket,
  Minor,
  Transaction,
  TransactionDirection,
  TransactionType,
} from "@/domain/types";
import { inRange, type DateRange } from "@/lib/period";
import { addMinor } from "@/lib/money";

export interface TxFilters {
  categoryId?: string;
  bucket?: CategoryBucket;
  accountId?: string;
  personId?: string;
  type?: TransactionType;
  direction?: TransactionDirection;
  range?: DateRange;
  /** Transfers are excluded from spending/income totals by default. */
  includeTransfers?: boolean;
  /** Only cleared transactions count toward money totals by default. */
  includeUncleared?: boolean;
}

/** Filter a transaction list. Category bucket needs the category lookup. */
export function filterTransactions(
  transactions: Transaction[],
  filters: TxFilters,
  categoriesById?: Map<string, Category>,
): Transaction[] {
  const {
    categoryId,
    bucket,
    accountId,
    personId,
    type,
    direction,
    range,
    includeTransfers = false,
    includeUncleared = false,
  } = filters;

  return transactions.filter((t) => {
    if (!includeTransfers && t.type === "transfer") return false;
    if (!includeUncleared && !t.cleared) return false;
    if (type && t.type !== type) return false;
    if (direction && t.direction !== direction) return false;
    if (accountId && t.accountId !== accountId) return false;
    if (personId && t.personId !== personId) return false;
    if (categoryId && t.categoryId !== categoryId) return false;
    if (bucket) {
      if (!t.categoryId || !categoriesById) return false;
      const cat = categoriesById.get(t.categoryId);
      if (!cat || cat.bucket !== bucket) return false;
    }
    if (range && !inRange(t.date, range)) return false;
    return true;
  });
}

const cache = new WeakMap<Transaction[], Map<string, Minor>>();

function signature(filters: TxFilters): string {
  return JSON.stringify([
    filters.categoryId ?? "",
    filters.bucket ?? "",
    filters.accountId ?? "",
    filters.personId ?? "",
    filters.type ?? "",
    filters.direction ?? "",
    filters.range?.from ?? "",
    filters.range?.to ?? "",
    filters.includeTransfers ?? false,
    filters.includeUncleared ?? false,
  ]);
}

/**
 * Sum matching transaction amounts (minor units). Memoized per (list, filter).
 * Because amounts are always positive, callers choose direction/type to get the
 * figure they want (e.g. money going out = { type:"expense", direction:"out" }).
 */
export function sumTransactions(
  transactions: Transaction[],
  filters: TxFilters,
  categoriesById?: Map<string, Category>,
): Minor {
  // Only memoize when the bucket lens (which needs external lookup) is not used,
  // to keep the cache key sound.
  const memoizable = !filters.bucket;
  const key = signature(filters);
  if (memoizable) {
    let perList = cache.get(transactions);
    if (perList && perList.has(key)) return perList.get(key)!;
    if (!perList) {
      perList = new Map();
      cache.set(transactions, perList);
    }
    const value = compute(transactions, filters, categoriesById);
    perList.set(key, value);
    return value;
  }
  return compute(transactions, filters, categoriesById);
}

function compute(
  transactions: Transaction[],
  filters: TxFilters,
  categoriesById?: Map<string, Category>,
): Minor {
  const matched = filterTransactions(transactions, filters, categoriesById);
  let total = 0;
  for (const t of matched) total = addMinor(total, t.amount);
  return total;
}

/** Money going out for a range (expenses only, cleared). */
export function moneyOut(transactions: Transaction[], range: DateRange): Minor {
  return sumTransactions(transactions, { type: "expense", range });
}

/** Money coming in for a range (income only, cleared). */
export function moneyIn(transactions: Transaction[], range: DateRange): Minor {
  return sumTransactions(transactions, { type: "income", range });
}

/** Spending grouped by category id for a range (expenses only). */
export function spendingByCategory(
  transactions: Transaction[],
  range: DateRange,
): Record<string, Minor> {
  const out: Record<string, Minor> = {};
  for (const t of filterTransactions(transactions, { type: "expense", range })) {
    const key = t.categoryId ?? "uncategorized";
    out[key] = addMinor(out[key] ?? 0, t.amount);
  }
  return out;
}
