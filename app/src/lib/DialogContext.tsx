import React, { createContext, useContext, useState, ReactNode } from "react";
import { Modal } from "../components/ui/Modal";
import { Button, PrimaryButton, DangerButton } from "../components/ui/Button";
import { Input } from "../components/ui/Field";
import { Box } from "../components/ui/Mui";
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
          <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <Box component="p" sx={{ margin: 0, fontSize: "1rem", lineHeight: 1.5 }}>
              {dialogState.options.targetName && (
                <Box component="strong" sx={{ display: "block", mb: 1 }}>{dialogState.options.targetName}</Box>
              )}
              {dialogState.message}
            </Box>
            {dialogState.type === "prompt" && (
              <Input
                type={dialogState.options.inputType ?? "text"}
                placeholder={dialogState.options.placeholder}
                value={promptValue}
                onChange={(e) => setPromptValue(e.target.value)}
              />
            )}
            {dialogState.options.blockedMessage && (
              <Box component="p" sx={{ margin: 0, fontSize: "0.85rem", color: "text.secondary" }}>
                {dialogState.options.blockedMessage}
              </Box>
            )}
            <Box sx={{ display: "flex", justifyContent: "flex-end", gap: 1 }}>
              {dialogState.type !== "alert" && (
                <Button type="button" onClick={() => handleClose(false)}>
                  {dialogState.options.cancelLabel || t("cancelBtn")}
                </Button>
              )}
              {isDestructive ? (
                <DangerButton
                  type="button"
                  onClick={() => handleClose(dialogState.type === "prompt" ? promptValue : true)}
                >
                  {dialogState.options.confirmLabel || t("okBtn")}
                </DangerButton>
              ) : (
                <PrimaryButton
                  type="button"
                  onClick={() => handleClose(dialogState.type === "prompt" ? promptValue : true)}
                >
                  {dialogState.options.confirmLabel || t("okBtn")}
                </PrimaryButton>
              )}
            </Box>
          </Box>
        </Modal>
      )}
    </DialogContext.Provider>
  );
}
