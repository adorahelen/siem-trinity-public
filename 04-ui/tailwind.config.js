/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        base: "rgb(var(--bg-base) / <alpha-value>)",
        surface: "rgb(var(--bg-surface) / <alpha-value>)",
        elevated: "rgb(var(--bg-elevated) / <alpha-value>)",
        subtle: "rgb(var(--border-subtle) / <alpha-value>)",
        "text-primary": "rgb(var(--text-primary) / <alpha-value>)",
        "text-secondary": "rgb(var(--text-secondary) / <alpha-value>)",
        info: "rgb(var(--accent-info) / <alpha-value>)",
        ok: "rgb(var(--accent-ok) / <alpha-value>)",
        warn: "rgb(var(--accent-warn) / <alpha-value>)",
        crit: "rgb(var(--accent-crit) / <alpha-value>)",
        brand: "rgb(var(--accent-brand) / <alpha-value>)",
        sev0: "rgb(var(--sev-0) / <alpha-value>)",
        sev1: "rgb(var(--sev-1) / <alpha-value>)",
        sev2: "rgb(var(--sev-2) / <alpha-value>)",
        sev3: "rgb(var(--sev-3) / <alpha-value>)",
        sev4: "rgb(var(--sev-4) / <alpha-value>)",
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "Fira Code", "monospace"],
      },
      borderRadius: {
        card: "12px",
      },
    },
  },
  plugins: [],
};
