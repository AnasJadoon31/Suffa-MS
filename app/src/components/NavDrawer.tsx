import { useState } from "react";
import { useTranslation } from "react-i18next";
import { NavLink, useLocation } from "react-router";
import { styled } from "@mui/material/styles";
import MuiDrawer from "@mui/material/Drawer";
import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemIcon from "@mui/material/ListItemIcon";
import ListItemText from "@mui/material/ListItemText";
import IconButton from "@mui/material/IconButton";
import Typography from "@mui/material/Typography";
import Collapse from "@mui/material/Collapse";
import { ChevronDown, ChevronRight, X } from "lucide-react";
import { isNavItemAccessible, navGroups, portalRoutes, resolveNavItemPath } from "../data/mockData";
import { useAuth } from "../lib/AuthContext";

const StyledDrawer = styled(MuiDrawer)(({ theme }) => ({
  "& .MuiDrawer-paper": {
    width: 300,
    maxWidth: "85vw",
    backgroundColor: theme.palette.background.paper,
  },
}));

const DrawerHeader = styled("div")(({ theme }) => ({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "12px 16px",
  borderBottom: `1px solid ${theme.palette.divider}`,
}));

const GroupHeader = styled(ListItem)(({ theme }) => ({
  paddingInline: 16,
  paddingTop: 12,
  paddingBottom: 4,
  cursor: "pointer",
  userSelect: "none",
  opacity: 0.7,
}));

const NavItemButton = styled(ListItemButton, {
  shouldForwardProp: (prop) => prop !== "isActive",
})<{ isActive: boolean }>(({ theme, isActive }) => ({
  borderRadius: 10,
  marginInline: 6,
  marginBottom: 2,
  paddingInline: 10,
  minHeight: 40,
  ...(isActive && {
    backgroundColor: theme.palette.teal?.light
      ? `${theme.palette.teal.light}22`
      : `${theme.palette.primary.main}15`,
    color: theme.palette.teal?.main ?? theme.palette.primary.main,
    "& .MuiListItemIcon-root": {
      color: theme.palette.teal?.main ?? theme.palette.primary.main,
    },
  }),
}));

const NavIcon = styled(ListItemIcon)({
  minWidth: 36,
  "& svg": {
    width: 18,
    height: 18,
  },
});

const NavLinkWrapper = styled(NavLink)({
  display: "block",
  textDecoration: "none",
  color: "inherit",
  "&.active": {
    color: "inherit",
  },
});

export type NavDrawerProps = Readonly<{
  open: boolean;
  onClose: () => void;
}>;

export function NavDrawer({ open, onClose }: NavDrawerProps) {
  const { t } = useTranslation();
  const location = useLocation();
  const activeView = portalRoutes.find((route) => route.path === location.pathname)?.view;
  const { hasPermission, hasFeature, user, madrasa } = useAuth();
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

  const toggleGroup = (labelKey: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(labelKey)) {
        next.delete(labelKey);
      } else {
        next.add(labelKey);
      }
      return next;
    });
  };

  return (
    <StyledDrawer
      anchor="left"
      open={open}
      onClose={onClose}
      role="navigation"
      aria-label={t("primaryNavigationLabel")}
    >
      <DrawerHeader>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 32,
              height: 32,
              borderRadius: 8,
              backgroundColor: "var(--mui-palette-teal-main, #0f766e)",
              color: "#fff",
              fontSize: "1rem",
              fontWeight: 700,
            }}
          >
            {madrasa?.name?.[0]?.toUpperCase() ?? "م"}
          </span>
          <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
            {madrasa?.name || t("appName")}
          </Typography>
        </div>
        <IconButton size="small" onClick={onClose} aria-label="Close menu">
          <X size={18} />
        </IconButton>
      </DrawerHeader>

      <List sx={{ flex: 1, overflowY: "auto", py: 1, px: 0 }}>
        {navGroups.map((group) => {
          const visible = group.items.filter(
            (item) => isNavItemAccessible(item, user?.role, hasPermission, hasFeature, user?.has_teaching_assignment, user?.is_principal_delegate),
          );
          if (visible.length === 0) return null;

          const isGroupActive = visible.some((item) => {
            const itemPath = resolveNavItemPath(item, user?.role, hasPermission, hasFeature, user?.has_teaching_assignment, user?.is_principal_delegate);
            return location.pathname.startsWith(itemPath) || activeView === item.id;
          });
          const isCollapsed = !isGroupActive && collapsedGroups.has(group.labelKey);

          return (
            <div key={group.labelKey}>
              <GroupHeader onClick={() => toggleGroup(group.labelKey)}>
                <ListItemText
                  primary={
                    <Typography variant="caption" sx={{ fontWeight: 600, letterSpacing: "0.05em", textTransform: "uppercase" }}>
                      {t(group.labelKey)}
                    </Typography>
                  }
                />
                {isCollapsed ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
              </GroupHeader>
              <Collapse in={!isCollapsed} timeout="auto" unmountOnExit={false}>
                {visible.map((item) => {
                  const Icon = item.icon;
                  const isActive = activeView === item.id;
                  const path = resolveNavItemPath(item, user?.role, hasPermission, hasFeature, user?.has_teaching_assignment, user?.is_principal_delegate);

                  return (
                    <ListItem key={item.id} disablePadding sx={{ px: 0 }}>
                      <NavLinkWrapper to={path} onClick={onClose}>
                        <NavItemButton isActive={isActive}>
                          <NavIcon>
                            <Icon size={18} />
                          </NavIcon>
                          <ListItemText
                            primary={
                              <Typography variant="body2" sx={{ fontWeight: isActive ? 600 : 400 }}>
                                {t(item.labelKey)}
                              </Typography>
                            }
                          />
                        </NavItemButton>
                      </NavLinkWrapper>
                    </ListItem>
                  );
                })}
              </Collapse>
            </div>
          );
        })}
      </List>
    </StyledDrawer>
  );
}
