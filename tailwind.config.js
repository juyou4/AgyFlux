import containerQueries from "@tailwindcss/container-queries";

/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        canvas: "var(--bg-page)",
        card: "var(--bg-card)",
        surface: "var(--surface)",
        ink: "var(--ink)",
        "ink-secondary": "var(--ink-secondary)",
        "ink-muted": "var(--ink-muted)",
        hairline: "var(--border-hairline)",
        accent: "var(--accent)",
      },
      fontFamily: {
        sans: [
          "Geist",
          "SF Pro Text",
          "SF Pro Display",
          "-apple-system",
          "BlinkMacSystemFont",
          "PingFang SC",
          "Microsoft YaHei UI",
          "Segoe UI",
          "sans-serif",
        ],
        mono: [
          "Geist Mono",
          "SF Mono",
          "JetBrains Mono",
          "Cascadia Mono",
          "Consolas",
          "monospace",
        ],
      },
    },
  },
  plugins: [containerQueries],
};
