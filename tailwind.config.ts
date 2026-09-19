import type { Config } from "tailwindcss";

/**
 * Tailwind is driven entirely by the named design tokens (Section 4 of the spec).
 * Colors resolve to CSS variables defined in src/index.css, so both the dark
 * ("Midnight") and light cream ("Soft") themes come from one source of truth and
 * nothing is hard-coded outside the token set.
 */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: ["class", '[data-theme="midnight"]'],
  theme: {
    extend: {
      colors: {
        base: "rgb(var(--surface-base) / <alpha-value>)",
        raised: "rgb(var(--surface-raised) / <alpha-value>)",
        inset: "rgb(var(--surface-inset) / <alpha-value>)",
        ink: "rgb(var(--text-primary) / <alpha-value>)",
        muted: "rgb(var(--text-muted) / <alpha-value>)",
        gold: "rgb(var(--accent-gold) / <alpha-value>)",
        positive: "rgb(var(--positive) / <alpha-value>)",
        attention: "rgb(var(--attention) / <alpha-value>)",
        hairline: "rgb(var(--border-hairline) / <alpha-value>)",
        // The active wallpaper tint as a colour utility (§3): bg-wallpaper.
        wallpaper: "rgb(var(--wallpaper) / <alpha-value>)",
        // The hero surface (dark ink card) + its text.
        hero: "rgb(var(--hero) / <alpha-value>)",
        "hero-text": "rgb(var(--hero-text) / <alpha-value>)",
      },
      fontFamily: {
        // Editorial titles + the single hero number (§4). Playfair Display.
        display: ['"Playfair Display"', "Georgia", "serif"],
        // Amounts keep the tabular serif (Fraunces) so columns line up.
        serif: ["Fraunces", "Newsreader", "Georgia", "serif"],
        sans: ["Inter", "system-ui", "-apple-system", "Segoe UI", "sans-serif"],
      },
      spacing: {
        // Single spacing scale from the spec: 4, 8, 12, 16, 24, 32, 48
        "1": "4px",
        "2": "8px",
        "3": "12px",
        "4": "16px",
        "6": "24px",
        "8": "32px",
        "12": "48px",
      },
      borderRadius: {
        control: "8px",
        card: "16px", // §5: 12 -> 16 for a softer, more premium card
        xl: "20px",
        pill: "999px",
      },
      fontFeatureSettings: {
        tabular: '"tnum" 1, "cv01" 1',
      },
      boxShadow: {
        // §1 the two-part shadow: tight contact (anchors the edge) + wide ambient
        // (the lift). Driven by per-theme CSS tokens so Midnight lifts deeper.
        card: "var(--shadow)",
        lift: "var(--shadow-lift)",
        sheet: "0 -8px 40px rgb(0 0 0 / 0.24)",
      },
    },
  },
  plugins: [],
} satisfies Config;
