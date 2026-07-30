import { createTheme, ThemeOptions } from "@mui/material/styles";

declare module "@mui/material/styles" {
  interface Palette {
    teal: Palette["primary"];
    gold: Palette["primary"];
    saffron: Palette["primary"];
    leaf: Palette["primary"];
    rose: Palette["primary"];
  }
  interface PaletteOptions {
    teal?: PaletteOptions["primary"];
    gold?: PaletteOptions["primary"];
    saffron?: PaletteOptions["primary"];
    leaf?: PaletteOptions["primary"];
    rose?: PaletteOptions["primary"];
  }
}

const latinFont = '"Inter", "Segoe UI", system-ui, sans-serif';
const urduFont = '"Noto Nastaliq Urdu", "Jameel Noori Nastaleeq", "Segoe UI", sans-serif';

const baseThemeOptions: ThemeOptions = {
  direction: document.documentElement.dir === "rtl" ? "rtl" : "ltr",
  shape: {
    borderRadius: 10,
  },
  spacing: 8,
  typography: {
    fontFamily: latinFont,
    fontSize: 14,
    fontWeightRegular: 400,
    fontWeightMedium: 500,
    fontWeightBold: 700,
    h1: { fontSize: "2.25rem", fontWeight: 700, lineHeight: 1.2 },
    h2: { fontSize: "1.75rem", fontWeight: 700, lineHeight: 1.25 },
    h3: { fontSize: "1.25rem", fontWeight: 600, lineHeight: 1.3 },
    h4: { fontSize: "1rem", fontWeight: 600, lineHeight: 1.4 },
    body1: { fontSize: "1rem", lineHeight: 1.55 },
    body2: { fontSize: "0.875rem", lineHeight: 1.55 },
    caption: { fontSize: "0.75rem", lineHeight: 1.5 },
    button: {
      textTransform: "none",
      fontWeight: 600,
      fontSize: "0.875rem",
    },
  },
  components: {
    MuiButton: {
      defaultProps: {
        disableElevation: true,
      },
      styleOverrides: {
        root: {
          borderRadius: 999,
          minHeight: 44,
          paddingInline: 20,
          gap: 8,
          fontWeight: 600,
        },
        sizeSmall: {
          minHeight: 36,
          paddingInline: 14,
        },
        sizeLarge: {
          minHeight: 52,
          paddingInline: 28,
        },
        contained: {
          "&:hover": {
            backgroundColor: "#0b4f49",
          },
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        rounded: {
          borderRadius: 16,
        },
        elevation1: {
          boxShadow: "0 1px 3px rgba(22, 33, 29, 0.06), 0 1px 2px rgba(22, 33, 29, 0.04)",
        },
        elevation2: {
          boxShadow: "0 4px 16px rgba(22, 33, 29, 0.07), 0 2px 4px rgba(22, 33, 29, 0.04)",
        },
      },
    },
    MuiTableCell: {
      styleOverrides: {
        head: {
          color: "#0b4f49",
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          fontSize: "0.75rem",
          backgroundColor: "transparent",
          borderBottom: "2px solid",
          borderColor: "divider",
        },
        root: {
          paddingInline: 16,
          minHeight: 48,
        },
      },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          borderRadius: 12,
          "& .MuiOutlinedInput-notchedOutline": {
            borderColor: "#c9d2c9",
          },
          "&:hover .MuiOutlinedInput-notchedOutline": {
            borderColor: "#0f766e",
          },
          "&.Mui-focused .MuiOutlinedInput-notchedOutline": {
            borderColor: "#0f766e",
            borderWidth: 2,
          },
        },
        input: {
          minHeight: "auto",
          paddingBlock: 12,
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          borderRadius: 999,
          fontWeight: 600,
          fontSize: "0.8rem",
        },
        filled: {
          "&.MuiChip-colorDefault": {
            backgroundColor: "#e0e6df",
            color: "#16211d",
          },
        },
      },
    },
    MuiDialog: {
      styleOverrides: {
        paper: {
          borderRadius: 20,
          margin: 16,
        },
      },
    },
    MuiCssBaseline: {
      styleOverrides: {
        html: {
          height: "100%",
        },
        body: {
          minHeight: "100vh",
          WebkitFontSmoothing: "antialiased",
          textRendering: "optimizeLegibility",
        },
        "#root": {
          minHeight: "100vh",
        },
        '[dir="rtl"]': {
          fontFamily: urduFont,
          lineHeight: 2.2,
        },
        '[dir="rtl"] button': {
          fontFamily: urduFont,
          lineHeight: 2.2,
        },
      },
    },
  },
};

const lightPalette: ThemeOptions["palette"] = {
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
    dark: "#8a5511",
    contrastText: "#16211d",
  },
  error: {
    main: "#b94a48",
    light: "#fbeeed",
    dark: "#8b3533",
  },
  warning: {
    main: "#c77d1a",
    light: "#fdf3e2",
    dark: "#8a5511",
  },
  success: {
    main: "#3f7f4c",
    light: "#e9f4ec",
    dark: "#2d5c36",
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
  teal: {
    main: "#0f766e",
    dark: "#0b4f49",
    light: "#7bc5bb",
    contrastText: "#ffffff",
  },
  gold: {
    main: "#c77d1a",
    dark: "#8a5511",
    light: "#efb45f",
    contrastText: "#ffffff",
  },
  saffron: {
    main: "#c77d1a",
    dark: "#8a5511",
    light: "#fdf3e2",
    contrastText: "#16211d",
  },
  leaf: {
    main: "#3f7f4c",
    dark: "#2d5c36",
    light: "#e9f4ec",
    contrastText: "#ffffff",
  },
  rose: {
    main: "#b94a48",
    dark: "#8b3533",
    light: "#fbeeed",
    contrastText: "#ffffff",
  },
};

const darkPalette: ThemeOptions["palette"] = {
  mode: "dark",
  primary: {
    main: "#7bc5bb",
    dark: "#0f766e",
    light: "#a8ddd6",
    contrastText: "#0d2f2b",
  },
  secondary: {
    main: "#efb45f",
    light: "#fdf3e2",
    dark: "#c77d1a",
    contrastText: "#2c1d05",
  },
  error: {
    main: "#e2aaa8",
    light: "#fbeeed",
    dark: "#b94a48",
  },
  warning: {
    main: "#efb45f",
    light: "#fdf3e2",
    dark: "#c77d1a",
  },
  success: {
    main: "#9bc7a9",
    light: "#e9f4ec",
    dark: "#3f7f4c",
  },
  background: {
    default: "#0f1a17",
    paper: "#1a2925",
  },
  text: {
    primary: "#eef8f5",
    secondary: "#9bb8b0",
  },
  divider: "#2a3d37",
  teal: {
    main: "#7bc5bb",
    dark: "#0f766e",
    light: "#a8ddd6",
    contrastText: "#0d2f2b",
  },
  gold: {
    main: "#efb45f",
    dark: "#c77d1a",
    light: "#f5d49a",
    contrastText: "#2c1d05",
  },
  saffron: {
    main: "#efb45f",
    dark: "#c77d1a",
    light: "#3a2e1a",
    contrastText: "#fdf3e2",
  },
  leaf: {
    main: "#9bc7a9",
    dark: "#3f7f4c",
    light: "#1e3324",
    contrastText: "#e9f4ec",
  },
  rose: {
    main: "#e2aaa8",
    dark: "#b94a48",
    light: "#3a201f",
    contrastText: "#fbeeed",
  },
};

export const lightTheme = createTheme({
  ...baseThemeOptions,
  palette: lightPalette,
});

export const darkTheme = createTheme({
  ...baseThemeOptions,
  palette: darkPalette,
});

export const appTheme = lightTheme;
