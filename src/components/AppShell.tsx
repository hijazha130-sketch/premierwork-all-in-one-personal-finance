import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useEffect, type ReactNode } from "react";
import { useTheme } from "@/state/ThemeProvider";
import { useCapture } from "@/state/CaptureProvider";
import { useData } from "@/state/dataContext";
import { applyWallpaper } from "@/lib/wallpapers";
import { Segmented } from "@/components/ui";
import { QuickCapture } from "@/screens/QuickCapture";

/**
 * The persistent application shell (Section 2 & 5): brand + context header, a
 * main content region, primary navigation (left sidebar on desktop, bottom tab
 * bar on mobile), and the always-present add button for fast capture.
 *
 * Navigation frame is the five Blueprint destinations. In Phase 0/1 only Home,
 * Money and Setup carry real content; Plan and Grow render "coming soon".
 */
const NAV = [
  { to: "/", label: "Home", icon: HomeIcon, end: true },
  { to: "/money", label: "Money", icon: MoneyIcon },
  { to: "/plan", label: "Plan", icon: PlanIcon },
  { to: "/grow", label: "Wealth", icon: GrowIcon },
  { to: "/more", label: "More", icon: MoreIcon },
];

export function AppShell() {
  const { theme, setTheme } = useTheme();
  const { openCapture } = useCapture();
  const { settings } = useData();
  const location = useLocation();

  // The tinted canvas (§3): apply the chosen tint for the active theme. "None"
  // (the default) removes the override, so the canvas is the base surface.
  useEffect(() => {
    applyWallpaper(settings?.wallpaper ?? "none", theme);
  }, [settings?.wallpaper, theme]);

  return (
    <div className="min-h-full bg-base">
      {/* Plane 1 — the tinted canvas, furthest back (§6). */}
      <div className="wallpaper-canvas fixed inset-0 -z-10" aria-hidden />

      <div className="mx-auto flex max-w-6xl">
        {/* Plane 2 — the sidebar reads as raised chrome above the canvas (§6). */}
        <aside className="hidden md:flex md:w-64 md:flex-col md:sticky md:top-0 md:h-screen bg-raised border-r border-hairline shadow-card px-4 py-6">
          <Brand />
          <nav className="mt-8 flex flex-1 flex-col gap-1" aria-label="Primary">
            {NAV.map((item) => (
              <SidebarLink key={item.to} {...item} />
            ))}
          </nav>
          <div className="mt-auto pt-6">
            <div className="text-xs font-semibold uppercase tracking-widest text-gold mb-2">On-device</div>
            <p className="text-xs text-muted leading-relaxed">
              All data stays on this device. Works offline.
            </p>
          </div>
        </aside>

        {/* Main region */}
        <div className="flex-1 min-w-0 pb-28 md:pb-12">
          <header className="flex items-center justify-between gap-4 px-5 md:px-10 pt-6 md:pt-10 pb-4 border-b border-hairline">
            <div className="md:hidden">
              <Brand compact />
            </div>
            <div className="ml-auto">
              <Segmented
                ariaLabel="Theme"
                value={theme}
                onChange={setTheme}
                options={[
                  { value: "soft", label: "Soft", icon: <span aria-hidden>☀</span> },
                  { value: "midnight", label: "Midnight", icon: <span aria-hidden>☾</span> },
                ]}
              />
            </div>
          </header>

          <main className="px-5 md:px-10 pt-6 md:pt-8">
            <Outlet />
          </main>
        </div>
      </div>

      {/* Always-present add button — desktop floating */}
      <button
        onClick={() => openCapture("expense")}
        aria-label="Log a spend"
        className="hidden md:flex fixed bottom-8 right-8 z-40 h-14 items-center gap-2 rounded-pill bg-gold px-6 text-base font-medium text-base shadow-card hover:opacity-90"
      >
        <PlusIcon /> <span className="text-base font-semibold">Log a spend</span>
      </button>

      {/* Mobile bottom tab bar with center add button */}
      <nav
        className="md:hidden fixed bottom-0 inset-x-0 z-40 border-t border-hairline bg-raised/95 backdrop-blur"
        aria-label="Primary"
      >
        <div className="grid grid-cols-5 items-center">
          <BottomLink {...NAV[0]} />
          <BottomLink {...NAV[1]} />
          <div className="flex justify-center">
            <button
              onClick={() => openCapture("expense")}
              aria-label="Log a spend"
              className="-mt-6 flex h-14 w-14 items-center justify-center rounded-full bg-gold text-base shadow-card"
            >
              <PlusIcon />
            </button>
          </div>
          <BottomLink {...NAV[3]} />
          <BottomLink {...NAV[4]} />
        </div>
      </nav>

      {/* Quick capture / editor sheet, mounted at shell level */}
      <QuickCapture key={location.key} />
    </div>
  );
}

function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex h-10 w-10 items-center justify-center rounded-card bg-inset font-serif text-xl text-gold">
        A
      </div>
      {!compact && (
        <div className="leading-tight">
          <div className="font-serif text-sm text-ink">All-in-One</div>
          <div className="font-serif text-base text-ink -mt-0.5">Personal Finance</div>
          <div className="text-[10px] font-semibold uppercase tracking-widest text-gold mt-0.5">
            by PremierWork
          </div>
        </div>
      )}
    </div>
  );
}

function SidebarLink({
  to,
  label,
  icon: Icon,
  end,
}: {
  to: string;
  label: string;
  icon: () => ReactNode;
  end?: boolean;
}) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        `flex items-center gap-3 rounded-control px-4 py-3 text-sm font-medium transition-colors ${
          isActive ? "bg-gold/10 text-gold" : "text-muted hover:text-ink hover:bg-inset/60"
        }`
      }
    >
      <Icon />
      {label}
    </NavLink>
  );
}

function BottomLink({ to, label, icon: Icon, end }: { to: string; label: string; icon: () => ReactNode; end?: boolean }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        `flex flex-col items-center gap-1 py-3 text-[11px] font-medium ${
          isActive ? "text-gold" : "text-muted"
        }`
      }
    >
      <Icon />
      {label}
    </NavLink>
  );
}

/* --- Minimal inline icons (stroke = currentColor) ------------------------- */
function icon(path: ReactNode) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {path}
    </svg>
  );
}
function HomeIcon() {
  return icon(<><path d="M3 9.5 12 3l9 6.5" /><path d="M5 10v10h14V10" /></>);
}
function MoneyIcon() {
  return icon(<><path d="M4 7h16v10H4z" /><path d="M4 11h16" /><circle cx="8" cy="14" r="1" /></>);
}
function PlanIcon() {
  return icon(<><rect x="4" y="5" width="16" height="16" rx="2" /><path d="M8 3v4M16 3v4M4 10h16" /></>);
}
function GrowIcon() {
  return icon(<><path d="M4 19h16" /><path d="M7 16v-4M12 16V7M17 16v-6" /></>);
}
function MoreIcon() {
  return icon(<><circle cx="5" cy="12" r="1.4" /><circle cx="12" cy="12" r="1.4" /><circle cx="19" cy="12" r="1.4" /></>);
}
function PlusIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}
