import { hydrateRoot, createRoot } from "react-dom/client";
import { RouterProvider } from "@tanstack/react-router";
import { StartClient } from "@tanstack/react-start/client";
import { getRouter } from "./router";

const router = getRouter();

const isSpaShell =
  !window.__TSR__ || !window.__TSR__.matches || window.__TSR__.matches.length === 0;

if (isSpaShell) {
  // If no SSR state was injected (or if we intentionally injected matches: []),
  // it means we are booting from the static PWA index.html shell.
  // Instead of hydrating (which will throw Invariant failed due to DOM mismatch
  // and missing matches), we do a full client-side render over the document.
  //
  // NOTE: StartClient expects a valid hydration promise. For a pure SPA fallback,
  // we bypass StartClient completely and just boot the RouterProvider directly.
  createRoot(document).render(<RouterProvider router={router} />);
} else {
  // Standard SSR hydration
  hydrateRoot(document, <StartClient router={router} />);
}
