import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        bg: {
          base:        "var(--bg-base)",
          surface:     "var(--bg-surface)",
          "surface-2": "var(--bg-surface-2)",
          "surface-3": "var(--bg-surface-3)",
        },
        border: {
          subtle:  "var(--border-subtle)",
          DEFAULT: "var(--border-default)",
          strong:  "var(--border-strong)",
        },
        text: {
          primary:   "var(--text-primary)",
          secondary: "var(--text-secondary)",
          tertiary:  "var(--text-tertiary)",
          disabled:  "var(--text-disabled)",
        },
        accent: {
          DEFAULT: "var(--accent)",
          hover:   "var(--accent-hover)",
          bg:      "var(--accent-bg)",
          border:  "var(--accent-border)",
        },
        positive:      "var(--positive)",
        "positive-bg": "var(--positive-bg)",
        negative:      "var(--negative)",
        "negative-bg": "var(--negative-bg)",
        warning:       "var(--warning)",
        critical:      "var(--critical)",
      },
      fontFamily: {
        sans: ["var(--font-geist-sans)", "Inter", "system-ui", "sans-serif"],
        mono: ["var(--font-geist-mono)", "ui-monospace", "monospace"],
      },
    },
  },
  plugins: [],
};

export default config;
