import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { BrowserRouter } from "react-router";
import App from "./App";
import { AuthProvider } from "./lib/AuthContext";
import { ThemeProvider } from "./lib/ThemeContext";
import { ensurePwaRegistration } from "./lib/pwaRegistration";
import "./i18n";

import { DialogProvider } from "./lib/DialogContext";
import { SnackbarProvider } from "./components/ui/Snackbar";
import { NavigationGuardProvider } from "./lib/NavigationGuardContext";

const queryClient = new QueryClient();

ensurePwaRegistration();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <DialogProvider>
            <SnackbarProvider>
              <NavigationGuardProvider>
                <BrowserRouter>
                  <App />
                </BrowserRouter>
              </NavigationGuardProvider>
            </SnackbarProvider>
          </DialogProvider>
        </AuthProvider>
      </QueryClientProvider>
    </ThemeProvider>
  </React.StrictMode>,
);
