// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  nitro: {
    preset: "node-server",
  },
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  vite: {
    plugins: [
      VitePWA({
        strategies: "generateSW",
        registerType: "autoUpdate",
        injectRegister: null,
        filename: "sw.js",
        devOptions: { enabled: false },
        manifest: false,
        outDir: ".output/public",
        workbox: {
          globDirectory: ".output/public",
          globPatterns: ["**/*.{js,css,woff2,png,svg,ico,webmanifest}"],
          navigateFallback: null,
          navigateFallbackDenylist: [/^\/~oauth/, /^\/api\//],
          runtimeCaching: [
            {
              urlPattern: ({ request, sameOrigin }) => sameOrigin && request.mode === "navigate",
              handler: "NetworkFirst",
              options: { cacheName: "suffa-pages", networkTimeoutSeconds: 5 },
            },
            {
              urlPattern: ({ request, sameOrigin }) =>
                sameOrigin &&
                ["style", "script", "worker", "font", "image"].includes(request.destination),
              handler: "CacheFirst",
              options: {
                cacheName: "suffa-assets",
                expiration: { maxEntries: 120, maxAgeSeconds: 60 * 60 * 24 * 30 },
              },
            },
            {
              urlPattern: ({ url, sameOrigin }) =>
                sameOrigin && url.pathname.startsWith("/api/v1/attendance/classes"),
              handler: "NetworkFirst",
              options: {
                cacheName: "suffa-roster-cache",
                networkTimeoutSeconds: 5,
                expiration: { maxEntries: 50, maxAgeSeconds: 60 * 60 * 24 },
              },
            },
            {
              urlPattern: ({ url, sameOrigin }) =>
                sameOrigin && url.pathname.startsWith("/api/v1/operations/timetable"),
              handler: "NetworkFirst",
              options: {
                cacheName: "suffa-timetable-cache",
                networkTimeoutSeconds: 5,
                expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 },
              },
            },
          ],
        },
      }),
    ],
  },
});
