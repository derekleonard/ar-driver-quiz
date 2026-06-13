/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  base: "/ar-driver-quiz/",
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      injectRegister: "auto",
      // public/manifest.webmanifest is hand-maintained and already linked
      manifest: false,
      workbox: {
        // Precache the whole app shell: bundled JS (which embeds the
        // question bank), CSS, the sign SVGs, and the manifest — the
        // installed app must work fully offline.
        globPatterns: ["**/*.{js,css,html,svg,webmanifest}"],
      },
    }),
  ],
  test: {
    environment: "node",
    include: ["tests/**/*.test.{ts,tsx}"],
  },
});
