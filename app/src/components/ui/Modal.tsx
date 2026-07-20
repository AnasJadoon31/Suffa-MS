import { X } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

export function Modal({ title, onClose, children }: Readonly<{ title: string; onClose: () => void; children: ReactNode }>) {
  const { t } = useTranslation();
  return (
    <div className="modalOverlay" role="dialog" aria-modal="true" aria-label={title} onMouseDown={onClose}>
      <div className="modalCard" onMouseDown={(event) => event.stopPropagation()}>
        <div className="moduleHeader modalHeader">
          <h3>{title}</h3>
          <button className="tableAction" type="button" aria-label={t("closeBtn")} onClick={onClose}><X size={16} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}
