import { useTranslation } from "react-i18next";
import { styled } from "@mui/material/styles";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";

/**
 * §E cross-cutting polish: a shared loading/error/empty-state trio so views
 * stop inventing their own (an audit found only 2/28 views handled loading
 * state at all — AttendanceBoard and RolloverWizard already had a good
 * pattern; this codifies it for reuse).
 */

export function LoadingState() {
  const { t } = useTranslation();
  return <LoadingContainer>{t("loadingLabel")}</LoadingContainer>;
}

export function ErrorState({ message }: Readonly<{ message: string }>) {
  if (!message) return null;
  return <ErrorContainer>{message}</ErrorContainer>;
}

export function EmptyState({ label }: Readonly<{ label: string }>) {
  return <EmptyStateContainer>{label}</EmptyStateContainer>;
}

/* ------------------------------------------------------------------ styled components */

export const LoadingContainer = styled(Box)(({ theme }) => ({
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: theme.spacing(3),
  color: theme.palette.text.secondary,
  fontSize: "0.875rem",
}));

export const ErrorContainer = styled(Box)(({ theme }) => ({
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: theme.spacing(3),
  color: theme.palette.error.main,
  fontSize: "0.875rem",
  fontWeight: 500,
}));

export const EmptyStateContainer = styled(Box)(({ theme }) => ({
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: theme.spacing(3),
  color: theme.palette.text.secondary,
  fontSize: "0.875rem",
}));
