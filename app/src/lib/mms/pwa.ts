/** Guarded service-worker registration. Offline support only runs on the published site. */
// vite-plugin-pwa's devOptions serves the injectManifest SW at this fixed
// internal dev path (not the production filename) whenever it's running
// under `vite dev` — registering "/sw-v5.js" there 404s, since that file
// only exists in a real build's output.
const SW_URL = import.meta.env.DEV ? "/dev-sw.js?dev-sw" : "/sw-v5.js";

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

async function unregisterOldWorkers(all = false): Promise<void> {
  // Remove any previous SW (legacy pass-through /sw.js or older sw-v*.js)
  // so the current one fully controls fetches.
  const registrations = await window.navigator.serviceWorker.getRegistrations();
  await Promise.allSettled(
    registrations
      .filter((registration) => {
        if (all) return true;
        const url =
          registration.active?.scriptURL ??
          registration.waiting?.scriptURL ??
          registration.installing?.scriptURL ??
          "";
        return url.includes("/sw") && !url.includes(SW_URL);
      })
      .map((registration) => registration.unregister()),
  );
}

export function registerServiceWorker(): void {
  if (typeof window === "undefined" || !("serviceWorker" in window.navigator)) return;

  const refuse =
    window.self !== window.top ||
    isBlockedHost(window.location.hostname) ||
    new URLSearchParams(window.location.search).get("sw") === "off" ||
    import.meta.env["VITE_ENABLE_OFFLINE"] !== "true";

  if (refuse) {
    void unregisterOldWorkers(true).catch(() => undefined);
    return;
  }

  // Remove legacy pass-through SW first, then register the new one.
  void unregisterOldWorkers()
    .catch(() => undefined)
    .finally(() => {
      void window.navigator.serviceWorker
        .register(SW_URL, {
          scope: "/",
          type: import.meta.env.PROD ? "classic" : "module",
        })
        .then((registration) => {
          console.log("SW registered:", registration.scope);
        })
        .catch((error) => {
          console.error("SW registration failed:", error);
        });
    });
}
