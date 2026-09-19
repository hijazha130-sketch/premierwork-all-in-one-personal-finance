import { useState } from "react";
import { Link } from "react-router-dom";
import { useData, useCurrency } from "@/state/dataContext";
import { Card } from "@/components/ui";
import { MoneyAmount } from "@/components/MoneyAmount";
import { share } from "@/domain/budget";
import { currentMonth, monthLabel } from "@/lib/period";

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/**
 * The 50/30/20 lens (Plan): how the month's actual spending splits across needs,
 * wants and savings, each as a share of income, against the 50/30/20 target.
 * Reads derived state only; groups by the group's own need/want/saving tag.
 */
export function FiftyThirtyTwentyView() {
  const { fiftyThirtyTwentyForPeriod, categories } = useData();
  const { locale } = useCurrency();
  const [{ year, month }, setMonth] = useState(currentMonth());

  const periodKey = `${year}-${pad2(month)}`;
  const split = fiftyThirtyTwentyForPeriod(periodKey);

  function shift(delta: number) {
    const idx = year * 12 + (month - 1) + delta;
    setMonth({ year: Math.floor(idx / 12), month: (idx % 12) + 1 });
  }

  const groups = [
    { label: "Needs", amount: split.needs, target: split.target.needs },
    { label: "Wants", amount: split.wants, target: split.target.wants },
    { label: "Savings", amount: split.savings, target: split.target.savings },
  ];

  const untagged = categories.filter((c) => c.bucket !== "income" && c.needsWantsSavings === "none");

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

      <Card>
        <div className="text-xs font-semibold uppercase tracking-widest text-gold mb-2">Money coming in</div>
        <MoneyAmount amount={split.income} size="lg" tone="positive" />
        {split.income === 0 && (
          <p className="text-sm text-muted mt-2">Record some money coming in this month to see your split as a share of income.</p>
        )}
      </Card>

      <Card>
        <h3 className="font-display text-xl text-ink mb-4">Your split</h3>
        <div className="space-y-5">
          {groups.map((g) => {
            const pct = share(g.amount, split.income);
            return (
              <div key={g.label}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-ink font-medium">{g.label}</span>
                  <MoneyAmount amount={g.amount} size="sm" />
                </div>
                <div className="relative h-2 rounded-pill bg-inset overflow-hidden">
                  <div className="absolute inset-y-0 left-0 bg-gold rounded-pill" style={{ width: `${Math.min(pct, 100)}%` }} />
                  <div className="absolute inset-y-0 w-px bg-ink/50" style={{ left: `${g.target}%` }} aria-hidden />
                </div>
                <div className="mt-1 text-xs text-muted">
                  {split.income > 0 ? `${pct}% of your income` : "—"} · target {g.target}%
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      {/* Unclassified — nudge to tag */}
      {untagged.length > 0 && (
        <Card>
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-display text-xl text-ink">Not yet sorted</h3>
            <MoneyAmount amount={split.unclassified} size="sm" tone="muted" />
          </div>
          <p className="text-sm text-muted mb-3">
            These groups aren't marked as a need, want or saving yet, so they're left out of the split above.
          </p>
          <div className="flex flex-wrap gap-2">
            {untagged.map((c) => (
              <span key={c.id} className="inline-flex items-center rounded-pill bg-inset px-3 py-1 text-sm text-muted">
                {c.name}
              </span>
            ))}
          </div>
          <div className="mt-3">
            <Link to="/groups" className="text-sm text-gold hover:underline">
              Sort your groups
            </Link>
          </div>
        </Card>
      )}
    </div>
  );
}
