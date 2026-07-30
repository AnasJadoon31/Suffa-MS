import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { ThemeProvider as MuiThemeProvider } from "@mui/material/styles";
import CssBaseline from "@mui/material/CssBaseline";
import { darkTheme, lightTheme } from "../theme";

const STORAGE_KEY = "mms-dark-mode";

type DarkModeState = "light" | "dark" | "system";

interface ThemeContextValue {
  isDarkMode: boolean;
  mode: DarkModeState;
  toggleDarkMode: () => void;
  setDarkMode: (mode: DarkModeState) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function getInitialMode(): DarkModeState {
  if (typeof window === "undefined") return "light";

  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === "dark" || stored === "light" || stored === "system") {
    return stored;
  }

  return "system";
}

function resolveMode(mode: DarkModeState): "light" | "dark" {
  if (mode === "system") {
    return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  return mode;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<DarkModeState>(getInitialMode);

  useEffect(() => {
    const resolved = resolveMode(mode);
    const root = document.documentElement;
    root.style.colorScheme = resolved;
    root.setAttribute("data-theme", resolved);

    const metaThemeColor = document.querySelector('meta[name="theme-color"]');
    if (metaThemeColor) {
      metaThemeColor.setAttribute("content", resolved === "dark" ? "#0f1a17" : "#0f766e");
    }

    localStorage.setItem(STORAGE_KEY, mode);

    if (mode === "system") {
      const mq = window.matchMedia("(prefers-color-scheme: dark)");
      const handler = () => {
        const next = mq.matches ? "dark" : "light";
        root.style.colorScheme = next;
        root.setAttribute("data-theme", next);
        metaThemeColor?.setAttribute("content", next === "dark" ? "#0f1a17" : "#0f766e");
      };
      mq.addEventListener("change", handler);
      return () => mq.removeEventListener("change", handler);
    }
  }, [mode]);

  const toggleDarkMode = useCallback(() => {
    setMode((prev) => (prev === "dark" ? "light" : "dark"));
  }, []);

  const setDarkMode = useCallback((newMode: DarkModeState) => {
    setMode(newMode);
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({
      isDarkMode: resolveMode(mode) === "dark",
      mode,
      toggleDarkMode,
      setDarkMode,
    }),
    [mode, toggleDarkMode, setDarkMode],
  );

  const theme = resolveMode(mode) === "dark" ? darkTheme : lightTheme;

  return (
    <ThemeContext.Provider value={value}>
      <MuiThemeProvider theme={theme}>
        <CssBaseline />
        {children}
      </MuiThemeProvider>
    </ThemeContext.Provider>
  );
}

export function useThemeMode(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error("useThemeMode must be used within a ThemeProvider");
  }
  return ctx;
}
