export type ThemeMode = "dark" | "light";

const THEME_KEY = "kp-theme";

export function getStoredTheme(): ThemeMode {
  const stored = window.localStorage.getItem(THEME_KEY);
  if (stored === "light" || stored === "dark") return stored;
  if (typeof window !== "undefined" && window.matchMedia) {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  return "light";
}

export function applyTheme(theme: ThemeMode): void {
  document.documentElement.setAttribute("data-theme", theme);
  window.localStorage.setItem(THEME_KEY, theme);
}

export function toggleTheme(theme: ThemeMode): ThemeMode {
  const next = theme === "dark" ? "light" : "dark";
  applyTheme(next);
  return next;
}
