/** Guarded service-worker registration. Offline support only runs on the published site. */
const SW_URL = "/sw.js";

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

async function unregisterAppWorker(): Promise<void> {
  const registrations = await window.navigator.serviceWorker.getRegistrations();
  await Promise.allSettled(
    registrations
      .filter((registration) => {
        const url =
          registration.active?.scriptURL ??
          registration.waiting?.scriptURL ??
          registration.installing?.scriptURL ??
          "";
        return url.endsWith(SW_URL);
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
    void unregisterAppWorker().catch(() => undefined);
    return;
  }

  void window.navigator.serviceWorker.register(SW_URL, { scope: "/" }).catch(() => undefined);
}
