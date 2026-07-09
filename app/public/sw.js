const clearCaches = async () => {
  const keys = await caches.keys();
  await Promise.all(keys.map((key) => caches.delete(key)));
};

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(clearCaches());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      await clearCaches();
      await self.clients.claim();
      await self.registration.unregister();
    })(),
  );
});
