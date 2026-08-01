import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AlertCircle, CheckCircle, Info, X } from "lucide-react";
import { IconButton } from "./Mui";
import { styled } from "@mui/material/styles";
import { Box } from "./Mui";
import { useTranslation } from "react-i18next";
import { API_NOTIFICATION_EVENT, type ApiNotificationDetail } from "../../lib/apiNotifications";

type SnackbarVariant = "success" | "error" | "warning" | "info";

interface SnackbarItem {
  id: number;
  message: string;
  variant: SnackbarVariant;
  duration: number;
  dismissible: boolean;
}

interface SnackbarContextType {
  show: (message: string, options?: { variant?: SnackbarVariant; duration?: number; dismissible?: boolean }) => void;
  success: (message: string, options?: { duration?: number; dismissible?: boolean }) => void;
  error: (message: string, options?: { duration?: number; dismissible?: boolean }) => void;
  warning: (message: string, options?: { duration?: number; dismissible?: boolean }) => void;
  info: (message: string, options?: { duration?: number; dismissible?: boolean }) => void;
}

const SnackbarContext = createContext<SnackbarContextType | null>(null);

export function useSnackbar() {
  const context = useContext(SnackbarContext);
  if (!context) throw new Error("useSnackbar must be used within SnackbarProvider");
  return context;
}

const DEFAULT_DURATION = 5000;
const MAX_QUEUE = 5;

export function SnackbarProvider({ children }: Readonly<{ children: ReactNode }>) {
  const { t } = useTranslation();
  const [items, setItems] = useState<SnackbarItem[]>([]);
  const nextId = useRef(0);

  const dismiss = useCallback((id: number) => {
    setItems((current) => current.filter((item) => item.id !== id));
  }, []);

  const show = useCallback(
    (message: string, options: { variant?: SnackbarVariant; duration?: number; dismissible?: boolean } = {}) => {
      const id = nextId.current++;
      const variant = options.variant ?? "info";
      const duration = options.duration ?? DEFAULT_DURATION;
      const dismissible = options.dismissible ?? true;
      setItems((current) => [...current.slice(-(MAX_QUEUE - 1)), { id, message, variant, duration, dismissible }]);
      if (duration > 0) {
        setTimeout(() => dismiss(id), duration);
      }
    },
    [dismiss]
  );

  const value = useMemo<SnackbarContextType>(
    () => ({
      show,
      success: (message, options) => show(message, { ...options, variant: "success" }),
      error: (message, options) => show(message, { ...options, variant: "error" }),
      warning: (message, options) => show(message, { ...options, variant: "warning" }),
      info: (message, options) => show(message, { ...options, variant: "info" }),
    }),
    [show]
  );

  useEffect(() => {
    const handleNotification = (event: Event) => {
      const detail = (event as CustomEvent<ApiNotificationDetail>).detail;
      if (!detail) return;
      show(detail.message ?? (detail.messageKey ? t(detail.messageKey) : ""), { variant: detail.variant });
    };
    window.addEventListener(API_NOTIFICATION_EVENT, handleNotification);
    return () => window.removeEventListener(API_NOTIFICATION_EVENT, handleNotification);
  }, [show, t]);

  return (
    <SnackbarContext.Provider value={value}>
      {children}
      <SnackbarContainer className="snackbarContainer" aria-live="polite" aria-atomic="false">
        {items.map((item) => (
          <SnackbarToast key={item.id} item={item} onDismiss={dismiss} t={t} />
        ))}
      </SnackbarContainer>
    </SnackbarContext.Provider>
  );
}

function SnackbarToast({
  item,
  onDismiss,
  t,
}: Readonly<{ item: SnackbarItem; onDismiss: (id: number) => void; t: (key: string) => string }>) {
  const descriptionId = `snackbar-${item.id}-desc`;
  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onDismiss(item.id);
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [item.id, onDismiss]);

  const icon = {
    success: <CheckCircle size={18} />,
    error: <AlertCircle size={18} />,
    warning: <AlertCircle size={18} />,
    info: <Info size={18} />,
  }[item.variant];

  return (
    <SnackbarToastRoot className={`snackbarToast ${item.variant}`} variant={item.variant} role="status" aria-describedby={descriptionId}>
      <Box aria-hidden="true" sx={{ display: "flex", alignItems: "center" }}>{icon}</Box>
      <Box id={descriptionId} component="span" sx={{ flex: 1 }}>{item.message}</Box>
      {item.dismissible && (
        <IconButton className="snackbarDismiss" type="button" aria-label={t("dismissLabel")} onClick={() => onDismiss(item.id)} size="small">
          <X size={16} />
        </IconButton>
      )}
    </SnackbarToastRoot>
  );
}

/* ------------------------------------------------------------------ styled components */

export const SnackbarContainer = styled(Box)(({ theme }) => ({
  position: "fixed",
  bottom: theme.spacing(2),
  left: "50%",
  transform: "translateX(-50%)",
  display: "flex",
  flexDirection: "column",
  gap: theme.spacing(1),
  zIndex: theme.zIndex.snackbar,
  maxWidth: "90vw",
  width: 400,
}));

export const SnackbarToastRoot = styled(Box, {
  shouldForwardProp: (prop) => prop !== "variant",
})<{ variant: SnackbarVariant }>(({ theme, variant }) => {
  const variantColors = {
    success: { bg: theme.palette.success.main, text: theme.palette.success.contrastText },
    error: { bg: theme.palette.error.main, text: theme.palette.error.contrastText },
    warning: { bg: theme.palette.warning.main, text: theme.palette.warning.contrastText },
    info: { bg: theme.palette.grey[800], text: theme.palette.grey[50] },
  }[variant];

  return {
    display: "flex",
    alignItems: "center",
    gap: theme.spacing(1.5),
    padding: theme.spacing(1.5, 2),
    borderRadius: 12,
    backgroundColor: variantColors.bg,
    color: variantColors.text,
    fontSize: "0.875rem",
    fontWeight: 500,
    boxShadow: theme.shadows[8],
  };
});
