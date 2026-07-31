import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import IconButton from "@mui/material/IconButton";
import ListItemIcon from "@mui/material/ListItemIcon";
import MenuItem from "@mui/material/MenuItem";
import MenuList from "@mui/material/MenuList";
import { MoreVertical } from "lucide-react";
import { styled } from "@mui/material/styles";
import Box from "@mui/material/Box";
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
  inlineThreshold?: number;
}

export function ActionMenu({ items, ariaLabel, children, inlineThreshold = 2 }: Readonly<ActionMenuProps>) {
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

  if (items.length <= inlineThreshold) {
    return (
      <ActionMenuWrapper>
        {items.map((item, index) => (
          <IconButton
            key={index}
            type="button"
            aria-label={item.label}
            disabled={item.disabled}
            onClick={() => void item.onClick()}
            sx={{
              width: 44,
              height: 44,
              color: item.destructive ? "error.main" : "text.secondary",
              "&:hover": {
                backgroundColor: item.destructive ? "error.light" : "action.hover",
                color: item.destructive ? "error.dark" : "text.primary",
              },
            }}
          >
            {item.icon ?? <MoreVertical size={16} />}
          </IconButton>
        ))}
      </ActionMenuWrapper>
    );
  }

  return (
    <ActionMenuWrapper>
      <ActionMenuTrigger
        ref={buttonRef}
        type="button"
        aria-label={ariaLabel ?? t("actionsCol")}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-controls={isOpen ? menuId.current : undefined}
        onClick={() => {
          updateMenuPosition();
          setIsOpen((open) => !open);
        }}
      >
        {children ?? <MoreVertical size={16} />}
      </ActionMenuTrigger>
      {isOpen && createPortal(<ActionMenuDropdown
        id={menuId.current}
        ref={menuRef}
        role="menu"
        style={menuStyle}
      >
        {items.map((item, index) => (
          <ActionMenuItemStyled
            key={index}
            destructive={item.destructive}
            disabled={item.disabled}
            onClick={() => {
              void item.onClick();
              setIsOpen(false);
            }}
          >
            {item.icon && <ListItemIcon sx={{ color: "inherit", minWidth: 32 }}>{item.icon}</ListItemIcon>}
            {item.label}
          </ActionMenuItemStyled>
        ))}
      </ActionMenuDropdown>, document.body)}
    </ActionMenuWrapper>
  );
}

/* ------------------------------------------------------------------ styled components */

const ActionMenuWrapper = styled(Box)({
  display: "inline-flex",
  position: "relative",
});

export const ActionMenuTrigger = styled(IconButton)(({ theme }) => ({
  width: 44,
  height: 44,
  color: theme.palette.text.secondary,
  "&:hover": {
    backgroundColor: theme.palette.action.hover,
    color: theme.palette.text.primary,
  },
}));

export const ActionMenuDropdown = styled(MenuList)(({ theme }) => ({
  listStyle: "none",
  padding: theme.spacing(0.75),
  margin: 0,
  border: `1px solid ${theme.palette.divider}`,
  borderRadius: 12,
  backgroundColor: theme.palette.background.paper,
  boxShadow: theme.shadows[8],
  zIndex: theme.zIndex.modal + 1,
}));

export const ActionMenuItemStyled = styled(MenuItem, {
  shouldForwardProp: (prop) => prop !== "destructive",
})<{ destructive?: boolean }>(({ theme, destructive }) => ({
  color: destructive ? theme.palette.error.main : "inherit",
  minHeight: 44,
  padding: theme.spacing(1, 1.5),
  borderRadius: 8,
  "&:hover": {
    backgroundColor: destructive ? theme.palette.error.light : theme.palette.action.hover,
  },
}));
