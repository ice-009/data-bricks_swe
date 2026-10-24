import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// In dev, /api is proxied to the FastAPI server so the app always calls same-origin URLs.
export default defineConfig({
  plugins: [react()],
  build: {
    // Charting libs change rarely; a separate chunk keeps them cached across app deploys.
    rollupOptions: { output: { manualChunks: { charts: ["recharts"] } } },
    chunkSizeWarningLimit: 600,
  },
  server: {
    port: 5173,
    proxy: { "/api": process.env.API_PROXY_TARGET ?? "http://localhost:8000" },
  },
});
