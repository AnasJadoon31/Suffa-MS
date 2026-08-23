import { StrictMode, startTransition } from "react";
import { hydrateRoot, createRoot } from "react-dom/client";
import { StartClient } from "@tanstack/react-start/client";
import { RouterProvider } from "@tanstack/react-router";
import { getRouter } from "./router";

declare global {
  interface Window {
    __TSR__?: { matches?: Array<unknown>; streamedValues?: Record<string, unknown> };
    $_TSR?: unknown;
  }
}

const isSpaShell =
  !window.$_TSR &&
  (!window.__TSR__ || !window.__TSR__.matches || window.__TSR__.matches.length === 0);

if (isSpaShell) {
  // ── PWA offline shell / service-worker fallback ──────────────────
  // The static index.html has no SSR state (`$_TSR` is missing and
  // `__TSR__.matches` is empty).  TanStack Start's default client
  // entry calls `hydrateRoot` + `StartClient` which internally runs
  // `hydrateStart()` → reads `window.$_TSR` → throws "Invariant
  // failed" because there is nothing to hydrate against.
  //
  // Instead we boot the router as a pure client-side SPA: load the
  // routes first, then mount with `createRoot`.
  const router = getRouter();
  router.load().then(() => {
    startTransition(() => {
      createRoot(document).render(
        <StrictMode>
          <RouterProvider router={router} />
        </StrictMode>,
      );
    });
  });
} else {
  // ── Standard SSR hydration (Nitro served the page) ───────────────
  startTransition(() => {
    hydrateRoot(
      document,
      <StrictMode>
        <StartClient />
      </StrictMode>,
    );
  });
}
