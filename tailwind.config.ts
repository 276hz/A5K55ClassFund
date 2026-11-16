import type { Config } from "tailwindcss";
export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: { extend: { colors: { ink: "#0f172a", brand: { DEFAULT: "#0f766e", dark: "#115e59", soft: "#ccfbf1" } } } },
  plugins: [],
} satisfies Config;
