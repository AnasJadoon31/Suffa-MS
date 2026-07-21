import { type ReactNode, type CSSProperties } from "react";

export function AppShell({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <main className={`appShell ${className}`.trim()}>{children}</main>;
}

export function Topbar({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <header className={`topbar ${className}`.trim()}>{children}</header>;
}

export function Workspace({ children, className = "", style }: { children: ReactNode; className?: string; style?: CSSProperties }) {
  return (
    <section className={`workspace ${className}`.trim()} style={style}>
      {children}
    </section>
  );
}

export function PageSection({
  children,
  className = "",
  style,
  readOnly = false,
  isDetail = false,
}: {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  readOnly?: boolean;
  isDetail?: boolean;
}) {
  const classes = ["modulePanel"];
  if (readOnly) classes.push("readOnlyView");
  if (isDetail) classes.push("detailPanel");
  if (className) classes.push(className);

  return (
    <section className={classes.join(" ")} style={style}>
      {children}
    </section>
  );
}

export function PageHeader({
  title,
  icon,
  notice,
  actions,
  className = "",
  children,
}: {
  title: ReactNode;
  icon?: ReactNode;
  notice?: ReactNode;
  actions?: ReactNode;
  className?: string;
  children?: ReactNode;
}) {
  const classes = ["moduleHeader"];
  if (className) classes.push(className);

  return (
    <div className={classes.join(" ")}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <h2>
          {icon}
          {icon && " "}
          {title}
        </h2>
        {notice && typeof notice === "string" ? <p className="notice">{notice}</p> : notice}
      </div>
      {actions && <div style={{ flexShrink: 0 }}>{actions}</div>}
      {children}
    </div>
  );
}

export function FilterBar({ children, className = "" }: { children: ReactNode; className?: string }) {
  const classes = ["filterBar"];
  if (className) classes.push(className);
  return <div className={classes.join(" ")}>{children}</div>;
}
