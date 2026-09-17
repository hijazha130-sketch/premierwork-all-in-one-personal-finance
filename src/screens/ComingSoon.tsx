import { SectionTitle } from "@/components/ui";

/**
 * Tasteful placeholder for the Plan and Grow destinations. The navigation frame
 * is complete in Phase 0; these areas fill in during Phases 2-6 (Section 5).
 */
export function ComingSoon({
  overline,
  title,
  blurb,
  items,
}: {
  overline: string;
  title: string;
  blurb: string;
  items: string[];
}) {
  return (
    <div className="max-w-2xl">
      <SectionTitle overline={overline} title={title} subtitle={blurb} />
      <div className="card p-6">
        <div className="text-xs font-semibold uppercase tracking-widest text-gold mb-4">Coming soon</div>
        <ul className="space-y-3">
          {items.map((it) => (
            <li key={it} className="flex items-center gap-3 text-muted">
              <span className="h-1.5 w-1.5 rounded-full bg-gold" aria-hidden />
              {it}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export function Plan() {
  return (
    <ComingSoon
      overline="Plan"
      title="What's planned"
      blurb="Soon: upcoming bills, repeating payments, and the plan your money follows through the month."
      items={["Upcoming bills & repeating payments", "Planned vs Spent for each group", "Your month at a glance"]}
    />
  );
}

export function Grow() {
  return (
    <ComingSoon
      overline="Grow"
      title="How your money could grow"
      blurb="Soon: goals you're saving toward, debt payoff progress, and a view of your wealth over time."
      items={["Goals & savings progress", "Debt progress & payoff plan", "How your money could grow"]}
    />
  );
}
