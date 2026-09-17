import { createContext, useContext, useMemo, type ReactNode } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { getDB } from "@/data/db";
import { FinanceRepository } from "@/data/repository";
import type {
  Account,
  Category,
  IncomeSource,
  Person,
  Settings,
  Transaction,
} from "@/domain/types";
import { balancesByAccount, totalBalance } from "@/domain/balance";
import { moneyIn, moneyOut } from "@/domain/aggregation";
import { currentMonth, monthRange } from "@/lib/period";

/**
 * The data layer made available to every screen. This is the app-level derived
 * state seam: screens read balances/totals from here and never compute money
 * math inline (Section 7, "Derived-state layer").
 */
interface DataContextValue {
  repo: FinanceRepository;
  loading: boolean;
  settings: Settings | undefined;
  accounts: Account[];
  categories: Category[];
  people: Person[];
  incomeSources: IncomeSource[];
  transactions: Transaction[];
  categoriesById: Map<string, Category>;
  accountsById: Map<string, Account>;
  peopleById: Map<string, Person>;
  derived: {
    total: number;
    balances: Record<string, number>;
    monthIn: number;
    monthOut: number;
  };
}

const DataContext = createContext<DataContextValue | null>(null);

export function DataProvider({ children }: { children: ReactNode }) {
  const db = getDB();
  const repo = useMemo(() => new FinanceRepository(db), [db]);

  const settings = useLiveQuery(() => repo.getSettings(), []);
  const accounts = useLiveQuery(() => repo.listAccounts(), []);
  const categories = useLiveQuery(() => repo.listCategories(), []);
  const people = useLiveQuery(() => repo.listPeople(), []);
  const incomeSources = useLiveQuery(() => repo.listIncomeSources(), []);
  const transactions = useLiveQuery(() => repo.listTransactions(), []);

  // Any undefined live query means the first read hasn't resolved yet.
  const loading =
    accounts === undefined ||
    categories === undefined ||
    transactions === undefined ||
    people === undefined ||
    incomeSources === undefined;

  const value = useMemo<DataContextValue>(() => {
    const acc = accounts ?? [];
    const cats = categories ?? [];
    const ppl = people ?? [];
    const inc = incomeSources ?? [];
    const txns = transactions ?? [];
    const range = monthRange(currentMonth());

    return {
      repo,
      loading,
      settings,
      accounts: acc,
      categories: cats,
      people: ppl,
      incomeSources: inc,
      transactions: txns,
      categoriesById: new Map(cats.map((c) => [c.id, c])),
      accountsById: new Map(acc.map((a) => [a.id, a])),
      peopleById: new Map(ppl.map((p) => [p.id, p])),
      derived: {
        total: totalBalance(acc, txns),
        balances: balancesByAccount(acc, txns),
        monthIn: moneyIn(txns, range),
        monthOut: moneyOut(txns, range),
      },
    };
  }, [repo, loading, settings, accounts, categories, people, incomeSources, transactions]);

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

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
