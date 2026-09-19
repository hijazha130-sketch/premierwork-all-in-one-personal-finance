import { Link } from "react-router-dom";
import { useData, useCurrency } from "@/state/dataContext";
import { useCapture } from "@/state/CaptureProvider";
import { Button, Card } from "@/components/ui";
import { MoneyAmount } from "@/components/MoneyAmount";
import { EmptyState } from "@/components/EmptyState";
import { RecentActivity } from "@/components/RecentActivity";
import { OccurrenceActions } from "@/components/OccurrenceActions";
import { monthLabel, currentMonth } from "@/lib/period";
import type { Occurrence } from "@/domain/occurrences";

function greeting(now = new Date()): string {
  const h = now.getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

function shortDate(iso: string, locale: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(locale, { day: "numeric", month: "short" });
}

/**
 * Home (Section 8 & Phase 2 §11). The daily habit screen: a Safe to spend hero
 * (with the total balance as secondary context), a Needs attention block for
 * overdue bills (shown only when any exist), an Upcoming block, plus this
 * month's money in/out and recent activity. Every value is read from derived.* —
 * the screen does no money math and calls no engine (invariant #9).
 */
export function Home() {
  const { accounts, transactions, derived, recurringRulesById } = useData();
  const { locale } = useCurrency();
  const { openCapture } = useCapture();
  const month = monthLabel(currentMonth());

  if (accounts.length === 0) {
    return (
      <div className="max-w-2xl">
        <div className="mb-8">
          <div className="text-xs font-semibold uppercase tracking-widest text-gold mb-2">{greeting()}</div>
          <h1 className="font-serif text-3xl md:text-4xl italic text-ink">Welcome to your money</h1>
        </div>
        <EmptyState
          icon="✦"
          title="Let's set things up"
          message="Add your first account and pick your groups. It takes a minute, and then everything on Home fills in automatically."
          action={
            <Link to="/setup">
              <Button>Start setup</Button>
            </Link>
          }
        />
      </div>
    );
  }

  const safe = derived.safeToSpend;
  const negative = safe.amount < 0;
  const overdue = derived.overdue;
  const upcoming = derived.upcoming.slice(0, 5);
  const hasActivity = transactions.length > 0;

  const nameOf = (o: Occurrence): string => {
    const found = recurringRulesById.get(o.ruleId)?.name;
    return found ?? (o.direction === "in" ? "Money coming in" : "A bill");
  };

  return (
    <div className="space-y-8">
      <div>
        <div className="text-xs font-semibold uppercase tracking-widest text-gold mb-2">{greeting()}</div>
        <h1 className="font-display text-4xl md:text-5xl italic text-ink">{greeting()}, there</h1>
      </div>

      {/* Hero: Safe to spend */}
      <Card>
        <div className="text-xs font-semibold uppercase tracking-widest text-gold mb-3">Safe to spend today</div>
        <MoneyAmount amount={safe.amount} size="hero" tone={negative ? "attention" : "default"} />
        <p className="text-muted mt-3">
          <MoneyAmount amount={derived.total} size="sm" tone="muted" /> across your accounts.
          {negative ? " Your upcoming bills add up to more than you have right now." : ""}
        </p>
        {safe.reservedTotal > 0 && (
          <p className="text-sm text-muted mt-1">
            <MoneyAmount amount={safe.reservedTotal} size="sm" tone="muted" /> set aside for what's coming this month.
          </p>
        )}
        <div className="mt-6">
          <Button onClick={() => openCapture("expense")}>+ Log a spend</Button>
        </div>
      </Card>

      {/* Needs attention (overdue) — only when there is something */}
      {overdue.length > 0 && (
        <Card className="border-attention/40">
          <h2 className="font-display text-2xl text-ink mb-1">What needs attention</h2>
          <p className="text-sm text-muted mb-4">
            {overdue.length === 1 ? "One bill is" : `${overdue.length} bills are`} past due.
          </p>
          <div className="divide-y divide-hairline">
            {overdue.map((o, i) => (
              <div key={i} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-ink font-medium">{nameOf(o)}</span>
                  <span className="block text-xs text-attention">was due {shortDate(o.displayDate, locale)}</span>
                </span>
                <MoneyAmount amount={o.amount} size="sm" tone={o.direction === "in" ? "positive" : "attention"} />
                <OccurrenceActions occurrence={o} />
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* This month in / out */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
        <Card>
          <div className="text-xs font-semibold uppercase tracking-widest text-muted mb-3">This month</div>
          <div className="text-sm text-muted">{month}</div>
        </Card>
        <Card>
          <div className="text-xs font-semibold uppercase tracking-widest text-muted mb-3">Money coming in</div>
          <MoneyAmount amount={derived.monthIn} size="lg" tone="positive" />
        </Card>
        <Card>
          <div className="text-xs font-semibold uppercase tracking-widest text-muted mb-3">Money going out</div>
          <MoneyAmount amount={derived.monthOut} size="lg" tone="attention" />
        </Card>
      </div>

      {/* Upcoming */}
      {upcoming.length > 0 && (
        <Card>
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-display text-2xl text-ink">Coming up</h2>
            <Link to="/money" className="text-sm text-gold hover:underline">
              See calendar
            </Link>
          </div>
          <div className="divide-y divide-hairline">
            {upcoming.map((o, i) => (
              <div key={i} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-ink font-medium">{nameOf(o)}</span>
                  <span className="block text-xs text-muted">Coming up · {shortDate(o.displayDate, locale)}</span>
                </span>
                <MoneyAmount amount={o.amount} size="sm" tone={o.direction === "in" ? "positive" : "default"} />
                <OccurrenceActions occurrence={o} />
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Recent activity or a directive prompt */}
      {hasActivity ? (
        <Card>
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-display text-2xl text-ink">Recent activity</h2>
            <Link to="/money" className="text-sm text-gold hover:underline">
              See all
            </Link>
          </div>
          <RecentActivity limit={5} />
        </Card>
      ) : (
        <EmptyState
          icon="＋"
          title="Add today's spending"
          message="The moment you record something, your totals here update on their own."
          action={<Button onClick={() => openCapture("expense")}>Log a spend</Button>}
        />
      )}
    </div>
  );
}
