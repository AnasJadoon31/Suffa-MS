import { type ReactNode, type CSSProperties } from "react";

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
    <article className={`card ${className}`.trim()} style={style}>
      {children}
    </article>
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
    <section className={`metricGrid ${className}`.trim()} aria-label={ariaLabel}>
      {children}
    </section>
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
    <article className={`metricCard ${className}`.trim()}>
      <h3>{title}</h3>
      {value !== undefined && <div className="metricValue">{value}</div>}
      {trend !== undefined && <div className="metricTrend">{trend}</div>}
      {children}
    </article>
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
    <article className={`blogCard ${className}`.trim()}>
      {children}
    </article>
  );
}
