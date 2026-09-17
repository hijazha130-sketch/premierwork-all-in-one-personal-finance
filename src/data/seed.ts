/**
 * Default starter data (Section 8 — setup step 4: "How your money is grouped").
 * The user never starts from a blank category list; these sensible defaults are
 * pre-filled and fully editable. The needs/wants/savings tag is captured quietly
 * now for the later 50/30/20 lens.
 */
import type { Category, CategoryBucket, NeedsWantsSavings } from "@/domain/types";

interface SeedCategory {
  name: string;
  bucket: CategoryBucket;
  needsWantsSavings: NeedsWantsSavings;
  color: string;
}

export const DEFAULT_CATEGORIES: SeedCategory[] = [
  { name: "Rent & Home", bucket: "bills", needsWantsSavings: "needs", color: "#C98A5B" },
  { name: "Utilities", bucket: "bills", needsWantsSavings: "needs", color: "#B06E3B" },
  { name: "Groceries", bucket: "expenses", needsWantsSavings: "needs", color: "#7FA88A" },
  { name: "Transport", bucket: "expenses", needsWantsSavings: "needs", color: "#8FA9C8" },
  { name: "Eating Out", bucket: "expenses", needsWantsSavings: "wants", color: "#C8A860" },
  { name: "Shopping", bucket: "expenses", needsWantsSavings: "wants", color: "#B58BC0" },
  { name: "Subscriptions", bucket: "bills", needsWantsSavings: "wants", color: "#7FA88A" },
  { name: "Health", bucket: "expenses", needsWantsSavings: "needs", color: "#C97B7B" },
  { name: "Savings", bucket: "savings", needsWantsSavings: "savings", color: "#7FA88A" },
  { name: "Salary", bucket: "income", needsWantsSavings: "none", color: "#4E7A5C" },
  { name: "Other Income", bucket: "income", needsWantsSavings: "none", color: "#4E7A5C" },
];

export type DefaultCategoryInput = Omit<Category, "id" | "createdAt" | "updatedAt" | "archived">;

export function defaultCategoryInputs(): DefaultCategoryInput[] {
  return DEFAULT_CATEGORIES.map((c) => ({ ...c }));
}
