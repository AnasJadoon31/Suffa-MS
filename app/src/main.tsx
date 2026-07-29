import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import CssBaseline from "@mui/material/CssBaseline";
import { ThemeProvider } from "@mui/material/styles";

import { BrowserRouter } from "react-router";
import App from "./App";
import { AuthProvider } from "./lib/AuthContext";
import { appTheme } from "./theme";
import { ensurePwaRegistration } from "./lib/pwaRegistration";
import "./i18n";
import "./styles.css";

import { DialogProvider } from "./lib/DialogContext";
import { SnackbarProvider } from "./components/ui/Snackbar";
import { NavigationGuardProvider } from "./lib/NavigationGuardContext";

const queryClient = new QueryClient();

ensurePwaRegistration();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ThemeProvider theme={appTheme}>
      <CssBaseline />
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
