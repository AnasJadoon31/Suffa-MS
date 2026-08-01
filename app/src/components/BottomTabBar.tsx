import { type ElementType } from "react";
import { useTranslation } from "react-i18next";
import { NavLink, useLocation } from "react-router";
import { styled } from "@mui/material/styles";
import { BottomNavigation } from "./ui/Mui";
import { BottomNavigationAction } from "./ui/Mui";
import { LayoutDashboard, UsersRound, CalendarDays, Landmark, MoreHorizontal } from "lucide-react";
import { navItems, resolveNavItemPath, isNavItemAccessible } from "../data/mockData";
import { useAuth } from "../lib/AuthContext";
import { PWA_BOTTOM_NAV_HEIGHT, PWA_COMPACT_BREAKPOINT } from "./ui/Layout";

const StyledBottomNavigation = styled(BottomNavigation)(({ theme }) => ({
  flexShrink: 0,
  zIndex: theme.zIndex.appBar,
  backgroundColor: theme.palette.background.paper,
  borderTop: `1px solid ${theme.palette.divider}`,
  paddingBottom: "env(safe-area-inset-bottom)",
  height: `calc(${PWA_BOTTOM_NAV_HEIGHT}px + env(safe-area-inset-bottom))`,
  [`@media (min-width:${PWA_COMPACT_BREAKPOINT}px)`]: {
    display: "none",
  },
}));

const StyledAction = styled(BottomNavigationAction)(({ theme }) => ({
  minWidth: 0,
  padding: "8px 6px",
  minHeight: 56,
  color: theme.palette.text.secondary,
  "&.Mui-selected": {
    color: theme.palette.teal?.main ?? theme.palette.primary.main,
  },
  "& .MuiBottomNavigationAction-label": {
    fontSize: "0.65rem",
    marginTop: 2,
    "&.Mui-selected": {
      fontSize: "0.7rem",
    },
  },
}));

const RoutedAction = StyledAction as ElementType;

const Indicator = styled("span")(({ theme }) => ({
  position: "absolute",
  top: 4,
  left: "50%",
  transform: "translateX(-50%)",
  width: 4,
  height: 4,
  borderRadius: "50%",
  backgroundColor: theme.palette.teal?.main ?? theme.palette.primary.main,
  display: "none",
  ".Mui-selected &": {
    display: "block",
  },
}));

const IconWrapper = styled("span")({
  position: "relative",
});

export type BottomTabBarProps = Readonly<{
  onMoreClick?: () => void;
}>;

const PRIMARY_ITEMS = [
  { id: "dashboard" as const, icon: LayoutDashboard },
  { id: "people" as const, icon: UsersRound },
  { id: "attendance" as const, icon: CalendarDays },
  { id: "finance" as const, icon: Landmark },
];

export function BottomTabBar({ onMoreClick }: BottomTabBarProps) {
  const { t } = useTranslation();
  const location = useLocation();
  const { user, hasPermission, hasFeature } = useAuth();

  const getActiveValue = () => {
    const activeRoute = navItems.find((item) => {
      const path = resolveNavItemPath(item, user?.role, hasPermission, hasFeature, user?.has_teaching_assignment, user?.is_principal_delegate);
      return location.pathname.startsWith(path);
    });
    if (activeRoute && PRIMARY_ITEMS.some((p) => p.id === activeRoute.id)) {
      return activeRoute.id;
    }
    return false;
  };

  const handleMore = () => {
    onMoreClick?.();
  };

  return (
    <StyledBottomNavigation
      value={getActiveValue()}
      showLabels
      role="navigation"
      aria-label={t("primaryNavigationLabel")}
    >
      {PRIMARY_ITEMS.map((item) => {
        const navItem = navItems.find((n) => n.id === item.id);
        if (!navItem) return null;
        const accessible = isNavItemAccessible(navItem, user?.role, hasPermission, hasFeature, user?.has_teaching_assignment, user?.is_principal_delegate);
        if (!accessible) return null;
        const path = resolveNavItemPath(navItem, user?.role, hasPermission, hasFeature, user?.has_teaching_assignment, user?.is_principal_delegate);
        const Icon = item.icon;
        return (
          <RoutedAction
            key={item.id}
            component={NavLink}
            to={path}
            value={item.id}
            label={t(navItem.labelKey)}
            icon={
              <IconWrapper>
                <Indicator />
                <Icon size={20} />
              </IconWrapper>
            }
          />
        );
      })}
      <StyledAction
        value="more"
        label={t("more")}
        icon={<MoreHorizontal size={20} />}
        onClick={handleMore}
      />
    </StyledBottomNavigation>
  );
}
