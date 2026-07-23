import React, { createContext, useContext, useState, ReactNode } from "react";
import { Modal } from "../components/ui/Modal";
import { Button } from "../components/ui/Button";
import { useTranslation } from "react-i18next";

type DialogType = "alert" | "confirm" | "warning" | "prompt";

type DialogOptions = {
  title?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  targetName?: string;
  placeholder?: string;
  inputType?: string;
  defaultValue?: string;
  blockedMessage?: string;
};

type DialogContextType = {
  alert: (message: string, options?: DialogOptions) => Promise<void>;
  confirm: (message: string, options?: DialogOptions) => Promise<boolean>;
  warning: (message: string, options?: DialogOptions) => Promise<boolean>;
  prompt: (message: string, options?: DialogOptions) => Promise<string | null>;
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
    type: DialogType;
    message: string;
    options: DialogOptions;
    resolve: (value: boolean | string | null | void) => void;
  } | null>(null);
  const [promptValue, setPromptValue] = useState("");

  const alert = (message: string, options?: DialogOptions) => {
    return new Promise<void>((resolve) => {
      setDialogState({
        isOpen: true,
        type: "alert",
        message,
        options: options || {},
        resolve: resolve as (value: boolean | string | null | void) => void,
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
        resolve: resolve as (value: boolean | string | null | void) => void,
      });
    });
  };

  const warning = (message: string, options?: DialogOptions) => {
    return new Promise<boolean>((resolve) => {
      setDialogState({
        isOpen: true,
        type: "warning",
        message,
        options: options || {},
        resolve: resolve as (value: boolean | string | null | void) => void,
      });
    });
  };

  const prompt = (message: string, options?: DialogOptions) => {
    return new Promise<string | null>((resolve) => {
      setPromptValue(options?.defaultValue ?? "");
      setDialogState({
        isOpen: true,
        type: "prompt",
        message,
        options: options || {},
        resolve: resolve as (value: boolean | string | null | void) => void,
      });
    });
  };

  const handleClose = (value: boolean | string | void) => {
    if (dialogState) {
      const type = dialogState.type;
      if (type === "confirm" || type === "warning") {
        dialogState.resolve(value === true);
      } else if (type === "prompt") {
        dialogState.resolve(typeof value === "string" ? value : null);
      } else {
        dialogState.resolve(undefined);
      }
      setDialogState(null);
    }
  };

  const isDestructive = dialogState?.options.destructive;
  const targetType = dialogState?.type;
  const titleKey =
    targetType === "alert" ? "dialogNoticeTitle"
    : targetType === "warning" ? "dialogWarningTitle"
    : targetType === "prompt" ? "dialogPromptTitle"
    : "dialogConfirmTitle";

  return (
    <DialogContext.Provider value={{ alert, confirm, warning, prompt }}>
      {children}
      {dialogState?.isOpen && (
        <Modal
          title={dialogState.options.title || t(titleKey)}
          onClose={() => handleClose(false)}
        >
          <div style={{ padding: "0", display: "flex", flexDirection: "column", gap: "1.5rem" }}>
            <p style={{ margin: 0, fontSize: "1rem", lineHeight: 1.5, color: "var(--foreground)" }}>
              {dialogState.options.targetName && (
                <strong style={{ display: "block", marginBottom: 4 }}>{dialogState.options.targetName}</strong>
              )}
              {dialogState.message}
            </p>
            {dialogState.type === "prompt" && (
              <input
                type={dialogState.options.inputType ?? "text"}
                className="input"
                placeholder={dialogState.options.placeholder}
                value={promptValue}
                onChange={(e) => setPromptValue(e.target.value)}
                style={{ width: "100%", padding: "0.5rem", borderRadius: 6, border: "1px solid var(--border)" }}
              />
            )}
            {dialogState.options.blockedMessage && (
              <p style={{ margin: 0, fontSize: "0.85rem", color: "var(--muted)" }}>
                {dialogState.options.blockedMessage}
              </p>
            )}
            <div className="formActions" style={{ justifyContent: "flex-end" }}>
              {dialogState.type !== "alert" && (
                <Button type="button" onClick={() => handleClose(false)}>
                  {dialogState.options.cancelLabel || t("cancelBtn")}
                </Button>
              )}
              <Button
                type="button"
                className={isDestructive ? "dangerAction" : "primaryAction"}
                onClick={() => handleClose(dialogState.type === "prompt" ? promptValue : true)}
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
