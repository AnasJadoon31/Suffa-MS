import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate", // fixes the stale-bundle problem the old manual SW had
      manifest: {
        name: "Madrasa Management System",
        short_name: "MMS",
        start_url: "/",
        display: "standalone",
        background_color: "#f7f7f2",
        theme_color: "#0f766e",
        icons: [
          { src: "/pwa-192.png", sizes: "192x192", type: "image/png" },
          { src: "/pwa-512.png", sizes: "512x512", type: "image/png", purpose: "any maskable" },
        ],
      },
      workbox: {
        // App shell only. API responses must never enter Cache Storage because
        // its cache key does not include the authenticated account. Selected
        // offline reads use the account-scoped IndexedDB cache instead.
        navigateFallbackDenylist: [/^\/api\//],
      },
    }),
  ],
});
