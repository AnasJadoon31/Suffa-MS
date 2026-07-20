import { X } from "lucide-react";
import type { ReactNode } from "react";

export function Modal({ title, onClose, children }: Readonly<{ title: string; onClose: () => void; children: ReactNode }>) {
  return (
    <div className="modalOverlay" role="dialog" aria-modal="true" aria-label={title} onMouseDown={onClose}>
      <div className="modalCard" onMouseDown={(event) => event.stopPropagation()}>
        <div className="moduleHeader modalHeader">
          <h3>{title}</h3>
          <button className="tableAction" type="button" aria-label="Close" onClick={onClose}><X size={16} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}
