import { useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronDown, MoreVertical } from "lucide-react";
import { useTranslation } from "react-i18next";

export interface ActionMenuItem {
  label: string;
  icon?: ReactNode;
  onClick: () => void;
  destructive?: boolean;
  disabled?: boolean;
}

export interface ActionMenuProps {
  items: ActionMenuItem[];
  ariaLabel?: string;
  children?: ReactNode;
}

export function ActionMenu({ items, ariaLabel, children }: Readonly<ActionMenuProps>) {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [activeIndex, setActiveIndex] = useState(-1);

  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) setActiveIndex(-1);
  }, [isOpen]);

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (!isOpen) {
      if (event.key === "Enter" || event.key === " " || event.key === "ArrowDown") {
        event.preventDefault();
        setIsOpen(true);
      }
      return;
    }
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        setActiveIndex((i) => (i + 1) % items.length);
        break;
      case "ArrowUp":
        event.preventDefault();
        setActiveIndex((i) => (i - 1 + items.length) % items.length);
        break;
      case "Enter":
      case " ":
        event.preventDefault();
        if (activeIndex >= 0 && activeIndex < items.length) {
          items[activeIndex].onClick();
          setIsOpen(false);
        }
        break;
      case "Escape":
        event.preventDefault();
        setIsOpen(false);
        buttonRef.current?.focus();
        break;
      case "Tab":
        setIsOpen(false);
        break;
    }
  };

  return (
    <div className="actionMenu" ref={menuRef}>
      <button
        ref={buttonRef}
        type="button"
        className="iconButton actionMenuTrigger"
        aria-label={ariaLabel ?? t("actionsCol")}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((v) => !v)}
        onKeyDown={handleKeyDown}
      >
        {children ?? <MoreVertical size={16} />}
      </button>
      {isOpen && (
        <ul className="actionMenuDropdown" role="menu" aria-orientation="vertical">
          {items.map((item, index) => (
            <li key={index} role="none">
              <button
                type="button"
                role="menuitem"
                className={`actionMenuItem${item.destructive ? " destructive" : ""}${item.disabled ? " disabled" : ""}`}
                disabled={item.disabled}
                tabIndex={activeIndex === index ? 0 : -1}
                onClick={() => {
                  item.onClick();
                  setIsOpen(false);
                }}
                onFocus={() => setActiveIndex(index)}
              >
                {item.icon && <span className="actionMenuIcon">{item.icon}</span>}
                <span>{item.label}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}