import { type ReactNode } from "react";
import { Box } from "./Mui";
import { Paper } from "./Mui";
import { Typography } from "./Mui";
import { styled } from "@mui/material/styles";
import type { SxProps, Theme } from "@mui/material/styles";
import { Button } from "./Button";

export const PWA_COMPACT_BREAKPOINT = 960;
export const PWA_BOTTOM_NAV_HEIGHT = 72;
export const PWA_TOUCH_TARGET = 44;

type LayoutSx = SxProps<Theme>;

export function AppShell({ children }: { children: ReactNode }) {
  return <Box component="main" sx={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>{children}</Box>;
}

export function Topbar({ children }: { children: ReactNode }) {
  return <Box component="header" sx={{ position: "sticky", top: 0, zIndex: 1100, borderBottom: "1px solid", borderColor: "divider", bgcolor: "background.paper" }}>{children}</Box>;
}

export function Workspace({ children, sx }: { children: ReactNode; sx?: LayoutSx }) {
  return (
    <Box component="section" sx={{ flex: 1, p: { xs: 1.5, sm: 2.5, md: 3 }, ...sx }}>
      {children}
    </Box>
  );
}

export function Page({ children, sx }: { children: ReactNode; sx?: LayoutSx }) {
  return (
    <Box
      sx={{
        width: "100%",
        maxWidth: 1440,
        mx: "auto",
        display: "flex",
        flexDirection: "column",
        gap: { xs: 1.5, md: 2 },
        ...sx,
      }}
    >
      {children}
    </Box>
  );
}

export function PageSection({
  children,
  readOnly = false,
  isDetail = false,
  sx,
  className,
}: {
  children: ReactNode;
  readOnly?: boolean;
  isDetail?: boolean;
  sx?: LayoutSx;
  className?: string;
}) {
  return (
    <Paper component="section" variant="outlined" className={`modulePanel${className ? ` ${className}` : ""}`} sx={{
      borderRadius: 1,
      p: { xs: 1.5, sm: 2, md: 2.5 },
      mb: 2,
      overflow: "visible",
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
    <PageHeaderRoot className="moduleHeader">
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1, minWidth: 0 }}>
          {icon && <Box sx={{ color: "text.secondary", display: "flex" }}>{icon}</Box>}
          <Typography variant="h5" component="h2" sx={{ fontWeight: 700, minWidth: 0, overflowWrap: "anywhere" }}>{title}</Typography>
        </Box>
        {notice && typeof notice === "string" ? <PageNotice>{notice}</PageNotice> : notice}
      </Box>
      {actions && <PageHeaderActions>{actions}</PageHeaderActions>}
      {children}
    </PageHeaderRoot>
  );
}

export function PageToolbar({ children, sx, className }: { children: ReactNode; sx?: LayoutSx; className?: string }) {
  return (
    <PageToolbarRoot className={className} sx={sx}>
      {children}
    </PageToolbarRoot>
  );
}

export function ResponsiveStack({ children, sx }: { children: ReactNode; sx?: LayoutSx }) {
  return (
    <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "repeat(2, minmax(0, 1fr))" }, gap: 2, ...sx }}>
      {children}
    </Box>
  );
}

export function StickyMobileActions({ children }: { children: ReactNode }) {
  return <StickyMobileActionsRoot>{children}</StickyMobileActionsRoot>;
}

export type ResponsiveTabOption<T extends string = string> = Readonly<{
  value: T;
  label: ReactNode;
}>;

export function ResponsiveTabs<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
}: {
  value: T;
  options: readonly ResponsiveTabOption<T>[];
  onChange: (value: T) => void;
  ariaLabel?: string;
}) {
  return (
    <ResponsiveTabsRoot role="tablist" aria-label={ariaLabel}>
      {options.map((option) => (
        <Button
          key={option.value}
          type="button"
          variant={value === option.value ? "contained" : "outlined"}
          role="tab"
          aria-selected={value === option.value}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </Button>
      ))}
    </ResponsiveTabsRoot>
  );
}

export function DetailList({ items, sx }: { items: { label: ReactNode; value: ReactNode }[]; sx?: LayoutSx }) {
  return (
    <DetailListRoot sx={sx}>
      {items.map((item, index) => (
        <Box key={index} sx={{ display: "contents" }}>
          <Typography component="dt" variant="caption" color="text.secondary" sx={{ fontWeight: 700, overflowWrap: "anywhere" }}>
            {item.label}
          </Typography>
          <Typography component="dd" variant="body2" sx={{ m: 0, minWidth: 0, overflowWrap: "anywhere" }}>
            {item.value}
          </Typography>
        </Box>
      ))}
    </DetailListRoot>
  );
}

export function FilterBarContainer({ children, sx }: { children: ReactNode; sx?: LayoutSx }) {
  return <FilterBarStyled className="inlineFilter pwaFilterStack" sx={{ ...sx }}>{children}</FilterBarStyled>;
}

/* ------------------------------------------------------------------ styled components */

export const PageSectionRoot = styled(Paper)(({ theme }) => ({
  border: `1px solid ${theme.palette.divider}`,
  borderRadius: 8,
  padding: theme.spacing(2),
  marginBottom: theme.spacing(2),
}));

export const PageHeaderRoot = styled(Box)(({ theme }) => ({
  display: "flex",
  flexDirection: "column",
  alignItems: "stretch",
  gap: theme.spacing(1.5),
  marginBottom: theme.spacing(2),
  [theme.breakpoints.up(PWA_COMPACT_BREAKPOINT)]: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
}));

export const PageHeaderActions = styled(Box)(({ theme }) => ({
  display: "flex",
  flexWrap: "wrap",
  gap: theme.spacing(1),
  alignItems: "center",
  minWidth: 0,
  "& > *": {
    minHeight: PWA_TOUCH_TARGET,
  },
  [theme.breakpoints.up(PWA_COMPACT_BREAKPOINT)]: {
    justifyContent: "flex-end",
    flexShrink: 0,
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
  overflowWrap: "anywhere",
  [theme.breakpoints.down("sm")]: {
    display: "none",
  },
}));

export const PageToolbarRoot = styled(Box)(({ theme }) => ({
  display: "flex",
  flexWrap: "wrap",
  gap: theme.spacing(1),
  alignItems: "center",
  justifyContent: "space-between",
  padding: theme.spacing(1.25),
  borderRadius: 8,
  border: `1px solid ${theme.palette.divider}`,
  backgroundColor: theme.palette.background.paper,
  marginBottom: theme.spacing(2),
  minWidth: 0,
  [theme.breakpoints.down(PWA_COMPACT_BREAKPOINT)]: {
    flexDirection: "column",
    alignItems: "stretch",
    "& > *": {
      width: "100%",
      minWidth: 0,
    },
  },
}));

export const FilterBarStyled = styled(PageToolbarRoot)(({ theme }) => ({
  justifyContent: "flex-start",
}));

export const FilterFieldGroup = styled(Box)(({ theme }) => ({
  display: "flex",
  flexWrap: "wrap",
  gap: theme.spacing(1),
  alignItems: "center",
  flex: 1,
  minWidth: 0,
  [theme.breakpoints.down(PWA_COMPACT_BREAKPOINT)]: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
    width: "100%",
  },
}));

export const FilterActions = styled(Box)(({ theme }) => ({
  display: "flex",
  gap: theme.spacing(1),
  alignItems: "center",
  flexShrink: 0,
  flexWrap: "wrap",
  [theme.breakpoints.down(PWA_COMPACT_BREAKPOINT)]: {
    width: "100%",
    "& > *": {
      flex: "1 1 160px",
    },
  },
}));

export const ResponsiveTabsRoot = styled(Box)(({ theme }) => ({
  display: "flex",
  flexWrap: "wrap",
  gap: theme.spacing(1),
  overflowX: "visible",
  scrollbarWidth: "none",
  paddingBottom: 2,
  maxWidth: "100%",
  "&::-webkit-scrollbar": {
    display: "none",
  },
  "& .MuiButton-root": {
    flexShrink: 0,
    minHeight: PWA_TOUCH_TARGET,
    borderRadius: 8,
  },
}));

export const StickyMobileActionsRoot = styled(Box)(({ theme }) => ({
  display: "flex",
  gap: theme.spacing(1),
  alignItems: "center",
  justifyContent: "flex-end",
  [theme.breakpoints.down(PWA_COMPACT_BREAKPOINT)]: {
    position: "sticky",
    bottom: `calc(${PWA_BOTTOM_NAV_HEIGHT}px + env(safe-area-inset-bottom))`,
    zIndex: theme.zIndex.appBar - 1,
    marginInline: theme.spacing(-1.5),
    padding: theme.spacing(1.25, 1.5),
    borderTop: `1px solid ${theme.palette.divider}`,
    backgroundColor: theme.palette.background.paper,
    "& > *": {
      flex: 1,
      minHeight: PWA_TOUCH_TARGET,
    },
  },
}));

export const DetailListRoot = styled("dl")(({ theme }) => ({
  display: "grid",
  gridTemplateColumns: "minmax(110px, auto) minmax(0, 1fr)",
  gap: theme.spacing(0.75, 2),
  [theme.breakpoints.down("sm")]: {
    gridTemplateColumns: "1fr",
    gap: theme.spacing(0.25),
  },
}));
