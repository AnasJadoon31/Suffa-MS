import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["apple-touch-icon.png"],
      manifest: {
        name: "Madrasa Management System",
        short_name: "MMS",
        description:
          "Mobile-first madrasa operations for attendance, academics, resources, finance, and parent communication.",
        start_url: "/",
        scope: "/",
        display: "standalone",
        orientation: "portrait-primary",
        background_color: "#f2f4ef",
        theme_color: "#0f766e",
        categories: ["education", "productivity", "utilities"],
        icons: [
          {
            src: "/pwa-192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "/pwa-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any maskable",
          },
          {
            src: "/pwa-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
        screenshots: [
          {
            src: "/screenshots/mobile.png",
            sizes: "390x844",
            type: "image/png",
            form_factor: "narrow",
            label: "Mobile dashboard",
          },
          {
            src: "/screenshots/desktop.png",
            sizes: "1440x900",
            type: "image/png",
            form_factor: "wide",
            label: "Desktop dashboard",
          },
        ],
        shortcuts: [
          {
            name: "Dashboard",
            short_name: "Dashboard",
            description: "Open today's madrasa summary",
            url: "/dashboard",
            icons: [{ src: "/pwa-192.png", sizes: "192x192", type: "image/png" }],
          },
          {
            name: "Attendance",
            short_name: "Attendance",
            description: "Open attendance",
            url: "/attendance",
            icons: [{ src: "/pwa-192.png", sizes: "192x192", type: "image/png" }],
          },
          {
            name: "Resources",
            short_name: "Resources",
            description: "Open shared resources",
            url: "/resources",
            icons: [{ src: "/pwa-192.png", sizes: "192x192", type: "image/png" }],
          },
        ],
      },
      workbox: {
        navigateFallbackDenylist: [/^\/api\//],
      },
    }),
  ],
  resolve: {
    dedupe: ["react", "react-dom", "react-i18next", "@mui/material", "@emotion/react", "@emotion/styled"],
  },
  optimizeDeps: {
    include: ["react", "react-dom", "react-dom/client", "react/jsx-runtime", "react-i18next", "@mui/material"],
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return undefined;
          if (id.includes("@mui") || id.includes("@emotion")) return "vendor-mui";
          if (id.includes("react") || id.includes("@tanstack/react-query") || id.includes("i18next"))
            return "vendor-react";
          if (id.includes("lucide-react")) return "vendor-icons";
          if (id.includes("axios") || id.includes("dexie")) return "vendor-data";
          if (id.includes("workbox") || id.includes("vite-plugin-pwa")) return "vendor-pwa";
          return "vendor-core";
        },
      },
    },
  },
});
