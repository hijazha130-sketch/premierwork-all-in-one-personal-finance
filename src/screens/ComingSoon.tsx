import { SectionTitle } from "@/components/ui";

/**
 * Tasteful placeholder component kept for any not-yet-built destination. Phase 0
 * shipped the full nav frame; Plan (Phase 3) and Grow/Wealth (Phase 5) now carry
 * real content, so this has no current caller — retained for future areas.
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
