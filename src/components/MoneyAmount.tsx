import { formatMoney } from "@/lib/money";
import { useCurrency } from "@/state/dataContext";
import type { Minor } from "@/domain/types";

/** The single React surface for rendering a money value. */
export function MoneyAmount({
  amount,
  className,
  signed = false,
  tone,
  size = "md",
}: {
  amount: Minor;
  className?: string;
  signed?: boolean;
  tone?: "default" | "positive" | "attention" | "muted";
  size?: "sm" | "md" | "lg" | "hero";
}) {
  const { symbol, locale } = useCurrency();
  const text = formatMoney(amount, { symbol, locale, signed });

  const sizes = {
    sm: "text-base",
    md: "text-xl",
    lg: "text-3xl",
    hero: "text-5xl md:text-6xl",
  };
  const tones = {
    default: "text-ink",
    positive: "text-positive",
    attention: "text-attention",
    muted: "text-muted",
  };
  return (
    <span className={`font-amount ${sizes[size]} ${tones[tone ?? "default"]} ${className ?? ""}`}>
      {text}
    </span>
  );
}
