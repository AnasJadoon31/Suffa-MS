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
    apply: "build",
    enforce: "pre",
    generateBundle(_options, bundle) {
      // Find the main entry chunk and CSS from the client bundle
      let mainJs = "";
      const cssFiles: string[] = [];
      for (const [fileName, chunk] of Object.entries(bundle)) {
        if (chunk.type === "chunk") {
          if (chunk.isEntry && fileName.startsWith("index-")) {
            mainJs = fileName;
          }
        } else if (chunk.type === "asset" && fileName.endsWith(".css")) {
          cssFiles.push(fileName);
        }
      }
      const jsTags = mainJs ? `<script type="module" src="/${mainJs}?v=2" crossorigin></script>` : "";
      const cssTags = cssFiles.map((f) => `<link rel="stylesheet" href="/${f}" />`).join("\n    ");
      const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="theme-color" content="#064e3b" />
  <title>Suffa MS</title>
  ${cssTags}
</head>
<body>
  <div id="app"></div>
  ${jsTags}
</body>
</html>`;
      this.emitFile({ type: "asset", fileName: "index.html", source: html });
      console.log("Generated app shell index.html");
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
      rollupOptions: {
        output: {
          // Force new filenames (rc1) so Cloudflare treats them as new
          // resources — the CDN cached the old build's assets truncated to
          // 6024 bytes (stale Nitro manifest) with immutable 1-year TTL.
          entryFileNames: `assets/[name]-[hash]-rc1.js`,
          chunkFileNames: `assets/[name]-[hash]-rc1.js`,
          assetFileNames: `assets/[name]-[hash]-rc1.[ext]`,
        },
      },
    },
    plugins: [
        clientOnlyPWA({
        strategies: "generateSW",
        registerType: "autoUpdate",
        injectRegister: null,
        filename: "sw-v3.js",
        devOptions: { enabled: false },
        manifest: false,
        outDir: ".output/public",
        workbox: {
          globDirectory: ".output/public",
          globPatterns: ["**/*.{js,css,html,woff2,png,svg,ico,webmanifest}"],
          navigateFallback: "/index.html",
          navigateFallbackDenylist: [/^\/~oauth/, /^\/api\//],
          runtimeCaching: [
            {
              urlPattern: ({ request }) => request.mode === "navigate",
              handler: "NetworkFirst",
              options: {
                cacheName: "suffa-pages",
                networkTimeoutSeconds: 3,
                expiration: { maxEntries: 50, maxAgeSeconds: 60 * 60 * 24 * 7 },
              },
            },
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
