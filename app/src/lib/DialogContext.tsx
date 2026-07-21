import React, { createContext, useContext, useState, ReactNode } from "react";
import { Modal } from "../components/ui/Modal";
import { Button } from "../components/ui/Button";
import { useTranslation } from "react-i18next";

type DialogOptions = {
  title?: string;
  confirmLabel?: string;
  cancelLabel?: string;
};

type DialogContextType = {
  alert: (message: string, options?: DialogOptions) => Promise<void>;
  confirm: (message: string, options?: DialogOptions) => Promise<boolean>;
};

const DialogContext = createContext<DialogContextType | null>(null);

export function useDialog() {
  const context = useContext(DialogContext);
  if (!context) {
    throw new Error("useDialog must be used within a DialogProvider");
  }
  return context;
}

export function DialogProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const [dialogState, setDialogState] = useState<{
    isOpen: boolean;
    type: "alert" | "confirm";
    message: string;
    options: DialogOptions;
    resolve: (value: boolean | void) => void;
  } | null>(null);

  const alert = (message: string, options?: DialogOptions) => {
    return new Promise<void>((resolve) => {
      setDialogState({
        isOpen: true,
        type: "alert",
        message,
        options: options || {},
        resolve: resolve as (value: boolean | void) => void,
      });
    });
  };

  const confirm = (message: string, options?: DialogOptions) => {
    return new Promise<boolean>((resolve) => {
      setDialogState({
        isOpen: true,
        type: "confirm",
        message,
        options: options || {},
        resolve: resolve as (value: boolean | void) => void,
      });
    });
  };

  const handleClose = (value: boolean) => {
    if (dialogState) {
      dialogState.resolve(dialogState.type === "confirm" ? value : undefined);
      setDialogState(null);
    }
  };

  return (
    <DialogContext.Provider value={{ alert, confirm }}>
      {children}
      {dialogState?.isOpen && (
        <Modal
          title={dialogState.options.title || (dialogState.type === "alert" ? t("dialogNoticeTitle") : t("dialogConfirmTitle"))}
          onClose={() => handleClose(false)}
        >
          <div style={{ padding: "0", display: "flex", flexDirection: "column", gap: "1.5rem" }}>
            <p style={{ margin: 0, fontSize: "1rem", lineHeight: 1.5, color: "var(--foreground)" }}>
              {dialogState.message}
            </p>
            <div className="formActions" style={{ justifyContent: "flex-end" }}>
              {dialogState.type === "confirm" && (
                <Button type="button" onClick={() => handleClose(false)}>
                  {dialogState.options.cancelLabel || t("cancelBtn")}
                </Button>
              )}
              <Button
                className="primaryAction"
                type="button"
                onClick={() => handleClose(true)}
              >
                {dialogState.options.confirmLabel || t("okBtn")}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </DialogContext.Provider>
  );
}
