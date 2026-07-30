import { type ReactNode } from "react";
import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";
import { styled } from "@mui/material/styles";

export function AppShell({ children }: { children: ReactNode }) {
  return <Box component="main" sx={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>{children}</Box>;
}

export function Topbar({ children }: { children: ReactNode }) {
  return <Box component="header" sx={{ position: "sticky", top: 0, zIndex: 1100, borderBottom: "1px solid", borderColor: "divider", bgcolor: "background.paper" }}>{children}</Box>;
}

export function Workspace({ children, sx }: { children: ReactNode; sx?: any }) {
  return (
    <Box component="section" sx={{ flex: 1, p: { xs: 1.5, sm: 2.5 }, ...sx }}>
      {children}
    </Box>
  );
}

export function PageSection({
  children,
  readOnly = false,
  isDetail = false,
  sx,
}: {
  children: ReactNode;
  readOnly?: boolean;
  isDetail?: boolean;
  sx?: any;
}) {
  return (
    <Paper component="section" variant="outlined" sx={{
      borderRadius: 2,
      p: 2.5,
      mb: 2.5,
      ...(readOnly && { bgcolor: "action.hover" }),
      ...(isDetail && { borderLeft: 4, borderColor: "primary.main" }),
      ...sx,
    }}>
      {children}
    </Paper>
  );
}

export function PageHeader({
  title,
  icon,
  notice,
  actions,
  children,
}: {
  title: ReactNode;
  icon?: ReactNode;
  notice?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <PageHeaderRoot>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          {icon && <Box sx={{ color: "text.secondary", display: "flex" }}>{icon}</Box>}
          <Typography variant="h5" component="h2" sx={{ fontWeight: 700 }}>{title}</Typography>
        </Box>
        {notice && typeof notice === "string" ? <PageNotice>{notice}</PageNotice> : notice}
      </Box>
      {actions && <Box sx={{ flexShrink: 0 }}>{actions}</Box>}
      {children}
    </PageHeaderRoot>
  );
}

export function FilterBarContainer({ children, sx }: { children: ReactNode; sx?: any }) {
  return <FilterBarStyled sx={{ ...sx }}>{children}</FilterBarStyled>;
}

/* ------------------------------------------------------------------ styled components */

export const PageSectionRoot = styled(Paper)(({ theme }) => ({
  border: `1px solid ${theme.palette.divider}`,
  borderRadius: 16,
  padding: theme.spacing(2.5),
  marginBottom: theme.spacing(2.5),
}));

export const PageHeaderRoot = styled(Box)(({ theme }) => ({
  display: "flex",
  flexDirection: "column",
  alignItems: "stretch",
  gap: theme.spacing(2),
  marginBottom: theme.spacing(2.5),
  [theme.breakpoints.up("sm")]: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
}));

export const PageTitle = styled(Typography)(({ theme }) => ({
  fontSize: "1.5rem",
  fontWeight: 700,
  color: theme.palette.text.primary,
}));

export const PageNotice = styled(Typography)(({ theme }) => ({
  marginTop: theme.spacing(0.5),
  fontSize: "0.875rem",
  color: theme.palette.text.secondary,
}));

export const FilterBarStyled = styled(Box)(({ theme }) => ({
  display: "flex",
  flexWrap: "wrap",
  gap: theme.spacing(1.5),
  alignItems: "center",
  padding: theme.spacing(1.5, 2),
  borderRadius: 12,
  border: `1px solid ${theme.palette.divider}`,
  backgroundColor: theme.palette.background.paper,
  marginBottom: theme.spacing(2),
}));

export const FilterFieldGroup = styled(Box)(({ theme }) => ({
  display: "flex",
  flexWrap: "wrap",
  gap: theme.spacing(1.5),
  alignItems: "center",
  flex: 1,
  minWidth: 0,
}));

export const FilterActions = styled(Box)(({ theme }) => ({
  display: "flex",
  gap: theme.spacing(1),
  alignItems: "center",
  flexShrink: 0,
}));
