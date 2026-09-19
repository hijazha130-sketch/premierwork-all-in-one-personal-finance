import { useState } from "react";
import { Link } from "react-router-dom";
import { useData } from "@/state/dataContext";
import { Card, SectionTitle, Button, Sheet, Field, TextInput, SelectInput } from "@/components/ui";
import { MoneyAmount } from "@/components/MoneyAmount";
import { parseMajorToMinor } from "@/lib/money";
import { todayIso } from "@/lib/period";
import type { Asset, AssetKind } from "@/domain/types";

/**
 * Wealth (Grow) — net worth now, a simple trend, "What you own" and "What you
 * owe". Everything shown is read from derived state (netWorth, netWorthSeries,
 * assetValues); the screen does no money math itself. Value is set only by a
 * value observation (never edited in place), so history is append-only.
 */
export function WealthView() {
  const { derived, assets, accounts, debts, repo } = useData();
  const [addingAsset, setAddingAsset] = useState(false);
  const [valuing, setValuing] = useState<Asset | null>(null);

  const nw = derived.netWorth;
  const series = derived.netWorthSeries;
  const change =
    series.length >= 2 ? series[series.length - 1].netWorth - series[series.length - 2].netWorth : 0;

  const owed = accounts.filter((a) => a.type === "credit" || a.type === "loan");
  const hasOwing = owed.length > 0 || debts.length > 0;

  return (
    <div className="space-y-8">
      <SectionTitle overline="Grow" title="Your wealth" subtitle="What you own, what you owe, and how it's changing over time." />

      {/* Headline net worth + change */}
      <Card>
        <div className="text-xs font-semibold uppercase tracking-widest text-gold mb-2">Net worth</div>
        <MoneyAmount amount={nw.netWorth} size="hero" tone={nw.netWorth < 0 ? "attention" : "default"} />
        {series.length >= 2 && (
          <p className="mt-2 text-sm text-muted">
            <MoneyAmount amount={change} size="sm" signed tone={change < 0 ? "attention" : "positive"} /> this month
          </p>
        )}
        <div className="mt-5">
          <Trend points={series.map((p) => p.netWorth)} />
        </div>
      </Card>

      {/* What you own */}
      <Card>
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display text-2xl text-ink">What you own</h2>
          <Button variant="ghost" onClick={() => setAddingAsset(true)}>
            Add asset
          </Button>
        </div>

        <div className="divide-y divide-hairline">
          {/* Cash across everyday accounts */}
          <div className="flex items-center justify-between py-3">
            <div>
              <div className="text-ink font-medium">Cash</div>
              <div className="text-xs text-muted">Across your everyday accounts</div>
            </div>
            <MoneyAmount amount={nw.breakdown.cash} size="sm" />
          </div>

          {assets.length === 0 ? (
            <div className="py-4">
              <p className="text-sm text-muted">
                Add something you own — an investment, a property, a vehicle — and keep its value up to date to see your full net worth.
              </p>
            </div>
          ) : (
            assets.map((a) => {
              const value = derived.assetValues[a.id] ?? 0;
              return (
                <div key={a.id} className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <div className="text-ink font-medium truncate">{a.name}</div>
                    <div className="text-xs text-muted capitalize">{a.kind}</div>
                  </div>
                  <div className="flex items-center gap-4">
                    {value > 0 ? (
                      <MoneyAmount amount={value} size="sm" />
                    ) : (
                      <span className="text-xs text-muted">No value yet</span>
                    )}
                    <button className="text-sm text-gold hover:underline whitespace-nowrap" onClick={() => setValuing(a)}>
                      Update value
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </Card>

      {/* What you owe */}
      <Card>
        <h2 className="font-display text-2xl text-ink mb-4">What you owe</h2>
        {!hasOwing ? (
          <p className="text-sm text-muted">Nothing owed. When you add a debt, it shows here and lowers your net worth.</p>
        ) : (
          <div className="divide-y divide-hairline">
            {owed.map((a) => (
              <div key={a.id} className="flex items-center justify-between py-3">
                <div className="text-ink font-medium">{a.name}</div>
                <MoneyAmount amount={derived.balances[a.id] ?? 0} size="sm" tone="attention" />
              </div>
            ))}
            {debts.map((d) => (
              <div key={d.id} className="flex items-center justify-between py-3">
                <div className="text-ink font-medium">{d.name}</div>
                <MoneyAmount amount={d.currentBalance} size="sm" tone="attention" />
              </div>
            ))}
          </div>
        )}
        <div className="mt-4">
          <Link to="/plan" className="text-sm text-gold hover:underline">
            Plan your debt payoff
          </Link>
        </div>
      </Card>

      {addingAsset && (
        <AssetSheet
          onClose={() => setAddingAsset(false)}
          onSave={async (data) => {
            await repo.createAsset(data);
            setAddingAsset(false);
          }}
        />
      )}

      {valuing && (
        <ValueSheet
          asset={valuing}
          onClose={() => setValuing(null)}
          onSave={async (value, asOf) => {
            await repo.addValuation(valuing.id, { value, asOf });
            setValuing(null);
          }}
          onArchive={async () => {
            await repo.archiveAsset(valuing.id);
            setValuing(null);
          }}
        />
      )}
    </div>
  );
}

/** A lightweight inline trend line (no chart dependency). */
function Trend({ points }: { points: number[] }) {
  if (points.length < 2) {
    return <div className="h-12 rounded-control bg-inset" aria-hidden />;
  }
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min || 1;
  const W = 100;
  const H = 40;
  const coords = points.map((v, i) => {
    const x = (i / (points.length - 1)) * W;
    const y = H - ((v - min) / span) * H;
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  });
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="h-12 w-full" role="img" aria-label="Net worth over the last 12 months">
      <polyline
        points={coords.join(" ")}
        fill="none"
        stroke="var(--gold, #b8934e)"
        strokeWidth="1.5"
        vectorEffect="non-scaling-stroke"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

type AssetDraft = Omit<Asset, "id" | "createdAt" | "updatedAt" | "archived">;

function AssetSheet({ onClose, onSave }: { onClose: () => void; onSave: (data: AssetDraft) => void | Promise<void> }) {
  const [name, setName] = useState("");
  const [kind, setKind] = useState<AssetKind>("investment");
  const [error, setError] = useState("");

  const kinds: { value: AssetKind; label: string }[] = [
    { value: "investment", label: "Investment" },
    { value: "property", label: "Property" },
    { value: "vehicle", label: "Vehicle" },
    { value: "cash", label: "Cash" },
    { value: "other", label: "Other" },
  ];

  function save() {
    if (name.trim() === "") return setError("Give it a name.");
    onSave({ name: name.trim(), kind, accountId: null });
  }

  return (
    <Sheet open onClose={onClose} title="Add asset">
      <div className="space-y-5">
        <Field label="Name">
          <TextInput value={name} onChange={(e) => { setName(e.target.value); setError(""); }} placeholder="e.g. Index fund" autoFocus />
        </Field>
        <Field label="Type">
          <SelectInput value={kind} onChange={(e) => setKind(e.target.value as AssetKind)}>
            {kinds.map((k) => (
              <option key={k.value} value={k.value}>
                {k.label}
              </option>
            ))}
          </SelectInput>
        </Field>
        {error && <p className="text-sm text-attention">{error}</p>}
        <div className="pt-2">
          <Button className="w-full" onClick={save}>
            Add asset
          </Button>
        </div>
      </div>
    </Sheet>
  );
}

function ValueSheet({
  asset,
  onClose,
  onSave,
  onArchive,
}: {
  asset: Asset;
  onClose: () => void;
  onSave: (value: number, asOf: string) => void | Promise<void>;
  onArchive: () => void | Promise<void>;
}) {
  const [value, setValue] = useState("");
  const [date, setDate] = useState(todayIso());
  const [error, setError] = useState("");

  function save() {
    const amount = parseMajorToMinor(value);
    if (amount == null || amount < 0) return setError("Enter what it's worth today.");
    onSave(amount, date || todayIso());
  }

  return (
    <Sheet open onClose={onClose} title={`Update value — ${asset.name}`}>
      <div className="space-y-5">
        <p className="text-sm text-muted">
          Record what it's worth now. Each update is kept as a dated point on your trend — it never overwrites the past.
        </p>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Value">
            <TextInput inputMode="decimal" value={value} onChange={(e) => { setValue(e.target.value); setError(""); }} placeholder="0" autoFocus />
          </Field>
          <Field label="As of">
            <TextInput type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
        </div>
        {error && <p className="text-sm text-attention">{error}</p>}
        <div className="flex items-center gap-3 pt-2">
          <Button className="flex-1" onClick={save}>
            Save value
          </Button>
          <Button variant="danger" onClick={onArchive}>
            Archive
          </Button>
        </div>
      </div>
    </Sheet>
  );
}
