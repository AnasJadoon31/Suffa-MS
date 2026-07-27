import React, { useState } from "react";
import { Loader2 } from "lucide-react";
import MuiButton from "@mui/material/Button";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  isLoading?: boolean;
}

function variantForClass(className?: string) {
  if (className?.includes("primaryAction")) return "contained" as const;
  if (className?.includes("danger")) return "contained" as const;
  if (className?.includes("iconButton")) return "text" as const;
  return "outlined" as const;
}

function colorForClass(className?: string) {
  if (className?.includes("danger")) return "error" as const;
  return "primary" as const;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(({ className, type = "button", isLoading, children, disabled, onClick, color: _nativeColor, ...props }, ref) => {
  const [actionPending, setActionPending] = useState(false);
  const loading = Boolean(isLoading || actionPending);

  const handleClick: React.MouseEventHandler<HTMLButtonElement> = (event) => {
    if (!onClick || loading) return;
    const result = (onClick as (event: React.MouseEvent<HTMLButtonElement>) => unknown)(event);
    if (result && typeof (result as PromiseLike<unknown>).then === "function") {
      setActionPending(true);
      Promise.resolve(result).finally(() => setActionPending(false));
    }
  };

  return (
    <MuiButton
      ref={ref}
      type={type}
      className={className}
      disabled={loading || disabled}
      onClick={handleClick}
      variant={variantForClass(className)}
      color={colorForClass(className)}
      size="small"
      loading={loading}
      loadingIndicator={<Loader2 className="animate-spin" size={16} />}
      {...props}
    >
      {children}
    </MuiButton>
  );
});
Button.displayName = "Button";
