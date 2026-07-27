import { type ReactNode, type CSSProperties } from "react";
import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";

export function AppShell({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <Box component="main" className={`appShell ${className}`.trim()}>{children}</Box>;
}

export function Topbar({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <Box component="header" className={`topbar ${className}`.trim()}>{children}</Box>;
}

export function Workspace({ children, className = "", style }: { children: ReactNode; className?: string; style?: CSSProperties }) {
  return (
    <Box component="section" className={`workspace ${className}`.trim()} style={style}>
      {children}
    </Box>
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
    <Paper component="section" variant="outlined" className={classes.join(" ")} style={style}>
      {children}
    </Paper>
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
    <Box
      className={classes.join(" ")}
      sx={{
        display: "flex",
        flexDirection: { xs: "column", sm: "row" },
        alignItems: { xs: "stretch", sm: "flex-start" },
        gap: 2,
      }}
    >
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
    </Box>
  );
}

export function FilterBar({ children, className = "" }: { children: ReactNode; className?: string }) {
  const classes = ["filterBar"];
  if (className) classes.push(className);
  return <Box className={classes.join(" ")}>{children}</Box>;
}
