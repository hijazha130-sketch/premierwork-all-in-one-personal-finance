/// <reference types="vitest/config" />
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import path from "node:path";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.svg"],
      manifest: {
        name: "All-in-One Personal Finance by PremierWork",
        short_name: "PremierWork",
        description: "Your money, in one calm place. Works offline, on your device.",
        theme_color: "#0E0E0F",
        background_color: "#0E0E0F",
        display: "standalone",
        orientation: "portrait",
        start_url: "/",
        icons: [
          { src: "icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
    }),
  ],
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
  test: {
    globals: true,
    environment: "node",
    setupFiles: [],
    // Only this project's own tests. The `premierwork-all-in-one-personal-finance/`
    // entry excludes an accidental nested copy of the repo so its stale test
    // files are never collected.
    include: ["tests/**/*.test.ts"],
    exclude: ["**/node_modules/**", "**/dist/**", "premierwork-all-in-one-personal-finance/**"],
  },
});
