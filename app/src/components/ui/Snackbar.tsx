import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AlertCircle, CheckCircle, Info, X } from "lucide-react";
import { useTranslation } from "react-i18next";

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

  return (
    <SnackbarContext.Provider value={value}>
      {children}
      <div className="snackbarContainer" aria-live="polite" aria-atomic="false">
        {items.map((item) => (
          <SnackbarToast key={item.id} item={item} onDismiss={dismiss} t={t} />
        ))}
      </div>
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
    <div className={`snackbarToast ${item.variant}`} role="status" aria-describedby={descriptionId}>
      <span className="snackbarIcon" aria-hidden="true">{icon}</span>
      <span id={descriptionId} className="snackbarMessage">{item.message}</span>
      {item.dismissible && (
        <button type="button" className="iconButton snackbarDismiss" aria-label={t("dismissLabel")} onClick={() => onDismiss(item.id)}>
          <X size={16} />
        </button>
      )}
    </div>
  );
}