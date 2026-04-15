export const themeConfig = {
  colors: {
    primary: {
      DEFAULT: "#7c5dfa",
      hover: "#9277ff",
      foreground: "#ffffff",
    },
    background: {
      dark: "#1e1b29",
      light: "#f8f8fb",
      card: {
        dark: "#252136",
        light: "#ffffff",
      }
    },
    text: {
      primary: {
        dark: "#ffffff",
        light: "#0c0e1e",
      },
      secondary: {
        dark: "#dfe3fa",
        light: "#7e88c3",
      }
    }
  },
  typography: {
    fontFamily: "Inter, system-ui, sans-serif",
  }
};

export type ThemeConfig = typeof themeConfig;
