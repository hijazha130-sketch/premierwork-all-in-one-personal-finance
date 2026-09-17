import { Link } from "react-router-dom";
import { useData } from "@/state/DataProvider";
import { useCapture } from "@/state/CaptureProvider";
import { Button, Card } from "@/components/ui";
import { MoneyAmount } from "@/components/MoneyAmount";
import { EmptyState } from "@/components/EmptyState";
import { RecentActivity } from "@/components/RecentActivity";
import { monthLabel, currentMonth } from "@/lib/period";

function greeting(now = new Date()): string {
  const h = now.getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

/**
 * Home (Section 8). The daily landing screen. In Phase 1 it shows the honest
 * current picture: total money across accounts, money in / out this month, and
 * recent activity. (Full "Safe to spend" arrives with Phase 2's upcoming bills.)
 */
export function Home() {
  const { accounts, transactions, derived } = useData();
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

  const hasActivity = transactions.length > 0;

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <div className="text-xs font-semibold uppercase tracking-widest text-gold mb-2">{greeting()}</div>
        <h1 className="font-serif text-3xl md:text-4xl italic text-ink">{greeting()}, there</h1>
      </div>

      {/* Hero: money right now */}
      <Card className="relative overflow-hidden">
        <div className="text-xs font-semibold uppercase tracking-widest text-gold mb-3">Money right now</div>
        <MoneyAmount amount={derived.total} size="hero" />
        <p className="text-muted mt-4 max-w-md">
          Everything across your accounts, added up. Every figure here is built straight from what
          you record — nothing to maintain.
        </p>
        <div className="mt-6">
          <Button onClick={() => openCapture("expense")}>+ Log a spend</Button>
        </div>
      </Card>

      {/* This month in / out */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
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

      {/* Recent activity or a directive prompt */}
      {hasActivity ? (
        <Card>
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-serif text-xl text-ink">Recent activity</h2>
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
