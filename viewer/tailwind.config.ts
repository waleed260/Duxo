import type { Config } from "tailwindcss";

/**
 * Duxo design tokens — §9.2.
 *
 * Source of truth for the design system. These exact values are referenced in
 * the quality-gate checks (§9.3b #4 contrast, §9.8 token-lint). The muted-text
 * token is #999999 (7.4:1), corrected from the AnyDesk-inspired #747474 which
 * measured 4.49:1 and failed WCAG AA.
 *
 * No drop shadows / glows / gradients as decoration (§9.2) — elevation is
 * communicated by surface-base → surface-raised → surface-overlay progression.
 */
const config: Config = {
  darkMode: "class",
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      screens: {
        xs: "480px",
      },
      colors: {
        // §9.2 — Surface progression (replaces shadows).
        surface: {
          base: "#0a0a0a",     // app background
          raised: "#141414",   // cards, dashboard action cards
          overlay: "#1c1c1c",  // modals, panels, inputs (raised surface)
        },
        border: {
          DEFAULT: "hsl(var(--border))",
          default: "#333333",
          strong: "#555555",
        },
        text: {
          primary: "#ffffff",    // 21:1 on black — passes AAA
          secondary: "#999999",  // 7.4:1 — corrected from #747474 (failed AA)
          accent: "#ef443b",     // 5.6:1 — AA for large text/icons
        },
        // Semantic aliases (kept thin — components use tokens, not raw hex §9.8).
        // §9.3b #4 — accent #ef443b is 5.6:1 on black (AA for large text/icons only).
        // For body text at 15px, use text-primary or a darker accent variant.
        accent: {
          DEFAULT: "#ef443b",   // large text/icons only (5.6:1 on black)
          hover: "#f25850",    // +6% lightened (§9.4 Button hover state)
          active: "#d63d34",   // -6% darkened (§9.4 Button active state)

        },
        danger: "#ef443b",
        success: "#22c55e",   // paired with text/icon, never color-only (§9.3b #7)

        // shadcn/ui compatibility — map CSS variables to Tailwind classes.
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        chart: {
          1: "hsl(var(--chart-1))",
          2: "hsl(var(--chart-2))",
          3: "hsl(var(--chart-3))",
          4: "hsl(var(--chart-4))",
          5: "hsl(var(--chart-5))",
        },
      },
      fontFamily: {
        // §9.2 — Noto Sans with safe system fallbacks.
        sans: ["Noto Sans", "Calibri", "Arial", "sans-serif"],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      fontSize: {
        // §9.2 explicit scale.
        xs: "11px",
        sm: "13px",
        md: "15px",
        lg: "17px",
        xl: "20px",
        "2xl": "26px",
        "3xl": "34px",
        "4xl": "44px",
      },
      fontWeight: {
        base: "400",
        emphasis: "600",
      },
      spacing: {
        // §9.2 explicit scale — components MUST use these, not one-offs (§9.8).
        1: "4px",
        2: "8px",
        3: "12px",
        4: "16px",
        5: "20px",
        6: "24px",
        7: "32px",
        8: "48px",
      },
      borderRadius: {
        sm: "6px",
        md: "10px",
        pill: "999px",
      },
      transitionDuration: {
        // §9.2 motion durations.
        instant: "100ms",   // hover states
        fast: "200ms",      // modal open/close, toasts
        normal: "350ms",    // page transitions
      },
      boxShadow: {
        // Intentionally near-empty — §9.2 prohibits decorative shadows.
        none: "none",
      },
    },
  },
  plugins: [
    require("tailwindcss-animate"),
  ],
};

export default config;
