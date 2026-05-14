import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

import { applyTheme, getStoredTheme, toggleTheme, type ThemeMode } from "../theme";

interface Props {
  variant?: "sidebar" | "icon";
  className?: string;
}

export function ThemeToggle({ variant = "sidebar", className }: Props) {
  const [theme, setTheme] = useState<ThemeMode>(() => getStoredTheme());

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  const isDark = theme === "dark";
  const label = isDark ? "Switch to light mode" : "Switch to dark mode";
  const icon = isDark ? <Sun size={16} strokeWidth={1.8} /> : <Moon size={16} strokeWidth={1.8} />;

  if (variant === "icon") {
    return (
      <button
        aria-label={label}
        className={`theme-icon-btn ${className ?? ""}`}
        onClick={() => setTheme((current) => toggleTheme(current))}
        title={label}
        type="button"
      >
        {icon}
      </button>
    );
  }

  return (
    <button
      aria-label={label}
      className={`sidebar-item ${className ?? ""}`}
      onClick={() => setTheme((current) => toggleTheme(current))}
      title={label}
      type="button"
      style={{ width: "100%" }}
    >
      <span className="sidebar-item-icon">{icon}</span>
      <span className="sidebar-item-label">{isDark ? "Light mode" : "Dark mode"}</span>
    </button>
  );
}
