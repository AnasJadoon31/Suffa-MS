/** Guarded service-worker registration. Offline support only runs on the published site. */
const SW_URL = "/sw-v2.js";

function isBlockedHost(hostname: string): boolean {
  return (
    hostname.startsWith("id-preview--") ||
    hostname.startsWith("preview--") ||
    hostname === "lovableproject.com" ||
    hostname.endsWith(".lovableproject.com") ||
    hostname === "lovableproject-dev.com" ||
    hostname.endsWith(".lovableproject-dev.com") ||
    hostname === "beta.lovable.dev" ||
    hostname.endsWith(".beta.lovable.dev")
  );
}

async function unregisterOldWorkers(): Promise<void> {
  // Remove the legacy pass-through SW and any previous SW so the new one
  // (sw-v2.js) fully controls fetches.
  const registrations = await window.navigator.serviceWorker.getRegistrations();
  await Promise.allSettled(
    registrations
      .filter((registration) => {
        const url =
          registration.active?.scriptURL ??
          registration.waiting?.scriptURL ??
          registration.installing?.scriptURL ??
          "";
        return url.includes("/sw.js") || url.endsWith(SW_URL);
      })
      .map((registration) => registration.unregister()),
  );
}

export function registerServiceWorker(): void {
  if (typeof window === "undefined" || !("serviceWorker" in window.navigator)) return;

  const refuse =
    !import.meta.env.PROD ||
    window.self !== window.top ||
    isBlockedHost(window.location.hostname) ||
    new URLSearchParams(window.location.search).get("sw") === "off";

  if (refuse) {
    void unregisterOldWorkers().catch(() => undefined);
    return;
  }

  // Remove legacy pass-through SW first, then register the new one.
  void unregisterOldWorkers()
    .catch(() => undefined)
    .finally(() => {
      void window.navigator.serviceWorker
        .register(SW_URL, { scope: "/" })
        .catch(() => undefined);
    });
}
