import { type ReactNode } from "react";
import { Paper } from "./Mui";
import { Box } from "./Mui";
import { styled } from "@mui/material/styles";

export function Card({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <Paper component="article" variant="outlined" sx={{ borderRadius: 2 }}>
      {children}
    </Paper>
  );
}

export function MetricGrid({
  children,
  "aria-label": ariaLabel,
}: {
  children: ReactNode;
  "aria-label"?: string;
}) {
  return (
    <Box component="section" aria-label={ariaLabel} sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr", lg: "repeat(4, 1fr)" }, gap: 2 }}>
      {children}
    </Box>
  );
}

export function MetricCard({
  title,
  value,
  trend,
  children,
}: {
  title: ReactNode;
  value?: ReactNode;
  trend?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <Paper component="article" variant="outlined" sx={{ borderRadius: 2, p: 2.5 }}>
      <Box component="h3" sx={{ fontSize: "0.875rem", fontWeight: 600, color: "text.secondary", mb: 1 }}>{title}</Box>
      {value !== undefined && <Box sx={{ fontSize: "1.75rem", fontWeight: 700, color: "text.primary" }}>{value}</Box>}
      {trend !== undefined && <Box sx={{ fontSize: "0.8rem", color: "text.secondary", mt: 0.5 }}>{trend}</Box>}
      {children}
    </Paper>
  );
}

export function BlogCard({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <Paper component="article" variant="outlined" sx={{ borderRadius: 2, overflow: "hidden", transition: "box-shadow 0.2s ease", "&:hover": { boxShadow: 4 } }}>
      {children}
    </Paper>
  );
}

/* ------------------------------------------------------------------ styled components */

export const StyledCard = styled(Paper)(({ theme }) => ({
  border: `1px solid ${theme.palette.divider}`,
  borderRadius: 16,
  boxShadow: theme.shadows[1],
  overflow: "hidden",
}));

export const StyledCardHeader = styled(Box)(({ theme }) => ({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: theme.spacing(2),
  borderBottom: `1px solid ${theme.palette.divider}`,
}));

export const StyledCardBody = styled(Box)(({ theme }) => ({
  padding: theme.spacing(2),
}));

export const StyledCardActions = styled(Box)(({ theme }) => ({
  display: "flex",
  alignItems: "center",
  gap: theme.spacing(1),
  padding: theme.spacing(1.5, 2),
  borderTop: `1px solid ${theme.palette.divider}`,
}));

export const MetricCardStyled = styled(Paper)(({ theme }) => ({
  border: `1px solid ${theme.palette.divider}`,
  borderRadius: 16,
  padding: theme.spacing(2.5),
  boxShadow: theme.shadows[1],
}));

export const BlogCardStyled = styled(Paper)(({ theme }) => ({
  border: `1px solid ${theme.palette.divider}`,
  borderRadius: 16,
  overflow: "hidden",
  boxShadow: theme.shadows[1],
  transition: "box-shadow 0.2s ease",
  "&:hover": {
    boxShadow: theme.shadows[4],
  },
}));
