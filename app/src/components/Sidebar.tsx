import { LogOut } from "lucide-react";
import { useTranslation } from "react-i18next";
import { NavLink, useLocation } from "react-router-dom";

import { isNavItemAccessible, navGroups, portalRoutes, resolveNavItemPath } from "../data/mockData";
import { useAuth } from "../lib/AuthContext";

export type SidebarProps = Readonly<{
  onNavigate?: () => void;
  mobileOpen?: boolean;
}>;

export function initialsOf(name: string): string {
  const parts = name.replace(/[._-]+/g, " ").trim().split(/\s+/);
  const letters = parts.slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "");
  return letters.join("") || "?";
}

export function RoleBadge({ role }: Readonly<{ role: string }>) {
  const { t } = useTranslation();
  const labelKey = { principal: "rolePrincipal", teacher: "roleTeacher", student: "roleStudent" }[role] ?? role;
  return <span className={`roleBadge role-${role}`}>{t(labelKey)}</span>;
}

export function Sidebar({ onNavigate, mobileOpen = false }: SidebarProps) {
  const { t } = useTranslation();
  const location = useLocation();
  const activeView = portalRoutes.find((route) => route.path === location.pathname)?.view;
  const { hasPermission, hasFeature, user, madrasa, logout } = useAuth();

  return (
    <aside className={mobileOpen ? "sidebar sidebarOpen" : "sidebar"}>
      <div className="brand">
        <span className="brandMark">م</span>
        <div className="brandText">
          <strong>{madrasa?.name ?? t("appName")}</strong>
          <small>{t("appName")}</small>
        </div>
      </div>

      <nav className="navScroll" aria-label="Primary">
        {navGroups.map((group) => {
          const visible = group.items.filter(
            (item) => isNavItemAccessible(item, user?.role, hasPermission, hasFeature),
          );
          if (visible.length === 0) return null;
          return (
            <div className="navGroup" key={group.labelKey}>
              <span className="navGroupLabel">{t(group.labelKey)}</span>
              <div className="navList">
                {visible.map((item) => {
                  const Icon = item.icon;
                  return (
                    <NavLink
                      className={({ isActive }) => {
                        return isActive || activeView === item.id ? "navItem active" : "navItem";
                      }}
                      key={item.id}
                      onClick={onNavigate}
                      to={resolveNavItemPath(item, user?.role, hasPermission, hasFeature)}
                    >
                      <Icon size={17} />
                      <span>{t(item.labelKey)}</span>
                    </NavLink>
                  );
                })}
              </div>
            </div>
          );
        })}
      </nav>

      {user && (
        <div className="profileCard">
          <span className="avatar" aria-hidden="true">{initialsOf(user.username)}</span>
          <div className="profileText">
            <strong>{user.username}</strong>
            <RoleBadge role={user.role} />
          </div>
          <button className="iconButton" type="button" title={t("logout")} aria-label={t("logout")} onClick={logout}>
            <LogOut size={16} />
          </button>
        </div>
      )}
    </aside>
  );
}
