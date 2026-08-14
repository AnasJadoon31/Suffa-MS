/// <reference lib="webworker" />
declare const self: ServiceWorkerGlobalScope;

import { precacheAndRoute, cleanupOutdatedCaches, createHandlerBoundToURL } from "workbox-precaching";
import { registerRoute, NavigationRoute } from "workbox-routing";
import { NetworkFirst, CacheFirst, StaleWhileRevalidate } from "workbox-strategies";
import { ExpirationPlugin } from "workbox-expiration";
import { CacheableResponsePlugin } from "workbox-cacheable-response";

cleanupOutdatedCaches();

const entries = self.__WB_MANIFEST;
precacheAndRoute(entries);

const appShell = "/index.html";
const navigationRoute = new NavigationRoute(createHandlerBoundToURL(appShell), {
  denylist: [/^\/~oauth/, /^\/api\//],
});
registerRoute(navigationRoute);

registerRoute(
  ({ request }) => request.mode === "navigate",
  new NetworkFirst({
    cacheName: "suffa-pages",
    networkTimeoutSeconds: 3,
    plugins: [new ExpirationPlugin({ maxEntries: 50, maxAgeSeconds: 60 * 60 * 24 * 7 })],
  }),
);

registerRoute(
  ({ request }) =>
    ["style", "script", "worker", "font", "image"].includes(request.destination),
  new CacheFirst({
    cacheName: "suffa-assets",
    plugins: [new ExpirationPlugin({ maxEntries: 120, maxAgeSeconds: 60 * 60 * 24 * 30 })],
  }),
);

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

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open("suffa-pages").then((cache) =>
      cache.add(new Request(appShell, { cache: "reload" })).catch(() => undefined),
    ),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});
