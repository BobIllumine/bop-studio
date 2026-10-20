import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// In development, /api is proxied to a local bop-server (BOP_API_URL overrides it).
const api = process.env.BOP_API_URL ?? "http://localhost:8080";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api": { target: api, changeOrigin: true },
      "/healthz": { target: api, changeOrigin: true },
    },
  },
  build: {
    chunkSizeWarningLimit: 1600,
  },
  test: {
    environment: "node",
  },
});
