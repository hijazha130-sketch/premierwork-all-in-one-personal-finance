import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

/** "midnight" = deep-black dark theme; "soft" = light cream theme. */
export type ThemeName = "midnight" | "soft";

interface ThemeContextValue {
  theme: ThemeName;
  setTheme: (t: ThemeName) => void;
  toggle: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);
const STORAGE_KEY = "premierwork.theme";

function readStoredTheme(): ThemeName {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === "midnight" || v === "soft") return v;
  } catch {
    /* private mode / blocked storage — fall through to default */
  }
  return "midnight";
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeName>(readStoredTheme);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", theme === "midnight" ? "#1A1611" : "#F7EFE1");
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      /* ignore storage failures */
    }
  }, [theme]);

  const setTheme = (t: ThemeName) => setThemeState(t);
  const toggle = () => setThemeState((t) => (t === "midnight" ? "soft" : "midnight"));

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggle }}>{children}</ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
