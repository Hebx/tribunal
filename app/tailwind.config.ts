import type { Config } from "tailwindcss";

// Tribunal Arena design tokens — "The Colosseum HUD".
// Brand source: the glowing scales-of-justice mark on deep navy. Bright justice
// blue is reserved for focal/interactive elements; steel handles structure.
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        // Backgrounds — darkest (page corners) to lit (center glow / hover)
        base: "#080B14",
        ink: "#0A0E1A",
        elevated: "#121A2E",
        surface: "#18233D",
        tint: "#22314F",
        // Justice blue — the glowing scale
        justice: {
          light: "#8BC2FF",
          DEFAULT: "#4A90E2",
          deep: "#3B82F6",
        },
        // Structural framing
        steel: "#33476B",
        "steel-dim": "#243450",
        // Verdict / combat states
        verdict: {
          true: "#34D399",
          false: "#F43F5E",
        },
        gold: "#E8B04B", // arena/champion accent
        text: {
          DEFAULT: "#EAF0F9",
          muted: "#A4B2CC",
          faint: "#7385A1",
        },
      },
      fontFamily: {
        // Display: characterful variable serif for verdicts/rulings (gravitas)
        display: ["var(--font-fraunces)", "Georgia", "serif"],
        // UI: sharp grotesque
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        // Hashes, addresses, tx digests
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
      boxShadow: {
        glow: "0 0 18px rgba(74, 144, 226, 0.35)",
        "glow-lg": "0 0 40px rgba(74, 144, 226, 0.28)",
        "glow-true": "0 0 22px rgba(52, 211, 153, 0.35)",
        "glow-false": "0 0 22px rgba(244, 63, 94, 0.35)",
      },
      backgroundImage: {
        "arena-radial":
          "radial-gradient(120% 80% at 50% 0%, #1A2742 0%, #0A0E1A 55%, #080B14 100%)",
        "justice-gradient": "linear-gradient(180deg, #8BC2FF 0%, #3B82F6 100%)",
      },
      keyframes: {
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(12px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "scale-pulse": {
          "0%, 100%": { transform: "rotate(-1.5deg)" },
          "50%": { transform: "rotate(1.5deg)" },
        },
        "pulse-dot": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.35" },
        },
        deliberate: {
          "0%": { transform: "translateX(-100%)" },
          "100%": { transform: "translateX(100%)" },
        },
      },
      animation: {
        "fade-up": "fade-up 0.5s cubic-bezier(0.16, 1, 0.3, 1) both",
        "scale-pulse": "scale-pulse 4s ease-in-out infinite",
        "pulse-dot": "pulse-dot 1.6s ease-in-out infinite",
        deliberate: "deliberate 1.4s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
