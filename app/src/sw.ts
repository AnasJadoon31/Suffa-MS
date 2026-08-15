/// <reference lib="webworker" />
declare const self: ServiceWorkerGlobalScope;

import { precacheAndRoute, cleanupOutdatedCaches, createHandlerBoundToURL } from "workbox-precaching";
import { registerRoute, NavigationRoute } from "workbox-routing";
import { CacheFirst, StaleWhileRevalidate } from "workbox-strategies";
import { ExpirationPlugin } from "workbox-expiration";
import { CacheableResponsePlugin } from "workbox-cacheable-response";

cleanupOutdatedCaches();

// Precache all assets (injected by vite-plugin-pwa at build time)
precacheAndRoute(self.__WB_MANIFEST);

// App shell fallback: when offline and no cached page exists, serve the shell
const shellUrl = "/index.html";
const navigationRoute = new NavigationRoute(
  createHandlerBoundToURL(shellUrl),
  { denylist: [/^\/~oauth/, /^\/api\//] },
);
registerRoute(navigationRoute);

// Cache static assets (CacheFirst)
registerRoute(
  ({ request }) =>
    ["style", "script", "worker", "font", "image"].includes(request.destination),
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

// Force the new SW to take over immediately
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
