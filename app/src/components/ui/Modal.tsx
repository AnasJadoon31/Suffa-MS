import { X } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "./Button";

export function Modal({ title, onClose, children }: Readonly<{ title: string; onClose: () => void; children: ReactNode }>) {
  const { t } = useTranslation();
  return (
    <div className="modalOverlay" role="dialog" aria-modal="true" aria-label={title} onMouseDown={onClose}>
      <div className="modalCard" onMouseDown={(event) => event.stopPropagation()}>
        <div className="moduleHeader modalHeader">
          <h3>{title}</h3>
          <Button className="tableAction" type="button" aria-label={t("closeBtn")} onClick={onClose}><X size={16} /></Button>
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
  children
}: Readonly<{
  title: string;
  onClose: () => void;
  onSubmit?: (e: React.FormEvent) => void | Promise<void>;
  submitLabel: string;
  submitIcon?: ReactNode;
  submitDisabled?: boolean;
  error?: string | null;
  children: ReactNode;
}>) {
  return (
    <Modal title={title} onClose={onClose}>
      <form className="inlineForm" onSubmit={onSubmit}>
        {error && <p className="notice" style={{ color: "var(--rose)" }}>{error}</p>}
        {children}
        <div className="formActions">
          <Button className="primaryAction" type="submit" disabled={submitDisabled}>
            {submitIcon} {submitLabel}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
