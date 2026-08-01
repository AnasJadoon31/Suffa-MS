import { useState } from "react";
import { useTranslation } from "react-i18next";
import { NavLink, useLocation } from "react-router";
import { styled } from "@mui/material/styles";
import { Drawer as MuiDrawer } from "./ui/Mui";
import { List } from "./ui/Mui";
import { ListItem } from "./ui/Mui";
import { ListItemButton } from "./ui/Mui";
import { ListItemIcon } from "./ui/Mui";
import { ListItemText } from "./ui/Mui";
import { IconButton } from "./ui/Mui";
import { Typography } from "./ui/Mui";
import { Collapse } from "./ui/Mui";
import { Avatar } from "./ui/Mui";
import { Divider } from "./ui/Mui";
import { ChevronDown, ChevronRight, LogOut, X } from "lucide-react";
import { isNavItemAccessible, navGroups, portalRoutes, resolveNavItemPath } from "../data/mockData";
import { useAuth } from "../lib/AuthContext";
import { RoleBadge, initialsOf } from "./Sidebar";
import { PWA_TOUCH_TARGET } from "./ui/Layout";

const StyledDrawer = styled(MuiDrawer)(({ theme }) => ({
  "& .MuiDrawer-paper": {
    width: 320,
    maxWidth: "88vw",
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
  borderRadius: 0,
  marginInline: 0,
  marginBottom: 0,
  paddingInline: 16,
  minHeight: PWA_TOUCH_TARGET,
  width: "100%",
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
  width: "100%",
  "&.active": {
    color: "inherit",
  },
});

const BrandLogo = styled("span")(({ theme }) => ({
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  width: 32,
  height: 32,
  borderRadius: 8,
  backgroundColor: theme.palette.teal?.main ?? theme.palette.primary.main,
  color: theme.palette.teal?.contrastText ?? theme.palette.primary.contrastText,
  fontSize: "1rem",
  fontWeight: 700,
}));

const BrandInfo = styled("div")({
  display: "flex",
  alignItems: "center",
  gap: 10,
});

const ProfileArea = styled("div")(({ theme }) => ({
  display: "flex",
  alignItems: "center",
  gap: 10,
  padding: "12px 16px",
  borderTop: `1px solid ${theme.palette.divider}`,
}));

export type NavDrawerProps = Readonly<{
  open: boolean;
  onClose: () => void;
}>;

export function NavDrawer({ open, onClose }: NavDrawerProps) {
  const { t, i18n } = useTranslation();
  const location = useLocation();
  const activeView = portalRoutes.find((route) => route.path === location.pathname)?.view;
  const { hasPermission, hasFeature, user, madrasa, logout } = useAuth();
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
      anchor={i18n.dir() === "rtl" ? "right" : "left"}
      open={open}
      onClose={onClose}
      role="navigation"
      aria-label={t("primaryNavigationLabel")}
      slotProps={{ paper: { className: `sidebar${open ? " sidebarOpen" : ""}` } }}
    >
      <DrawerHeader>
        <BrandInfo>
          <BrandLogo>
            {madrasa?.name?.[0]?.toUpperCase() ?? "م"}
          </BrandLogo>
          <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
            {madrasa?.name || t("appName")}
          </Typography>
        </BrandInfo>
        <IconButton sx={{ width: PWA_TOUCH_TARGET, height: PWA_TOUCH_TARGET }} onClick={onClose} aria-label={t("closeBtn")}>
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
                    <ListItem key={item.id} disablePadding sx={{ px: 0, width: "100%" }}>
                      <NavLinkWrapper to={path} onClick={onClose}>
                        <NavItemButton className="navItem" isActive={isActive}>
                          <NavIcon>
                            <Icon size={18} />
                          </NavIcon>
                          <ListItemText
                            primary={
                              <Typography component="span" variant="body2" sx={{ fontWeight: isActive ? 600 : 400 }}>
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

      {user && (
        <>
          <Divider />
          <ProfileArea>
            <Avatar
              sx={{
                width: 32,
                height: 32,
                fontSize: "0.75rem",
                fontWeight: 600,
                bgcolor: "teal.main",
                color: "teal.contrastText",
                flexShrink: 0,
              }}
            >
              {initialsOf(user.username)}
            </Avatar>
            <Typography variant="body2" sx={{ fontWeight: 600, flex: 1 }} noWrap>
              {user.username}
            </Typography>
            <RoleBadge role={user.role} />
            <IconButton
              onClick={logout}
              aria-label={t("logout")}
              title={t("logout")}
              sx={{ flexShrink: 0 }}
            >
              <LogOut size={16} />
            </IconButton>
          </ProfileArea>
        </>
      )}
    </StyledDrawer>
  );
}
