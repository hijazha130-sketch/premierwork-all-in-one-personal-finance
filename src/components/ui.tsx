import {
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  useEffect,
} from "react";

function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}

type ButtonVariant = "primary" | "ghost" | "quiet" | "danger";

export function Button({
  variant = "primary",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  const base =
    "inline-flex items-center justify-center gap-2 rounded-control px-4 py-3 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed min-h-[44px]";
  const variants: Record<ButtonVariant, string> = {
    primary: "bg-gold text-base hover:opacity-90",
    ghost: "border border-hairline text-ink hover:bg-inset",
    quiet: "text-muted hover:text-ink hover:bg-inset",
    danger: "border border-attention/50 text-attention hover:bg-attention/10",
  };
  return <button className={cx(base, variants[variant], className)} {...props} />;
}

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  // 32px padding (§7) for generous breathing room; the .card utility carries the
  // surface, hairline, radius and two-part shadow.
  return <div className={cx("card p-8", className)}>{children}</div>;
}

export function SectionTitle({ overline, title, subtitle }: { overline?: string; title: string; subtitle?: string }) {
  return (
    <div className="mb-8">
      {overline && (
        <div className="text-xs font-semibold uppercase tracking-widest text-gold mb-2">{overline}</div>
      )}
      <h1 className="font-display text-4xl md:text-5xl text-ink leading-tight">{title}</h1>
      {subtitle && <p className="text-muted mt-3 max-w-xl">{subtitle}</p>}
    </div>
  );
}

export function Field({
  label,
  error,
  hint,
  children,
}: {
  label: string;
  error?: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="block text-sm font-medium text-ink mb-2">{label}</span>
      {children}
      {hint && !error && <span className="block text-xs text-muted mt-1">{hint}</span>}
      {error && <span className="block text-xs text-attention mt-1">{error}</span>}
    </label>
  );
}

export function TextInput({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cx(
        "w-full rounded-control bg-inset border border-hairline px-3 py-3 text-ink placeholder:text-muted focus:border-gold outline-none min-h-[44px]",
        className,
      )}
      {...props}
    />
  );
}

export function SelectInput({
  className,
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & { children: ReactNode }) {
  return (
    <select
      className={cx(
        "w-full rounded-control bg-inset border border-hairline px-3 py-3 text-ink focus:border-gold outline-none min-h-[44px]",
        className,
      )}
      {...props}
    >
      {children}
    </select>
  );
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
}: {
  options: { value: T; label: string; icon?: ReactNode }[];
  value: T;
  onChange: (v: T) => void;
  ariaLabel?: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className="inline-flex items-center gap-1 rounded-pill border border-hairline bg-raised p-1"
    >
      {options.map((o) => (
        <button
          key={o.value}
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cx(
            "inline-flex items-center gap-2 rounded-pill px-4 py-2 text-sm font-medium transition-colors min-h-[40px]",
            value === o.value ? "bg-inset text-ink" : "text-muted hover:text-ink",
          )}
        >
          {o.icon}
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** A bottom sheet on mobile / centered dialog on desktop. */
export function Sheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center sm:justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="relative w-full sm:max-w-md bg-raised border-t sm:border border-hairline sm:rounded-card rounded-t-card shadow-sheet max-h-[92vh] overflow-y-auto"
      >
        <div className="sticky top-0 bg-raised border-b border-hairline px-6 py-4 flex items-center justify-between">
          <h2 className="font-serif text-xl text-ink">{title}</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="text-muted hover:text-ink rounded-control p-2 -mr-2"
          >
            ✕
          </button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}

export function Pill({ children, tone = "muted" }: { children: ReactNode; tone?: "muted" | "positive" | "attention" | "gold" }) {
  const tones = {
    muted: "bg-inset text-muted",
    positive: "bg-positive/15 text-positive",
    attention: "bg-attention/15 text-attention",
    gold: "bg-gold/15 text-gold",
  };
  return (
    <span className={cx("inline-flex items-center rounded-pill px-2.5 py-1 text-xs font-medium", tones[tone])}>
      {children}
    </span>
  );
}
