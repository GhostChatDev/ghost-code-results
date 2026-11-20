import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#1f2933",
        calm: { 50: "#f4f7f6", 100: "#e3ece9", 500: "#3f7d6e", 600: "#2f6a5c", 700: "#25554a" },
      },
    },
  },
  plugins: [],
};
export default config;
