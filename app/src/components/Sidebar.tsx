import { useState } from "react";
import { useTranslation } from "react-i18next";
import { NavLink, useLocation } from "react-router";
import { styled } from "@mui/material/styles";
import Box from "@mui/material/Box";
import Drawer from "@mui/material/Drawer";
import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemIcon from "@mui/material/ListItemIcon";
import ListItemText from "@mui/material/ListItemText";
import IconButton from "@mui/material/IconButton";
import Avatar from "@mui/material/Avatar";
import Typography from "@mui/material/Typography";
import Collapse from "@mui/material/Collapse";
import Tooltip from "@mui/material/Tooltip";
import { LogOut, ChevronDown, ChevronRight } from "lucide-react";
import { isNavItemAccessible, navGroups, portalRoutes, resolveNavItemPath } from "../data/mockData";
import { useAuth } from "../lib/AuthContext";

const DRAWER_WIDTH = 240;
const COLLAPSED_WIDTH = 60;

const StyledDrawer = styled(Drawer)(({ theme }) => ({
  display: "none",
  [theme.breakpoints.up(768)]: {
    display: "block",
  },
  "& .MuiDrawer-paper": {
    borderRight: `1px solid ${theme.palette.divider}`,
    backgroundColor: theme.palette.background.paper,
    overflowX: "hidden",
  },
}));

const BrandArea = styled("div")(({ theme }) => ({
  display: "flex",
  alignItems: "center",
  gap: 10,
  padding: "16px 14px",
  borderBottom: `1px solid ${theme.palette.divider}`,
}));

const BrandLogo = styled("span")(({ theme }) => ({
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  width: 36,
  height: 36,
  borderRadius: 10,
  backgroundColor: theme.palette.teal?.main ?? theme.palette.primary.main,
  color: theme.palette.teal?.contrastText ?? theme.palette.primary.contrastText,
  fontSize: "1.1rem",
  fontWeight: 700,
  flexShrink: 0,
}));

const NavItemButton = styled(ListItemButton, {
  shouldForwardProp: (prop) => prop !== "isActive",
})<{ isActive: boolean }>(({ theme, isActive }) => ({
  borderRadius: 10,
  marginInline: 6,
  marginBottom: 2,
  paddingInline: 10,
  minHeight: 40,
  "&::before": {
    content: '""',
    position: "absolute",
    left: 0,
    top: "50%",
    transform: "translateY(-50%)",
    width: 3,
    height: isActive ? 20 : 0,
    borderRadius: 0,
    backgroundColor: theme.palette.teal?.main ?? theme.palette.primary.main,
    transition: "height 0.2s",
  },
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

const GroupHeader = styled(ListItem)(({ theme }) => ({
  paddingInline: 16,
  paddingTop: 12,
  paddingBottom: 4,
  cursor: "pointer",
  userSelect: "none",
  opacity: 0.7,
}));

const ProfileArea = styled("div")(({ theme }) => ({
  display: "flex",
  alignItems: "center",
  gap: 10,
  padding: "12px 14px",
  borderTop: `1px solid ${theme.palette.divider}`,
  marginTop: "auto",
}));

const CollapseButton = styled(IconButton)(({ theme }) => ({
  position: "absolute",
  top: 14,
  right: 8,
  width: 28,
  height: 28,
  backgroundColor: theme.palette.background.default,
  "&:hover": {
    backgroundColor: theme.palette.divider,
  },
}));

const NavLinkWrapper = styled(NavLink)({
  display: "block",
  textDecoration: "none",
  color: "inherit",
  "&.active": {
    color: "inherit",
  },
});

const ProfileInfo = styled("div")({
  flex: 1,
  overflow: "hidden",
});

const BrandInfo = styled("div")({
  overflow: "hidden",
});

export type SidebarProps = Readonly<{
  onNavigate?: () => void;
}>;

export function initialsOf(name: string): string {
  const parts = name.replace(/[._-]+/g, " ").trim().split(/\s+/);
  const letters = parts.slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "");
  return letters.join("") || "?";
}

export function RoleBadge({ role }: Readonly<{ role: string }>) {
  const { t } = useTranslation();
  const labelKey = { principal: "rolePrincipal", teacher: "roleTeacher", student: "roleStudent", parent: "roleParent" }[role] ?? role;
  return (
    <Typography
      component="span"
      sx={{
        fontSize: "0.65rem",
        fontWeight: 600,
        padding: "1px 6px",
        borderRadius: 999,
        backgroundColor: "action.selected",
        color: "text.secondary",
      }}
    >
      {t(labelKey)}
    </Typography>
  );
}

export function Sidebar({ onNavigate }: SidebarProps) {
  const { t, i18n } = useTranslation();
  const location = useLocation();
  const activeView = portalRoutes.find((route) => route.path === location.pathname)?.view;
  const { hasPermission, hasFeature, user, madrasa, logout } = useAuth();
  const [collapsed, setCollapsed] = useState(false);
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
      variant="permanent"
      sx={{
        width: collapsed ? COLLAPSED_WIDTH : DRAWER_WIDTH,
        "& .MuiDrawer-paper": {
          width: collapsed ? COLLAPSED_WIDTH : DRAWER_WIDTH,
        },
      }}
    >
      <BrandArea>
        <BrandLogo>{madrasa?.name?.[0]?.toUpperCase() ?? "م"}</BrandLogo>
        {!collapsed && (
          <BrandInfo>
            <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>
              {(i18n.language === "ur" ? madrasa?.name_ur : madrasa?.name_en) || madrasa?.name || t("appName")}
            </Typography>
            <Typography variant="caption" color="text.secondary" noWrap>
              {t("appName")}
            </Typography>
          </BrandInfo>
        )}
        <CollapseButton size="small" onClick={() => setCollapsed((v) => !v)} sx={{ display: collapsed ? "none" : "inline-flex" }}>
          <Box component={ChevronRight} size={14} sx={{ transform: "rotate(180deg)" }} />
        </CollapseButton>
      </BrandArea>

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
              {!collapsed && (
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
              )}
              <Collapse in={!isCollapsed} timeout="auto" unmountOnExit={false}>
                {visible.map((item) => {
                  const Icon = item.icon;
                  const isActive = activeView === item.id;
                  const path = resolveNavItemPath(item, user?.role, hasPermission, hasFeature, user?.has_teaching_assignment, user?.is_principal_delegate);

                  if (collapsed) {
                    return (
                      <Tooltip key={item.id} title={t(item.labelKey)} placement="right">
                        <ListItem disablePadding sx={{ px: 0 }}>
                          <NavLinkWrapper to={path} onClick={onNavigate}>
                            <NavItemButton
                              isActive={isActive}
                              sx={{ justifyContent: "center", px: 0 }}
                            >
                              <NavIcon>
                                <Icon size={18} />
                              </NavIcon>
                            </NavItemButton>
                          </NavLinkWrapper>
                        </ListItem>
                      </Tooltip>
                    );
                  }

                  return (
                    <ListItem key={item.id} disablePadding sx={{ px: 0 }}>
                      <NavLinkWrapper to={path} onClick={onNavigate}>
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

      {user && (
        <ProfileArea>
          <Avatar
            sx={{
              width: 32,
              height: 32,
              fontSize: "0.75rem",
              fontWeight: 600,
              bgcolor: "teal.main",
              color: "teal.contrastText",
              cursor: "pointer",
            }}
            onClick={() => {}}
          >
            {initialsOf(user.username)}
          </Avatar>
          {!collapsed && (
            <>
              <ProfileInfo>
                <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>
                  {user.username}
                </Typography>
                <RoleBadge role={user.role} />
              </ProfileInfo>
              <IconButton size="small" onClick={logout} aria-label={t("logout")} title={t("logout")}>
                <LogOut size={16} />
              </IconButton>
            </>
          )}
        </ProfileArea>
      )}
    </StyledDrawer>
  );
}
