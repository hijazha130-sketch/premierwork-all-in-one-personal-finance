import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useData } from "@/state/dataContext";
import { useTheme } from "@/state/ThemeProvider";
import { getDB } from "@/data/db";
import { downloadBackup, importDatabaseString } from "@/data/backup";
import { Button, Card, SectionTitle, Segmented } from "@/components/ui";
import { minorToMajor, parseMajorToMinor } from "@/lib/money";
import { WALLPAPERS } from "@/lib/wallpapers";

/**
 * More (Section 5 & 8). The hub: manage accounts, groups and people; re-run
 * setup; the backup safety net (JSON export / import); theme; and app info.
 */
export function More() {
  const { settings, repo } = useData();
  const { theme, setTheme } = useTheme();
  const fileRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<string>("");

  async function handleImport(file: File) {
    try {
      const text = await file.text();
      await importDatabaseString(getDB(), text);
      setStatus("Backup restored. Everything's back.");
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "That file couldn't be read.");
    }
  }

  return (
    <div className="space-y-8">
      <SectionTitle overline="More" title="Settings & tools" subtitle="Manage what your money is grouped into, and keep a safe backup." />

      <Card>
        <h2 className="font-display text-2xl text-ink mb-4">Manage</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Link to="/accounts" className="rounded-control border border-hairline p-4 hover:bg-inset">
            <div className="text-ink font-medium">Accounts</div>
            <div className="text-xs text-muted mt-1">Where your money is</div>
          </Link>
          <Link to="/groups" className="rounded-control border border-hairline p-4 hover:bg-inset">
            <div className="text-ink font-medium">Groups</div>
            <div className="text-xs text-muted mt-1">How money is grouped</div>
          </Link>
          <Link to="/people" className="rounded-control border border-hairline p-4 hover:bg-inset">
            <div className="text-ink font-medium">People</div>
            <div className="text-xs text-muted mt-1">Who spends in your home</div>
          </Link>
        </div>
        <div className="mt-4">
          <Link to="/setup" className="text-sm text-gold hover:underline">
            Re-run setup
          </Link>
        </div>
      </Card>

      <Card>
        <h2 className="font-display text-2xl text-ink mb-2">Appearance</h2>
        <p className="text-muted text-sm mb-4">Choose the look that's easy on your eyes.</p>
        <Segmented
          ariaLabel="Theme"
          value={theme}
          onChange={setTheme}
          options={[
            { value: "soft", label: "Soft" },
            { value: "midnight", label: "Midnight" },
          ]}
        />

        <div className="mt-6">
          <div className="text-sm font-medium text-ink mb-1">Background</div>
          <p className="text-muted text-sm mb-3">A soft tint behind everything. It stays gentle so your cards keep their glow.</p>
          <div className="flex flex-wrap gap-3">
            {WALLPAPERS.map((w) => {
              const triplet = theme === "midnight" ? w.dark : w.soft;
              const swatch = triplet ? `rgb(${triplet})` : "rgb(var(--surface-base))";
              const active = (settings?.wallpaper ?? "none") === w.id;
              return (
                <button
                  key={w.id}
                  type="button"
                  onClick={() => repo.saveSettings({ wallpaper: w.id })}
                  aria-label={w.label}
                  aria-pressed={active}
                  title={w.label}
                  className={`h-10 w-10 rounded-full border transition-shadow ${
                    active ? "border-gold ring-2 ring-gold ring-offset-2 ring-offset-raised" : "border-hairline"
                  }`}
                  style={{ background: swatch }}
                />
              );
            })}
          </div>
        </div>
      </Card>

      <Card>
        <h2 className="font-display text-2xl text-ink mb-2">Budgeting</h2>
        <p className="text-muted text-sm mb-4">Choose how leftover money works in your plan.</p>
        <Segmented
          ariaLabel="How leftover money works"
          value={settings?.budgetMethod ?? "carryOver"}
          onChange={(m) => repo.saveSettings({ budgetMethod: m })}
          options={[
            { value: "carryOver", label: "Roll leftover into next month" },
            { value: "zeroBased", label: "Give every rupee a job" },
          ]}
        />
      </Card>

      <Card>
        <h2 className="font-display text-2xl text-ink mb-2">Emergency cushion</h2>
        <p className="text-muted text-sm mb-4">
          Keep a cushion set aside that “Safe to spend” won’t touch, so it’s always protected.
        </p>
        <CushionInput
          value={settings?.safetyFloor ?? 0}
          onCommit={(floor) => repo.saveSettings({ safetyFloor: floor })}
        />
      </Card>

      <Card>
        <h2 className="font-display text-2xl text-ink mb-2">Backup</h2>
        <p className="text-muted text-sm mb-4">
          Your data lives on this device. Save a backup file you can restore anytime — this is your
          safety net.
        </p>
        <div className="flex flex-wrap gap-3">
          <Button variant="ghost" onClick={() => downloadBackup(getDB())}>
            Save a backup
          </Button>
          <Button variant="ghost" onClick={() => fileRef.current?.click()}>
            Restore from a backup
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleImport(f);
              e.target.value = "";
            }}
          />
        </div>
        {status && <p className="text-sm text-muted mt-3">{status}</p>}
      </Card>

      <Card>
        <h2 className="font-display text-2xl text-ink mb-2">About</h2>
        <p className="text-muted text-sm">
          All-in-One Personal Finance by PremierWork. Currency: {settings?.currencySymbol ?? "Rs"} (
          {settings?.currencyCode ?? "PKR"}). All data stays on this device and works offline.
        </p>
      </Card>
    </div>
  );
}

/** The emergency-cushion amount; commits the parsed value on blur/Enter. */
function CushionInput({ value, onCommit }: { value: number; onCommit: (floor: number) => void }) {
  const [text, setText] = useState(String(minorToMajor(value)));
  const [last, setLast] = useState(value);
  if (value !== last) {
    setLast(value);
    setText(String(minorToMajor(value)));
  }
  function commit() {
    const amount = parseMajorToMinor(text);
    if (amount != null && amount >= 0) onCommit(amount);
    else setText(String(minorToMajor(value)));
  }
  return (
    <label className="flex items-center justify-between gap-3">
      <span className="text-sm text-ink">Keep at least</span>
      <input
        inputMode="decimal"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
        className="w-32 rounded-control bg-inset border border-hairline px-3 py-2 text-right text-ink focus:border-gold outline-none min-h-[44px]"
      />
    </label>
  );
}
