import { createTheme } from "@mui/material/styles";

export const appTheme = createTheme({
  direction: document.documentElement.dir === "rtl" ? "rtl" : "ltr",
  palette: {
    mode: "light",
    primary: {
      main: "#0f766e",
      dark: "#0b4f49",
      light: "#7bc5bb",
      contrastText: "#ffffff",
    },
    secondary: {
      main: "#c77d1a",
      light: "#fdf3e2",
      contrastText: "#16211d",
    },
    error: {
      main: "#b94a48",
    },
    background: {
      default: "#f2f4ef",
      paper: "#ffffff",
    },
    text: {
      primary: "#16211d",
      secondary: "#5f6d67",
    },
    divider: "#e0e6df",
  },
  shape: {
    borderRadius: 10,
  },
  typography: {
    fontFamily: '"Aptos", "Segoe UI", system-ui, sans-serif',
    button: {
      textTransform: "none",
      fontWeight: 750,
    },
  },
  components: {
    MuiButton: {
      defaultProps: {
        disableElevation: true,
      },
      styleOverrides: {
        root: {
          borderRadius: 10,
          minHeight: 44,
          gap: 8,
          "@media (max-width: 960px)": {
            minHeight: 44,
            minWidth: 44,
          },
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        rounded: {
          borderRadius: 14,
        },
      },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          borderRadius: 10,
          backgroundColor: "#ffffff",
        },
      },
    },
    MuiTableCell: {
      styleOverrides: {
        head: {
          color: "#0b4f49",
          fontWeight: 800,
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          fontSize: "0.74rem",
          backgroundColor: "#f8faf7",
        },
      },
    },
  },
});
