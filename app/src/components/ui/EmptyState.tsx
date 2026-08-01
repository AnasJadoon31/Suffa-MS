import { type ReactNode } from "react";
import { styled } from "@mui/material/styles";
import { Box } from "./Mui";
import { Typography } from "./Mui";
import { Inbox } from "lucide-react";

export function EmptyState({
  icon,
  title,
  message,
  action,
}: {
  icon?: ReactNode;
  title: string;
  message?: string;
  action?: ReactNode;
}) {
  return (
    <EmptyStateContainer>
      <EmptyStateIcon>{icon ?? <Inbox size={32} />}</EmptyStateIcon>
      <EmptyStateTitle>{title}</EmptyStateTitle>
      {message && (
        <EmptyStateMessage>{message}</EmptyStateMessage>
      )}
      {action}
    </EmptyStateContainer>
  );
}

/* ------------------------------------------------------------------ styled components */

export const EmptyStateContainer = styled(Box)(({ theme }) => ({
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  textAlign: "center",
  padding: theme.spacing(6, 3),
  minHeight: 280,
}));

export const EmptyStateIcon = styled(Box)(({ theme }) => ({
  width: 72,
  height: 72,
  borderRadius: "50%",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  backgroundColor: theme.palette.mode === "dark" ? theme.palette.background.paper : theme.palette.background.default,
  color: theme.palette.text.secondary,
  marginBottom: theme.spacing(2),
}));

export const EmptyStateTitle = styled(Typography)(({ theme }) => ({
  marginBottom: theme.spacing(0.5),
  fontWeight: 600,
  color: theme.palette.text.primary,
}));

export const EmptyStateMessage = styled(Typography)(({ theme }) => ({
  maxWidth: 320,
  marginBottom: theme.spacing(2),
  color: theme.palette.text.secondary,
}));
