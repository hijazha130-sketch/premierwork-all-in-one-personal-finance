import { useState } from "react";
import { useData, useCurrency } from "@/state/dataContext";
import { Card, SectionTitle, Segmented } from "@/components/ui";
import { MoneyAmount } from "@/components/MoneyAmount";
import { EmptyState } from "@/components/EmptyState";
import { FiftyThirtyTwentyView } from "@/screens/FiftyThirtyTwenty";
import { GoalsView } from "@/screens/GoalsView";
import { DebtView } from "@/screens/DebtView";
import { minorToMajor, parseMajorToMinor } from "@/lib/money";
import { currentMonth, monthLabel } from "@/lib/period";
import type { BudgetLine } from "@/domain/budget";

type PlanView = "budget" | "split" | "goals" | "debt";

const SUBTITLES: Record<PlanView, string> = {
  budget: "What you meant to spend, next to what you actually did — for each group, this month.",
  split: "How your spending splits across needs, wants and savings.",
  goals: "What you're saving toward, and how close you are.",
  debt: "What you're paying off, when you'll be debt-free, and the interest along the way.",
};

/**
 * Plan — the budgeting surface. A view switch across the monthly Budget, the
 * 50/30/20 lens, Goals and Debt. Everything shown is read from derived state;
 * the screen does no money math itself.
 */
export function Plan() {
  const [view, setView] = useState<PlanView>("budget");
  return (
    <div className="space-y-8">
      <SectionTitle overline="Plan" title="Your plan" subtitle={SUBTITLES[view]} />
      <Segmented
        ariaLabel="View"
        value={view}
        onChange={setView}
        options={[
          { value: "budget", label: "Budget" },
          { value: "split", label: "50/30/20" },
          { value: "goals", label: "Goals" },
          { value: "debt", label: "Debt" },
        ]}
      />
      {view === "budget" && <BudgetView />}
      {view === "split" && <FiftyThirtyTwentyView />}
      {view === "goals" && <GoalsView />}
      {view === "debt" && <DebtView />}
    </div>
  );
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function BudgetView() {
  const { budgetForPeriod, budgetPeriodLines, repo } = useData();
  const { symbol, locale } = useCurrency();
  const [{ year, month }, setMonth] = useState(currentMonth());

  const periodKey = `${year}-${pad2(month)}`;
  const budget = budgetForPeriod(periodKey);
  const isCarryOver = budget.method === "carryOver";
  const isZeroBased = budget.method === "zeroBased";

  function shift(delta: number) {
    const idx = year * 12 + (month - 1) + delta;
    setMonth({ year: Math.floor(idx / 12), month: (idx % 12) + 1 });
  }

  const hasLine = (categoryId: string) =>
    budgetPeriodLines.some((l) => l.periodKey === periodKey && l.categoryId === categoryId);

  async function commitPlanned(categoryId: string, amount: number) {
    // Edit the effective source: an existing this-month amount, else the usual.
    if (hasLine(categoryId)) await repo.setBudgetPeriodLine({ periodKey, categoryId, plannedAmount: amount });
    else await repo.setBudgetTemplate(categoryId, amount);
  }

  async function copyLastMonth() {
    const prevIdx = year * 12 + (month - 1) - 1;
    const prevKey = `${Math.floor(prevIdx / 12)}-${pad2((prevIdx % 12) + 1)}`;
    const prev = budgetForPeriod(prevKey);
    for (const l of prev.lines) {
      if (l.planned > 0) await repo.setBudgetPeriodLine({ periodKey, categoryId: l.categoryId, plannedAmount: l.planned });
    }
  }

  return (
    <div className="space-y-6">
      {/* Month selector */}
      <div className="flex items-center justify-between">
        <h2 className="font-display text-2xl text-ink">{monthLabel({ year, month }, locale)}</h2>
        <div className="flex items-center gap-1">
          <button aria-label="Previous month" onClick={() => shift(-1)} className="rounded-control px-3 py-2 text-muted hover:bg-inset hover:text-ink">
            ‹
          </button>
          <button onClick={() => setMonth(currentMonth())} className="rounded-control px-3 py-2 text-sm text-muted hover:bg-inset hover:text-ink">
            This month
          </button>
          <button aria-label="Next month" onClick={() => shift(1)} className="rounded-control px-3 py-2 text-muted hover:bg-inset hover:text-ink">
            ›
          </button>
        </div>
      </div>

      {/* Left to assign (zero-based only) */}
      {isZeroBased && (
        <Card className="border-gold/40">
          <div className="text-xs font-semibold uppercase tracking-widest text-gold mb-2">Left to assign</div>
          <MoneyAmount amount={budget.leftToAssign} size="lg" tone={budget.leftToAssign < 0 ? "attention" : "default"} />
          <p className="text-sm text-muted mt-2">
            {budget.leftToAssign === 0
              ? "Every rupee has a job. Nicely done."
              : budget.leftToAssign > 0
                ? "Money coming in that you haven't given a job yet."
                : "You've planned to spend more than you expect to earn this month."}
          </p>
        </Card>
      )}

      {/* Summary */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <div className="text-xs font-semibold uppercase tracking-widest text-muted mb-2">Planned</div>
          <MoneyAmount amount={budget.totalPlanned} size="md" />
        </Card>
        <Card>
          <div className="text-xs font-semibold uppercase tracking-widest text-muted mb-2">Spent</div>
          <MoneyAmount amount={budget.totalActual} size="md" tone="attention" />
        </Card>
        <Card>
          <div className="text-xs font-semibold uppercase tracking-widest text-muted mb-2">Left</div>
          <MoneyAmount amount={budget.totalRemaining} size="md" tone={budget.totalRemaining < 0 ? "attention" : "positive"} />
        </Card>
      </div>

      {/* Rows */}
      {budget.lines.length === 0 ? (
        <EmptyState
          icon="◑"
          title="No groups to plan yet"
          message="Add spending groups first, then set what you plan to spend on each — you'll see spent and left fill in from your real activity."
        />
      ) : (
        <Card>
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-display text-xl text-ink">By group</h3>
            <button onClick={copyLastMonth} className="text-sm text-gold hover:underline">
              Copy last month
            </button>
          </div>
          <div className="divide-y divide-hairline">
            {budget.lines.map((line) => (
              <BudgetRow
                key={line.categoryId}
                line={line}
                periodKey={periodKey}
                showCarryIn={isCarryOver && line.carryIn !== 0}
                justThisMonth={hasLine(line.categoryId)}
                symbol={symbol}
                locale={locale}
                onCommit={(amount) => commitPlanned(line.categoryId, amount)}
                onJustThisMonth={() => repo.setBudgetPeriodLine({ periodKey, categoryId: line.categoryId, plannedAmount: line.planned })}
                onUseUsual={() => repo.deleteBudgetPeriodLine(periodKey, line.categoryId)}
              />
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

function BudgetRow({
  line,
  periodKey,
  showCarryIn,
  justThisMonth,
  symbol,
  locale,
  onCommit,
  onJustThisMonth,
  onUseUsual,
}: {
  line: BudgetLine;
  periodKey: string;
  showCarryIn: boolean;
  justThisMonth: boolean;
  symbol: string;
  locale: string;
  onCommit: (amount: number) => void;
  onJustThisMonth: () => void;
  onUseUsual: () => void;
}) {
  const [text, setText] = useState(String(minorToMajor(line.planned)));
  // Re-sync the field when the month or category changes (not on every keystroke).
  const key = periodKey + line.categoryId;
  const [lastKey, setLastKey] = useState(key);
  if (key !== lastKey) {
    setLastKey(key);
    setText(String(minorToMajor(line.planned)));
  }

  function commit() {
    const amount = parseMajorToMinor(text);
    if (amount != null && amount >= 0) onCommit(amount);
    else setText(String(minorToMajor(line.planned)));
  }

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3">
      <div className="min-w-0 flex-1">
        <div className="truncate text-ink font-medium">{line.categoryName}</div>
        <div className="text-xs text-muted">
          Spent <MoneyAmount amount={line.actual} size="sm" tone="muted" />
          {" · Left "}
          <MoneyAmount amount={line.remaining} size="sm" tone={line.remaining < 0 ? "attention" : "positive"} />
          {showCarryIn && (
            <span className="text-positive">
              {" · "}
              {line.carryIn >= 0 ? "carried in " : "short by "}
              {formatShort(line.carryIn, symbol, locale)} from last month
            </span>
          )}
        </div>
        {justThisMonth ? (
          <button className="text-xs text-muted hover:text-ink mt-0.5" onClick={onUseUsual}>
            Just this month · use the usual
          </button>
        ) : (
          <button className="text-xs text-muted hover:text-ink mt-0.5" onClick={onJustThisMonth}>
            · change just this month
          </button>
        )}
      </div>
      <label className="flex items-center gap-2">
        <span className="text-xs text-muted">Planned</span>
        <input
          inputMode="decimal"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
          className="w-28 rounded-control bg-inset border border-hairline px-3 py-2 text-right text-ink focus:border-gold outline-none min-h-[44px]"
        />
      </label>
    </div>
  );
}

/** Compact "Rs X" for the inline carry-in note (absolute value). */
function formatShort(minor: number, symbol: string, locale: string): string {
  const major = Math.abs(minor) / 100;
  return `${symbol} ${new Intl.NumberFormat(locale, { maximumFractionDigits: major % 1 === 0 ? 0 : 2 }).format(major)}`;
}
