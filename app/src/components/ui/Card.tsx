import { type ReactNode, type CSSProperties } from "react";
import Paper from "@mui/material/Paper";
import Box from "@mui/material/Box";

export function Card({
  children,
  className = "",
  style,
}: {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <Paper component="article" variant="outlined" className={`card ${className}`.trim()} style={style}>
      {children}
    </Paper>
  );
}

export function MetricGrid({
  children,
  className = "",
  "aria-label": ariaLabel,
}: {
  children: ReactNode;
  className?: string;
  "aria-label"?: string;
}) {
  return (
    <Box component="section" className={`metricGrid ${className}`.trim()} aria-label={ariaLabel}>
      {children}
    </Box>
  );
}

export function MetricCard({
  title,
  value,
  trend,
  className = "",
  children,
}: {
  title: ReactNode;
  value?: ReactNode;
  trend?: ReactNode;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <Paper component="article" variant="outlined" className={`metricCard ${className}`.trim()}>
      <h3>{title}</h3>
      {value !== undefined && <div className="metricValue">{value}</div>}
      {trend !== undefined && <div className="metricTrend">{trend}</div>}
      {children}
    </Paper>
  );
}

export function BlogCard({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <Paper component="article" variant="outlined" className={`blogCard ${className}`.trim()}>
      {children}
    </Paper>
  );
}
