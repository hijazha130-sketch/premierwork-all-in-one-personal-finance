import { useMemo, useState } from "react";
import { useData, useCurrency } from "@/state/dataContext";
import { Card, Pill } from "@/components/ui";
import { MoneyAmount } from "@/components/MoneyAmount";
import { OccurrenceActions } from "@/components/OccurrenceActions";
import { buildDayItems, weekOutTotal, type DayItems } from "@/domain/calendar";
import { monthGrid, monthRange, monthLabel, currentMonth, formatDateLabel, todayIso } from "@/lib/period";
import { formatMoney } from "@/lib/money";
import type { OccurrenceStatus } from "@/domain/occurrences";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const STATUS_TEXT: Record<OccurrenceStatus, string> = {
  upcoming: "Coming up",
  overdue: "Needs attention",
  paid: "Paid",
  skipped: "Skipped",
};

/** Tiny in-cell amount, e.g. "1.2k" or "850" (money going out that day). */
function compactMajor(minor: number): string {
  const major = Math.round(minor / 100);
  if (major >= 1000) {
    const k = major / 1000;
    return `${k % 1 === 0 ? k.toFixed(0) : k.toFixed(1)}k`;
  }
  return String(major);
}

/**
 * "Calendar" view inside Money. A month grid placing planned bills/income and
 * actual money on their days (FD-6, visually distinguished), with per-day and
 * per-week money-going-out totals and a today marker. Read-only in this step —
 * confirming a bill (Mark as paid) is wired in a later step. No money math is
 * done here: totals come from the pure buildDayItems selector, occurrences from
 * the shared occurrencesForRange helper.
 */
export function Calendar() {
  const { transactions, occurrencesForRange, recurringRulesById, categoriesById } = useData();
  const { symbol, locale } = useCurrency();
  const [{ year, month }, setMonth] = useState(currentMonth());
  const [selected, setSelected] = useState<string | null>(null);

  const range = monthRange({ year, month });
  const today = todayIso();

  const occ = useMemo(
    () => occurrencesForRange(range),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [occurrencesForRange, range.from, range.to],
  );
  const monthTxns = useMemo(
    () => transactions.filter((t) => t.date >= range.from && t.date <= range.to),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [transactions, range.from, range.to],
  );
  const dayItems = useMemo(() => buildDayItems(occ, monthTxns), [occ, monthTxns]);
  const weeks = monthGrid({ year, month });

  function shift(delta: number) {
    const idx = year * 12 + (month - 1) + delta;
    setMonth({ year: Math.floor(idx / 12), month: (idx % 12) + 1 });
    setSelected(null);
  }

  const selectedItems = selected ? dayItems.get(selected) : undefined;

  return (
    <Card>
      {/* Header: month + navigation */}
      <div className="flex items-center justify-between mb-2">
        <h2 className="font-display text-2xl text-ink">{monthLabel({ year, month }, locale)}</h2>
        <div className="flex items-center gap-1">
          <button
            aria-label="Previous month"
            onClick={() => shift(-1)}
            className="rounded-control px-3 py-2 text-muted hover:bg-inset hover:text-ink"
          >
            ‹
          </button>
          <button onClick={() => setMonth(currentMonth())} className="rounded-control px-3 py-2 text-sm text-muted hover:bg-inset hover:text-ink">
            Today
          </button>
          <button
            aria-label="Next month"
            onClick={() => shift(1)}
            className="rounded-control px-3 py-2 text-muted hover:bg-inset hover:text-ink"
          >
            ›
          </button>
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 mb-4 text-xs text-muted">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full border border-gold" aria-hidden /> Planned
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-ink" aria-hidden /> Recorded
        </span>
      </div>

      {/* Weekday header */}
      <div className="grid grid-cols-7 gap-1 mb-1">
        {WEEKDAYS.map((w) => (
          <div key={w} className="text-center text-[11px] font-semibold uppercase tracking-wide text-muted">
            {w}
          </div>
        ))}
      </div>

      {/* Weeks */}
      <div className="space-y-1">
        {weeks.map((week, wi) => {
          const weekOut = weekOutTotal(week.map((d) => (d ? dayItems.get(d) : undefined)));
          return (
            <div key={wi}>
              <div className="grid grid-cols-7 gap-1">
                {week.map((date, di) =>
                  date === null ? (
                    <div key={di} className="aspect-square" />
                  ) : (
                    <DayCell
                      key={di}
                      date={date}
                      items={dayItems.get(date)}
                      isToday={date === today}
                      isSelected={date === selected}
                      onSelect={() => setSelected(date === selected ? null : date)}
                    />
                  ),
                )}
              </div>
              {weekOut > 0 && (
                <div className="pr-1 pt-0.5 text-right text-[11px] text-muted">
                  Going out this week: {formatMoney(weekOut, { symbol, locale })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Day detail (read-only) */}
      {selected && (
        <div className="mt-6 border-t border-hairline pt-4">
          <h3 className="font-display text-xl text-ink mb-3">{formatDateLabel(selected, locale)}</h3>
          {!selectedItems || (selectedItems.planned.length === 0 && selectedItems.actual.length === 0) ? (
            <p className="text-sm text-muted">Nothing on this day.</p>
          ) : (
            <div className="space-y-2">
              {selectedItems.planned.map((o, i) => {
                const name = recurringRulesById.get(o.ruleId)?.name ?? (o.direction === "in" ? "Income" : "Bill");
                return (
                  <div key={`p${i}`} className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-control border border-hairline px-3 py-2">
                    <span className="flex-1 min-w-0">
                      <span className="block truncate text-ink">{name}</span>
                      <span className="block text-xs text-muted">{STATUS_TEXT[o.status]}</span>
                    </span>
                    <StatusPill status={o.status} />
                    <MoneyAmount amount={o.amount} size="sm" tone={o.direction === "in" ? "positive" : "default"} />
                    <OccurrenceActions occurrence={o} />
                  </div>
                );
              })}
              {selectedItems.actual.map((t, i) => {
                const name = t.categoryId ? categoriesById.get(t.categoryId)?.name : undefined;
                return (
                  <div key={`a${i}`} className="flex items-center gap-3 rounded-control bg-inset px-3 py-2">
                    <span className="flex-1 min-w-0">
                      <span className="block truncate text-ink">{name ?? (t.direction === "in" ? "Money in" : "Spending")}</span>
                      <span className="block text-xs text-muted">Recorded</span>
                    </span>
                    <MoneyAmount amount={t.amount} size="sm" tone={t.direction === "in" ? "positive" : "default"} />
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

function DayCell({
  date,
  items,
  isToday,
  isSelected,
  onSelect,
}: {
  date: string;
  items: DayItems | undefined;
  isToday: boolean;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const dayNum = Number(date.split("-")[2]);
  const dots: { ring: boolean; cls: string }[] = [];
  for (const o of items?.planned ?? []) dots.push({ ring: true, cls: statusDot(o.status) });
  for (const _t of items?.actual ?? []) dots.push({ ring: false, cls: "bg-ink" });

  return (
    <button
      onClick={onSelect}
      className={`aspect-square rounded-control p-1 flex flex-col items-start text-left transition-colors ${
        isSelected ? "bg-inset" : "hover:bg-inset/60"
      }`}
    >
      <span
        className={
          isToday
            ? "flex h-5 w-5 items-center justify-center rounded-full bg-gold text-[11px] font-semibold text-base"
            : "text-[11px] text-muted px-0.5"
        }
      >
        {dayNum}
      </span>
      <span className="mt-0.5 flex flex-wrap gap-0.5">
        {dots.slice(0, 4).map((d, i) => (
          <span
            key={i}
            className={`h-1.5 w-1.5 rounded-full ${d.ring ? `border ${d.cls}` : d.cls}`}
            aria-hidden
          />
        ))}
      </span>
      {items && items.outTotal > 0 && (
        <span className="mt-auto text-[9px] leading-none text-muted">{compactMajor(items.outTotal)}</span>
      )}
    </button>
  );
}

function statusDot(status: OccurrenceStatus): string {
  switch (status) {
    case "overdue":
      return "border-attention";
    case "paid":
      return "border-positive";
    case "skipped":
      return "border-hairline";
    case "upcoming":
    default:
      return "border-gold";
  }
}

function StatusPill({ status }: { status: OccurrenceStatus }) {
  const tone = status === "overdue" ? "attention" : status === "paid" ? "positive" : "muted";
  return <Pill tone={tone as "attention" | "positive" | "muted"}>{STATUS_TEXT[status]}</Pill>;
}
