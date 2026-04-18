import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { themeConfig } from "@/shared/config/theme";

type Theme = "light" | "dark" | "system";

interface ThemeProviderProps {
  children: ReactNode;
  defaultTheme?: Theme;
  storageKey?: string;
}

interface ThemeProviderState {
  theme: Theme;
  setTheme: (theme: Theme) => void;
}

const initialState: ThemeProviderState = {
  theme: "dark",
  setTheme: () => null,
};

const ThemeProviderContext = createContext<ThemeProviderState>(initialState);

export function ThemeProvider({
  children,
  defaultTheme = "dark",
  storageKey = "chatapp-theme",
  ...props
}: ThemeProviderProps) {
  const [theme, setTheme] = useState<Theme>(
    () => (localStorage.getItem(storageKey) as Theme) || defaultTheme
  );

  useEffect(() => {
    const root = window.document.documentElement;

    root.classList.remove("light", "dark");

    let activeTheme = theme;
    if (theme === "system") {
      activeTheme = window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light";
    }

    root.classList.add(activeTheme);

    // Dynamic injection from themeConfig
    const c = themeConfig.colors;
    const t = activeTheme as "light" | "dark";
    
    root.style.setProperty("--background", c.background[t]);
    root.style.setProperty("--foreground", c.text.main[t]);
    root.style.setProperty("--muted", c.background.subtle[t]);
    root.style.setProperty("--muted-foreground", c.text.muted[t]);
    root.style.setProperty("--card", c.card[t]);
    root.style.setProperty("--card-foreground", c.text.main[t]);
    root.style.setProperty("--border", c.card.border[t]);
    root.style.setProperty("--input", c.input.bg[t]);
    root.style.setProperty("--primary", c.primary[t]);
    root.style.setProperty("--primary-foreground", c.primary.foreground[t]);
    root.style.setProperty("--accent", c.text.accent[t]);
    root.style.setProperty("--accent-foreground", c.primary.foreground[t]); // Fallback mapping

  }, [theme]);

  const value = {
    theme,
    setTheme: (theme: Theme) => {
      localStorage.setItem(storageKey, theme);
      setTheme(theme);
    },
  };

  return (
    <ThemeProviderContext.Provider {...props} value={value}>
      {children}
    </ThemeProviderContext.Provider>
  );
}

export const useTheme = () => {
  const context = useContext(ThemeProviderContext);

  if (context === undefined)
    throw new Error("useTheme must be used within a ThemeProvider");

  return context;
}
