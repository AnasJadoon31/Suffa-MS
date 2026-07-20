import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { AuthProvider } from "./lib/AuthContext";
import "./i18n";
import "./styles.css";
import { registerSW } from "virtual:pwa-register";

// Auto-updating service worker (vite-plugin-pwa); reloads seamlessly on new
// deploys instead of serving stale bundles.
registerSW({ immediate: true });

import { DialogProvider } from "./lib/DialogContext";

const queryClient = new QueryClient();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <DialogProvider>
          <BrowserRouter>
            <App />
          </BrowserRouter>
        </DialogProvider>
      </AuthProvider>
    </QueryClientProvider>
  </React.StrictMode>,
);
