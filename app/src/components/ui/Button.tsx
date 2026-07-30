import React, { useState } from "react";
import MuiButton from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import { styled, type SxProps } from "@mui/material/styles";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  isLoading?: boolean;
  variant?: "contained" | "outlined" | "text";
  color?: "primary" | "error" | "inherit" | "secondary" | "success" | "info" | "warning";
  sx?: SxProps;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(({ type = "button", isLoading, children, disabled, onClick, variant = "outlined", color = "primary", sx, ...props }, ref) => {
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
      disabled={loading || disabled}
      onClick={handleClick}
      variant={variant}
      color={color}
      size="small"
      loading={loading}
      loadingIndicator={<CircularProgress size={16} color="inherit" />}
      sx={sx}
      {...props}
    >
      {children}
    </MuiButton>
  );
});
Button.displayName = "Button";

/* ------------------------------------------------------------------ styled variants */

export const PrimaryButton = styled(MuiButton)(({ theme }) => ({
  backgroundColor: theme.palette.teal.main,
  color: theme.palette.teal.contrastText,
  "&:hover": {
    backgroundColor: theme.palette.teal.dark,
  },
  "&:disabled": {
    backgroundColor: theme.palette.action.disabledBackground,
    color: theme.palette.action.disabled,
  },
}));

export const SecondaryButton = styled(MuiButton)(({ theme }) => ({
  borderColor: theme.palette.divider,
  color: theme.palette.text.primary,
  "&:hover": {
    borderColor: theme.palette.primary.main,
    backgroundColor: theme.palette.action.hover,
  },
}));

export const DangerButton = styled(MuiButton)(({ theme }) => ({
  backgroundColor: theme.palette.error.main,
  color: theme.palette.error.contrastText,
  "&:hover": {
    backgroundColor: theme.palette.error.dark,
  },
  "&:disabled": {
    backgroundColor: theme.palette.action.disabledBackground,
    color: theme.palette.action.disabled,
  },
}));

export const IconButton = styled(MuiButton)(({ theme }) => ({
  minWidth: 44,
  minHeight: 44,
  padding: theme.spacing(1),
  color: theme.palette.text.secondary,
  "&:hover": {
    backgroundColor: theme.palette.action.hover,
    color: theme.palette.text.primary,
  },
}));

export const TableAction = styled(MuiButton)(({ theme }) => ({
  borderColor: theme.palette.divider,
  color: theme.palette.text.secondary,
  fontSize: "0.8rem",
  padding: theme.spacing(0.5, 1.5),
  minHeight: 32,
  "&:hover": {
    borderColor: theme.palette.primary.main,
    color: theme.palette.primary.main,
  },
}));

export const StatusButton = styled(MuiButton, {
  shouldForwardProp: (prop) => prop !== "active",
})<{ active?: boolean }>(({ theme, active }) => ({
  borderColor: active ? theme.palette.primary.main : theme.palette.divider,
  backgroundColor: active ? theme.palette.primary.main : "transparent",
  color: active ? theme.palette.primary.contrastText : theme.palette.text.secondary,
  "&:hover": {
    borderColor: theme.palette.primary.main,
    backgroundColor: active ? theme.palette.primary.dark : theme.palette.action.hover,
  },
}));
