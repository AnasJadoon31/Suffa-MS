import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import IconButton from "@mui/material/IconButton";
import ListItemIcon from "@mui/material/ListItemIcon";
import MenuItem from "@mui/material/MenuItem";
import MenuList from "@mui/material/MenuList";
import { MoreVertical } from "lucide-react";
import { useTranslation } from "react-i18next";
import { createPortal } from "react-dom";

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
  const [menuStyle, setMenuStyle] = useState<CSSProperties>();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLUListElement>(null);
  const menuId = useRef(`action-menu-${crypto.randomUUID()}`);
  const updateMenuPosition = useCallback(() => {
    const button = buttonRef.current;
    if (!button) return;
    const rect = button.getBoundingClientRect();
    const width = 180;
    const estimatedHeight = Math.min(Math.max(items.length * 36 + 12, 110), 320);
    const availableBelow = window.innerHeight - rect.bottom - 8;
    const availableAbove = rect.top - 8;
    const openAbove = availableBelow < estimatedHeight && availableAbove > availableBelow;
    setMenuStyle({
      position: "fixed",
      top: openAbove ? "auto" : Math.min(rect.bottom + 4, window.innerHeight - 8),
      bottom: openAbove ? Math.max(8, window.innerHeight - rect.top + 4) : "auto",
      left: Math.min(Math.max(8, rect.right - width), window.innerWidth - width - 8),
      width,
      maxHeight: Math.min(estimatedHeight, Math.max(120, openAbove ? availableAbove : availableBelow)),
      overflowY: "auto",
    });
  }, [items.length]);

  useEffect(() => {
    if (!isOpen) return;
    updateMenuPosition();
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!buttonRef.current?.contains(target) && !menuRef.current?.contains(target)) setIsOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsOpen(false);
    };
    const handleReposition = () => updateMenuPosition();
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    window.addEventListener("resize", handleReposition);
    window.addEventListener("scroll", handleReposition, true);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("resize", handleReposition);
      window.removeEventListener("scroll", handleReposition, true);
    };
  }, [isOpen, updateMenuPosition]);

  return (
    <div className="actionMenu">
      <IconButton
        ref={buttonRef}
        type="button"
        className="iconButton actionMenuTrigger"
        aria-label={ariaLabel ?? t("actionsCol")}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-controls={isOpen ? menuId.current : undefined}
        onClick={() => {
          updateMenuPosition();
          setIsOpen((open) => !open);
        }}
        size="small"
      >
        {children ?? <MoreVertical size={16} />}
      </IconButton>
      {isOpen && createPortal(<MenuList
        id={menuId.current}
        ref={menuRef}
        role="menu"
        className="actionMenuDropdown"
        style={menuStyle}
        sx={{
          listStyle: "none",
          p: 0.75,
          m: 0,
          border: 1,
          borderColor: "divider",
          borderRadius: 1,
          bgcolor: "background.paper",
          boxShadow: 8,
          zIndex: (theme) => theme.zIndex.modal + 1,
        }}
      >
        {items.map((item, index) => (
          <MenuItem
            key={index}
            className="actionMenuItem"
            dense
            disabled={item.disabled}
            sx={{ color: item.destructive ? "error.main" : "inherit", minHeight: 34, py: 0.5 }}
            onClick={() => {
              void item.onClick();
              setIsOpen(false);
            }}
          >
            {item.icon && <ListItemIcon sx={{ color: "inherit", minWidth: 32 }}>{item.icon}</ListItemIcon>}
            {item.label}
          </MenuItem>
        ))}
      </MenuList>, document.body)}
    </div>
  );
}
