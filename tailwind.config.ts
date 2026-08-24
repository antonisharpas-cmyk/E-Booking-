import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        /* Brand palette sampled directly from the APEX pilates logo */
        mocha: {
          50: "#F7F3F1",
          100: "#EDE6E3",
          200: "#DACECA",
          300: "#C0AFAA",
          400: "#9C8681",
          500: "#7C6360",
          600: "#5B4645", // primary brand brown
          700: "#4B3A39",
          800: "#3A2D2C",
          900: "#2A2020",
          950: "#1A1414",
        },
        /* sampled from the studio's own product renders */
        cream: {
          DEFAULT: "#FAF6F3",
          50: "#FEFCFB",
          100: "#FAF6F3",
          200: "#F3ECE6",
          300: "#E9DED6",
        },
        /* the reformer's upholstery */
        taupe: "#746457",
        /* its brushed metal and pale ash frame */
        stone: "#9E968B",
        sand: "#C2B9AA",
        clay: "#A08D85",
        gold: "#C9A227",
      },
      fontFamily: {
        sans: ["var(--font-jost)", "ui-sans-serif", "system-ui", "sans-serif"],
        display: ["var(--font-cormorant)", "Georgia", "serif"],
        /* the hero headline, set to echo the wordmark's flared letterforms */
        wordmark: ["var(--font-wordmark)", "var(--font-jost)", "serif"],
      },
      letterSpacing: {
        widest: "0.22em",
        brand: "0.32em",
      },
      borderRadius: {
        "4xl": "2rem",
      },
      boxShadow: {
        soft: "0 20px 60px -30px rgba(91,70,69,0.35)",
        lift: "0 30px 80px -40px rgba(91,70,69,0.55)",
      },
      transitionTimingFunction: {
        silk: "cubic-bezier(0.16, 1, 0.3, 1)",
      },
      keyframes: {
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(18px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "fade-in": {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        breathe: {
          "0%, 100%": { transform: "scale(1)", opacity: "0.5" },
          "50%": { transform: "scale(1.06)", opacity: "0.8" },
        },
        marquee: {
          "0%": { transform: "translateX(0)" },
          "100%": { transform: "translateX(-50%)" },
        },
      },
      animation: {
        "fade-up": "fade-up 0.9s cubic-bezier(0.16,1,0.3,1) both",
        "fade-in": "fade-in 1.2s ease both",
        breathe: "breathe 9s ease-in-out infinite",
        marquee: "marquee 38s linear infinite",
      },
    },
  },
  plugins: [],
};

export default config;
