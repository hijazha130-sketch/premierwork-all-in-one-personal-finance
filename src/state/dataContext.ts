import { createContext, useContext } from "react";
import type { FinanceRepository } from "@/data/repository";
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
import type { Occurrence } from "@/domain/occurrences";
import type { CashflowProjection, SafeToSpendResult } from "@/domain/cashflow";
import type { DateRange } from "@/lib/period";

/**
 * The data layer made available to every screen. Kept in its own module (apart
 * from the DataProvider component) so the provider file exports only a component
 * — which keeps React Fast Refresh happy in development.
 */
export interface DataContextValue {
  repo: FinanceRepository;
  loading: boolean;
  settings: Settings | undefined;
  accounts: Account[];
  categories: Category[];
  people: Person[];
  incomeSources: IncomeSource[];
  transactions: Transaction[];
  recurringRules: RecurringRule[];
  recurringOverrides: RecurringOverride[];
  categoriesById: Map<string, Category>;
  accountsById: Map<string, Account>;
  peopleById: Map<string, Person>;
  recurringRulesById: Map<string, RecurringRule>;
  occurrencesForRange: (range: DateRange) => Occurrence[];
  derived: {
    total: number;
    balances: Record<string, number>;
    monthIn: number;
    monthOut: number;
    occurrences: Occurrence[];
    upcoming: Occurrence[];
    overdue: Occurrence[];
    safeToSpend: SafeToSpendResult;
    projectedCashflow: CashflowProjection;
  };
}

export const DataContext = createContext<DataContextValue | null>(null);

export function useData(): DataContextValue {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error("useData must be used within DataProvider");
  return ctx;
}

/** Convenience: currency formatting bound to the current settings. */
export function useCurrency() {
  const { settings } = useData();
  return {
    symbol: settings?.currencySymbol ?? "Rs",
    locale: settings?.locale ?? "en-PK",
  };
}
