/**
 * Wallpaper tints (Design System §3). A soft colour that sits behind everything,
 * chosen by the user, different per theme. Stored as a token, never inline hex.
 *
 * Values are RGB triplets (to match the token system) so the active tint applies
 * as `--wallpaper: <triplet>` and the canvas reads `rgb(var(--wallpaper))`.
 * "None" carries no colour — the token falls back to `--surface-base` (today's
 * look), so "None" is the non-destructive default.
 */
import type { WallpaperId } from "@/domain/types";

export interface Wallpaper {
  id: WallpaperId;
  label: string;
  soft: string | null; // RGB triplet for the Soft (light) theme; null = None
  dark: string | null; // RGB triplet for the Midnight (dark) theme; null = None
}

/** Soft values stay light & muted so cream + gold still dominate; dark values stay deep. */
export const WALLPAPERS: Wallpaper[] = [
  { id: "none", label: "None", soft: null, dark: null },
  { id: "sage", label: "Sage", soft: "232 237 227", dark: "22 26 21" },
  { id: "dustyRose", label: "Dusty Rose", soft: "240 230 228", dark: "27 21 19" },
  { id: "lavender", label: "Lavender", soft: "234 230 240", dark: "22 20 27" },
  { id: "sky", label: "Sky", soft: "228 234 240", dark: "18 22 27" },
  { id: "sand", label: "Sand", soft: "241 234 219", dark: "24 21 16" },
  { id: "pearl", label: "Pearl", soft: "244 241 236", dark: "20 19 18" },
  { id: "deepInk", label: "Deep Ink", soft: "236 234 228", dark: "11 11 12" },
  { id: "charcoal", label: "Charcoal", soft: "233 231 227", dark: "17 17 18" },
];

/**
 * Apply the chosen tint for the active theme to the `--wallpaper` token. "None"
 * (or an unknown id) removes the override, so the canvas falls back to the base
 * surface. Called on every theme OR wallpaper change.
 */
export function applyWallpaper(wallpaperId: WallpaperId | undefined, theme: "soft" | "midnight"): void {
  const root = document.documentElement;
  const wp = WALLPAPERS.find((w) => w.id === wallpaperId) ?? WALLPAPERS[0];
  const triplet = theme === "midnight" ? wp.dark : wp.soft;
  if (triplet) root.style.setProperty("--wallpaper", triplet);
  else root.style.removeProperty("--wallpaper"); // None -> falls back to --surface-base
}
