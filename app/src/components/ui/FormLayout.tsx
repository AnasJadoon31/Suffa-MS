import { type ReactNode } from "react";
import { Box } from "./Mui";
import { Stack } from "./Mui";
import { Paper } from "./Mui";
import { useMediaQuery } from "./Mui";
import { useTheme, styled } from "@mui/material/styles";
import { PWA_COMPACT_BREAKPOINT, PWA_TOUCH_TARGET } from "./Layout";

/**
 * FormStack — vertical container for form fields with consistent spacing.
 */
export function FormStack({ children, gap = 2 }: Readonly<{ children: ReactNode; gap?: number }>) {
  return (
    <Stack spacing={gap}>
      {children}
    </Stack>
  );
}

/**
 * FormSection — groups related fields with an optional title.
 */
export function FormSection({ title, children }: Readonly<{ title?: string; children: ReactNode }>) {
  return (
    <Box>
      {title && (
        <Box
          component="h4"
          sx={{
            margin: 0,
            marginBottom: 1.5,
            fontSize: "0.95rem",
            fontWeight: 600,
            color: "text.primary",
          }}
        >
          {title}
        </Box>
      )}
      <Stack spacing={2}>
        {children}
      </Stack>
    </Box>
  );
}

/**
 * FormRow — responsive 1 or 2 column layout.
 * On mobile: 1 column. On desktop: 2 columns.
 */
export function FormRow({ children }: Readonly<{ children: ReactNode }>) {
  const theme = useTheme();
  const isDesktop = useMediaQuery(`(min-width:${PWA_COMPACT_BREAKPOINT}px)`);

  return (
    <Box
      sx={{
        display: "grid",
        gridTemplateColumns: isDesktop ? "1fr 1fr" : "1fr",
        gap: 2,
      }}
    >
      {children}
    </Box>
  );
}

/**
 * FormActions — sticky bottom action bar on mobile, inline on desktop.
 */
export function FormActions({ children }: Readonly<{ children: ReactNode }>) {
  const theme = useTheme();
  const isMobile = useMediaQuery(`(max-width:${PWA_COMPACT_BREAKPOINT - 1}px)`);

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: isMobile ? "column" : "row",
        gap: 2,
        marginTop: 3,
        paddingTop: 2,
        borderTop: "1px solid",
        borderColor: "divider",
        ...(isMobile && {
          position: "sticky",
          bottom: 0,
          backgroundColor: "background.paper",
          marginX: -2,
          paddingX: 2,
              paddingBottom: 2,
              zIndex: 1,
            }),
            "& .MuiButton-root": {
              minHeight: PWA_TOUCH_TARGET,
            },
      }}
    >
      {children}
    </Box>
  );
}

/**
 * FormField — consistent field wrapper with label and input.
 */
export function FormField({ label, children }: Readonly<{ label: string; children: ReactNode }>) {
  return (
    <Box component="label" sx={{ display: "flex", flexDirection: "column", gap: 0.75 }}>
      <Box component="span" sx={{ fontSize: "0.875rem", fontWeight: 500, color: "text.secondary" }}>
        {label}
      </Box>
      {children}
    </Box>
  );
}

/**
 * FormCard — elevated card for form sections.
 */
export function FormCard({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <Paper
      variant="outlined"
      sx={{
        padding: 2,
        borderRadius: 1,
      }}
    >
      {children}
    </Paper>
  );
}

/* ------------------------------------------------------------------ styled components */

export const StyledFormStack = styled(Stack)(({ theme }) => ({
  width: "100%",
}));

export const StyledFormSection = styled(Box)(({ theme }) => ({
  marginBottom: theme.spacing(3),
}));

export const StyledFormRow = styled(Box)(({ theme }) => ({
  display: "grid",
  gridTemplateColumns: "1fr",
  gap: theme.spacing(2),
  [theme.breakpoints.up(PWA_COMPACT_BREAKPOINT)]: {
    gridTemplateColumns: "1fr 1fr",
  },
}));

export const StyledFormActions = styled(Box)(({ theme }) => ({
  display: "flex",
  flexDirection: "row",
  justifyContent: "flex-end",
  gap: theme.spacing(1.5),
  marginTop: theme.spacing(3),
  paddingTop: theme.spacing(2),
  borderTop: `1px solid ${theme.palette.divider}`,
  [`@media (max-width:${PWA_COMPACT_BREAKPOINT - 1}px)`]: {
    flexDirection: "column",
    position: "sticky",
    bottom: 0,
    backgroundColor: theme.palette.background.paper,
    marginX: -2,
    paddingX: 2,
    paddingBottom: 2,
    zIndex: 1,
  },
}));

export const StyledFormField = styled(Box)(({ theme }) => ({
  display: "flex",
  flexDirection: "column",
  gap: theme.spacing(0.75),
}));
