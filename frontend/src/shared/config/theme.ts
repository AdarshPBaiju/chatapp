export const themeConfig = {
  colors: {
    primary: {
      light: "#0f172a", // Slate-900
      dark: "#10b981",  // Emerald-500
      foreground: {
        light: "#ffffff",
        dark: "#020617",
      }
    },
    background: {
      light: "#ffffff",
      dark: "#020617", // Near black slate
      subtle: {
        light: "#f8fafc", // Slate-50
        dark: "#0f172a",  // Slate-900
      }
    },
    card: {
      light: "#ffffff",
      dark: "#0f172a",
      border: {
        light: "#f1f5f9", // Slate-100
        dark: "#1e293b",  // Slate-800
      }
    },
    text: {
      main: {
        light: "#020617", // Slate-950
        dark: "#f8fafc",  // Slate-50
      },
      muted: {
        light: "#64748b", // Slate-500
        dark: "#94a3b8",  // Slate-400
      },
      accent: {
        light: "#0f172a",
        dark: "#10b981",
      }
    },
    input: {
      bg: {
        light: "#ffffff",
        dark: "#0f172a",
      },
      border: {
        light: "#f1f5f9",
        dark: "#1e293b",
      }
    }
  },
  typography: {
    fontFamily: '"Outfit", "Inter", system-ui, sans-serif',
  }
};

export type ThemeConfig = typeof themeConfig;
