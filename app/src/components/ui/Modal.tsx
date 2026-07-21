import { X } from "lucide-react";
import { type ReactNode, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "./Button";

export function Modal({ title, onClose, maxWidth, actions, children }: Readonly<{ title: string | ReactNode; onClose: () => void; maxWidth?: number | string; actions?: ReactNode; children: ReactNode }>) {
  const { t } = useTranslation();
  return (
    <div className="modalOverlay" role="dialog" aria-modal="true" aria-label={typeof title === "string" ? title : undefined} onMouseDown={onClose}>
      <div className="modalCard" style={maxWidth ? { width: "100%", maxWidth } : {}} onMouseDown={(event) => event.stopPropagation()}>
        <div className="moduleHeader modalHeader">
          <h3>{title}</h3>
          <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            {actions}
            <Button className="tableAction" type="button" aria-label={t("closeBtn")} onClick={onClose}><X size={16} /></Button>
          </div>
        </div>
        {children}
      </div>
    </div>
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
      <form className="inlineForm" onSubmit={handleSubmit}>
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
