/// <reference lib="webworker" />
declare const self: ServiceWorkerGlobalScope;

import { precacheAndRoute, cleanupOutdatedCaches, matchPrecache } from "workbox-precaching";
import { registerRoute, setCatchHandler } from "workbox-routing";
import { NetworkFirst, CacheFirst, StaleWhileRevalidate } from "workbox-strategies";
import { ExpirationPlugin } from "workbox-expiration";
import { CacheableResponsePlugin } from "workbox-cacheable-response";

cleanupOutdatedCaches();

// Precache all built assets, including the offline fallback shell (injected by
// vite-plugin-pwa at build time).
precacheAndRoute(self.__WB_MANIFEST);

const OAUTH_PATH = /^\/~oauth/;
const isNavigation = (url: URL, request: Request) =>
  request.mode === "navigate" && !OAUTH_PATH.test(url.pathname);

// Runtime caching of real pages/assets/API responses is a production-only
// concern. In dev, the server output changes on every save (HMR, live SSR),
// so NetworkFirst's "fall back to the last cached copy" behavior actively
// fights the workflow: a slow dev-server compile can serve a stale cached
// page whose markup no longer matches the just-reloaded JS bundle, which
// React then reports as a hydration mismatch. The precache + offline-shell
// fallback below stay active in dev (harmless, and useful for testing what
// an offline visit to an uncached route looks like); only the "remember and
// replay real responses" layer is skipped.
if (!import.meta.env.DEV) {
  // Real per-page SSR HTML, network-first so a visited page is always fresh
  // online and still available (from cache) offline. Registered before the
  // asset/API rules below so it wins for every navigation request; this must
  // stay first — a navigateFallback route registered ahead of this would
  // otherwise swallow every navigation before the network is even tried.
  registerRoute(
    ({ url, request }) => isNavigation(url, request),
    new NetworkFirst({
      cacheName: "suffa-pages",
      networkTimeoutSeconds: 3,
      plugins: [
        new ExpirationPlugin({ maxEntries: 60, maxAgeSeconds: 60 * 60 * 24 * 7 }),
        new CacheableResponsePlugin({ statuses: [0, 200] }),
      ],
    }),
  );

  // Cache static assets (CacheFirst)
  registerRoute(
    ({ request }) => ["style", "script", "worker", "font", "image"].includes(request.destination),
    new CacheFirst({
      cacheName: "suffa-assets",
      plugins: [new ExpirationPlugin({ maxEntries: 120, maxAgeSeconds: 60 * 60 * 24 * 30 })],
    }),
  );

  // Cache API responses (StaleWhileRevalidate)
  registerRoute(
    /\/api\/v1\//,
    new StaleWhileRevalidate({
      cacheName: "suffa-api-cache",
      plugins: [
        new ExpirationPlugin({ maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 7 }),
        new CacheableResponsePlugin({ statuses: [0, 200] }),
      ],
    }),
  );
}

// Last resort only: a navigation that failed both the network and the
// suffa-pages cache above (a route never visited before, while offline)
// gets the static offline shell instead of a hard failure.
setCatchHandler(async ({ event }) => {
  const request = (event as FetchEvent).request;
  if (isNavigation(new URL(request.url), request)) {
    const cached = await matchPrecache("offline.html");
    if (cached) return cached;
  }
  return Response.error();
});

const RUNTIME_CACHE_NAMES = ["suffa-pages", "suffa-assets", "suffa-api-cache"];

// Force the new SW to take over immediately
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener(
  "activate",
  (event) =>
    void event.waitUntil(
      Promise.all([
        self.clients.claim(),
        // Dev never writes these caches (see the runtime-caching guard
        // above), but an earlier dev session that had them registered may
        // have left stale entries behind — e.g. a cached page from before a
        // source change, served against the current bundle by a later
        // reload, which shows up to React as a hydration mismatch. Clear
        // them out so dev always starts from precache + live network only.
        import.meta.env.DEV
          ? Promise.all(RUNTIME_CACHE_NAMES.map((name) => caches.delete(name)))
          : Promise.resolve(),
      ]),
    ),
);
