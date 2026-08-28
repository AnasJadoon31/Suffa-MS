// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { loadEnv } from "vite";
import { VitePWA } from "vite-plugin-pwa";
import type { Plugin } from "vite";

// Vite only merges .env values into process.env for client code (import.meta.env);
// this file runs as plain Node before that happens, so process.env.VITE_ENABLE_OFFLINE
// would silently stay undefined unless we load .env ourselves.
Object.assign(process.env, loadEnv(process.env["NODE_ENV"] ?? "production", process.cwd(), ""));

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
      clientOnlyPWA({
        strategies: "injectManifest",
        srcDir: "src",
        filename: "sw-v5.ts",
        registerType: "autoUpdate",
        injectRegister: null,
        selfDestroying: false,
        devOptions: { enabled: true, type: "module" },
        manifest: false,
        outDir: ".output/public",
        injectManifest: {
          globDirectory: ".output/public",
          globPatterns: ["**/*.{js,css,html,woff2,png,svg,ico,webmanifest}"],
        },
      }),
    ],
  },
});
