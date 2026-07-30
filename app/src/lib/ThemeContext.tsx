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

type DarkModeState = "light" | "dark";

interface ThemeContextValue {
  isDarkMode: boolean;
  toggleDarkMode: () => void;
  setDarkMode: (mode: DarkModeState) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function getInitialMode(): DarkModeState {
  if (typeof window === "undefined") return "light";

  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === "dark" || stored === "light") {
    return stored;
  }

  if (window.matchMedia?.("(prefers-color-scheme: dark)").matches) {
    return "dark";
  }

  return "light";
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<DarkModeState>(getInitialMode);

  useEffect(() => {
    const root = document.documentElement;
    root.style.colorScheme = mode;
    root.setAttribute("data-theme", mode);

    const metaThemeColor = document.querySelector('meta[name="theme-color"]');
    if (metaThemeColor) {
      metaThemeColor.setAttribute("content", mode === "dark" ? "#0f1a17" : "#0f766e");
    }

    localStorage.setItem(STORAGE_KEY, mode);
  }, [mode]);

  const toggleDarkMode = useCallback(() => {
    setMode((prev) => (prev === "dark" ? "light" : "dark"));
  }, []);

  const setDarkMode = useCallback((newMode: DarkModeState) => {
    setMode(newMode);
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({
      isDarkMode: mode === "dark",
      toggleDarkMode,
      setDarkMode,
    }),
    [mode, toggleDarkMode, setDarkMode],
  );

  const theme = mode === "dark" ? darkTheme : lightTheme;

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
