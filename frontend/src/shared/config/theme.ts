export const themeConfig = {
  colors: {
    primary: {
      light: "#4a85b0",   // Ice 600 — clear, confident, not cold
      dark: "#7aaed4",    // Ice 400 — softer glow on dark
      foreground: {
        light: "#ffffff",
        dark: "#0d1520",
      },
    },
    background: {
      light: "#f0f5fb",   // Ice 50 — barely-there blue tint
      dark: "#0d1520",    // Deep slate-navy
      subtle: {
        light: "#f6f8fa", // Silver 50
        dark: "#141d2b",  // Lifted navy surface
      },
    },
    card: {
      light: "#ffffff",
      dark: "#141d2b",    // Distinct from background
      border: {
        light: "#d0d5db", // Silver 200
        dark: "#1e2d3f",  // Barely visible on dark
      },
    },
    text: {
      main: {
        light: "#111827", // Near-black with warmth
        dark: "#e8edf4",  // Cool off-white, not stark
      },
      muted: {
        light: "#8b95a1", // Silver 400
        dark: "#5a6878",  // Silver mid-dark
      },
      accent: {
        light: "#4a85b0", // Ice 600
        dark: "#7aaed4",  // Ice 400
      },
    },
    bubble: {
      outgoing: {
        bg: { light: "#4a85b0", dark: "#2e5a7e" },
        text: { light: "#ffffff", dark: "#e8edf4" },
      },
      incoming: {
        bg: { light: "#ffffff", dark: "#1a2535" },
        text: { light: "#111827", dark: "#e8edf4" },
        border: { light: "#d0d5db", dark: "#1e2d3f" },
      },
    },
    input: {
      bg: {
        light: "#f6f8fa",
        dark: "#0d1520",
      },
      border: {
        light: "#d0d5db",
        dark: "#1e2d3f",
      },
    },
    status: {
      online: "#7aaed4",  // Ice 400 — calm, not alarming green
      away: "#b8d1eb",    // Ice 200
    },
  },
  typography: {
    fontFamily: '"Inter", "Outfit", system-ui, sans-serif',
  },
};

export type ThemeConfig = typeof themeConfig;