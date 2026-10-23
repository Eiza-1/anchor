/// <reference types="vitest" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { version } from "./package.json";

export default defineConfig({
  plugins: [react()],
  define: { __APP_VERSION__: JSON.stringify(version) },
  base: "./",
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  build: { outDir: "dist" },
  server: { port: 5173, strictPort: true },
  test: { include: ["tests/**/*.test.ts"] },
});
