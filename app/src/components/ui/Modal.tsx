import { X } from "lucide-react";
import { type ReactNode, useId, useState } from "react";
import Dialog from "@mui/material/Dialog";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import Box from "@mui/material/Box";
import IconButton from "@mui/material/IconButton";
import { useTranslation } from "react-i18next";
import { Button } from "./Button";

export function Modal({ title, onClose, maxWidth, actions, children }: Readonly<{ title: string | ReactNode; onClose: () => void; maxWidth?: number | string; actions?: ReactNode; children: ReactNode }>) {
  const { t } = useTranslation();
  const titleId = useId();
  return (
    <Dialog
      open
      onClose={onClose}
      aria-labelledby={titleId}
      fullWidth
      maxWidth={false}
      slotProps={{ paper: { className: "modalCard", sx: { width: "100%", maxWidth: maxWidth ?? 720 } } }}
    >
      <DialogTitle id={titleId} className="moduleHeader modalHeader" component="div">
        <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 2 }}>
          <h3>{title}</h3>
          <Box className="modalHeaderActions" sx={{ display: "flex", gap: 1, alignItems: "center" }}>
            {actions}
            <IconButton className="tableAction" type="button" aria-label={t("closeBtn")} onClick={onClose} size="small"><X size={16} /></IconButton>
          </Box>
        </Box>
      </DialogTitle>
      <DialogContent className="modalBody">{children}</DialogContent>
    </Dialog>
  );
}

export function FormModal({
  title,
  onClose,
  onSubmit,
  submitLabel,
  submitIcon,
  submitDisabled,
  error,
  maxWidth,
  children
}: Readonly<{
  title: string;
  onClose: () => void;
  onSubmit?: (e: React.FormEvent) => void | Promise<void>;
  submitLabel: string;
  submitIcon?: ReactNode;
  submitDisabled?: boolean;
  error?: string | null;
  maxWidth?: number | string;
  children: ReactNode;
}>) {
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (onSubmit) {
      setIsSubmitting(true);
      try {
        await onSubmit(e);
      } finally {
        setIsSubmitting(false);
      }
    }
  };

  return (
    <Modal title={title} onClose={onClose} maxWidth={maxWidth}>
      <form className="inlineForm formStack" onSubmit={handleSubmit}>
        {error && <p className="notice" style={{ color: "var(--rose)" }}>{error}</p>}
        {children}
        <div className="formActions">
          <Button className="primaryAction" type="submit" disabled={submitDisabled} isLoading={isSubmitting}>
            {submitIcon} {submitLabel}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
