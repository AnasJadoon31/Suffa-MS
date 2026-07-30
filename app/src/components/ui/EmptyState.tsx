import { type ReactNode } from "react";
import { styled } from "@mui/material/styles";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import { Inbox } from "lucide-react";

const EmptyStateContainer = styled(Box)(({ theme }) => ({
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  textAlign: "center",
  padding: theme.spacing(6, 3),
  minHeight: 280,
}));

const EmptyStateIcon = styled(Box)(({ theme }) => ({
  width: 72,
  height: 72,
  borderRadius: "50%",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  backgroundColor: theme.palette.mode === "dark" ? "#1a2925" : "#f2f4ef",
  color: theme.palette.text.secondary,
  marginBottom: theme.spacing(2),
}));

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
      <Typography variant="h6" sx={{ mb: 0.5, fontWeight: 600 }}>
        {title}
      </Typography>
      {message && (
        <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 320, mb: 2 }}>
          {message}
        </Typography>
      )}
      {action}
    </EmptyStateContainer>
  );
}
