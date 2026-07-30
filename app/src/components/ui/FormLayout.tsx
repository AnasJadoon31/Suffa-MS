import { type ReactNode } from "react";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Paper from "@mui/material/Paper";
import useMediaQuery from "@mui/material/useMediaQuery";
import { useTheme } from "@mui/material/styles";

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
  const isDesktop = useMediaQuery(theme.breakpoints.up("sm"));

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
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));

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
    <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <span style={{ fontSize: "0.875rem", fontWeight: 500, color: "var(--muted, #5f6d67)" }}>
        {label}
      </span>
      {children}
    </label>
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
        borderRadius: 2,
      }}
    >
      {children}
    </Paper>
  );
}
