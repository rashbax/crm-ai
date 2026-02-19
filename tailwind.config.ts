import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Primary colors (matching customer example)
        primary: {
          DEFAULT: "#005BFF",
          soft: "#E6F0FF",
          dark: "#0047CC",
        },
        // Background
        background: "#F5F7FA",
        // Card/Surface
        card: "#FFFFFF",
        // Text colors
        text: {
          main: "#111827",
          muted: "#6B7280",
          light: "#9CA3AF",
        },
        // Border
        border: {
          DEFAULT: "#E5E7EB",
          light: "#F3F4F6",
        },
        // Status colors
        danger: {
          DEFAULT: "#EF4444",
          light: "#FEE2E2",
        },
        success: {
          DEFAULT: "#10B981",
          light: "#D1FAE5",
        },
        warning: {
          DEFAULT: "#F59E0B",
          light: "#FEF3C7",
        },
        info: {
          DEFAULT: "#3B82F6",
          light: "#DBEAFE",
        },
      },
      boxShadow: {
        'card': '0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06)',
        'card-hover': '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
      },
      borderRadius: {
        'card': '8px',
      },
    },
  },
  plugins: [],
};
export default config;
