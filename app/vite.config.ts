// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { VitePWA } from "vite-plugin-pwa";
import type { Plugin } from "vite";
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

function generateAppShell(): Plugin {
  return {
    name: "generate-app-shell",
    apply: (_config: unknown, env: { isSsrBuild?: boolean }) => !env.isSsrBuild,
    enforce: "pre",
    generateBundle(_options, bundle) {
      // Find the main entry chunk and CSS from the client bundle
      let mainJs = "";
      const cssFiles: string[] = [];
      for (const [fileName, chunk] of Object.entries(bundle)) {
        if (chunk.type === "chunk") {
          if (chunk.isEntry) {
            const basename = fileName.split('/').pop() || "";
            if (basename.startsWith("client-") || basename.startsWith("index-") || basename.startsWith("_client-")) {
              mainJs = fileName;
            }
          }
        } else if (chunk.type === "asset" && fileName.endsWith(".css")) {
          cssFiles.push(fileName);
        }
      }
      const jsTags = mainJs ? `<script type="module" src="/${mainJs}" crossorigin></script>` : "";
      const cssTags = cssFiles.map((f) => `<link rel="stylesheet" href="/${f}" />`).join("\n    ");
      const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, maximum-scale=1" />
  <meta name="theme-color" content="#064e3b" />
  <title>Suffa MS</title>
  ${cssTags}
</head>
<body>
  <!-- Inject empty __TSR__ state to prevent TanStack Start client from throwing Invariant failed on offline boot -->
  <script>window.__TSR__ = { matches: [], streamedValues: {} };</script>
  ${jsTags}
</body>
</html>`;
      this.emitFile({ type: "asset", fileName: "offline.html", source: html });
      console.log("Generated app shell offline.html");
    },
  };
}

// vite-plugin-pwa generates the service worker on every build pass. TanStack
// Start runs both a client build and an SSR build, so the SW is written twice
// and the second pass can truncate it, leaving the Nitro asset manifest with a
// stale (smaller) size that makes the server serve a truncated file. Restrict
// SW generation to the client build only.
function clientOnlyPWA(options: Parameters<typeof VitePWA>[0]): Plugin[] {
  const plugins = VitePWA(options);
  return plugins.map((plugin) => {
    if (plugin.name === "vite-plugin-pwa:build") {
      return {
        ...plugin,
        apply: (_config: unknown, env: { isSsrBuild?: boolean }) => !env.isSsrBuild,
      };
    }
    return plugin;
  });
}

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
    build: {
      // No custom rollupOptions.output naming — let Vite/rolldown use defaults.
      // A previous `-rc1` suffix caused the SSR build to emit chunk pairs like
      // server-HASH-rc1.mjs / server-HASH-rc12.mjs with a circular import that
      // crashes at runtime (`__exportAll is not a function`).
    },
    plugins: [
      generateAppShell(),
      clientOnlyPWA({
        strategies: "generateSW",
        registerType: "autoUpdate",
        injectRegister: null,
        filename: "sw-v4.js",
        devOptions: { enabled: false },
        manifest: false,
        outDir: ".output/public",
        workbox: {
          cleanupOutdatedCaches: true,
          clientsClaim: true,
          skipWaiting: true,
          globDirectory: ".output/public",
          globPatterns: ["**/*.{js,css,html,woff2,png,svg,ico,webmanifest}"],
          navigateFallback: "/offline.html",
          navigateFallbackDenylist: [/^\/~oauth/, /^\/api\//],
          runtimeCaching: [
            {
              urlPattern: ({ request }) =>
                ["style", "script", "worker", "font", "image"].includes(request.destination),
              handler: "CacheFirst",
              options: {
                cacheName: "suffa-assets",
                expiration: { maxEntries: 120, maxAgeSeconds: 60 * 60 * 24 * 30 },
              },
            },
            {
              urlPattern: /\/api\/v1\//,
              handler: "StaleWhileRevalidate",
              options: {
                cacheName: "suffa-api-cache",
                expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 7 },
                cacheableResponse: { statuses: [0, 200] },
              },
            },
          ],
        },
      }),
    ],
  },
});
