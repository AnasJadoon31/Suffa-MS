import { useState } from "react";
import { Button } from "./ui/Button";
import Paper from "@mui/material/Paper";
import { LogOut, Settings, ChevronRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import { NavLink, useLocation } from "react-router";

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
  const labelKey = { principal: "rolePrincipal", teacher: "roleTeacher", student: "roleStudent", parent: "roleParent" }[role] ?? role;
  return <span className={`roleBadge role-${role}`}>{t(labelKey)}</span>;
}

export function Sidebar({ onNavigate, mobileOpen = false }: SidebarProps) {
  const { t, i18n } = useTranslation();
  const location = useLocation();
  const activeView = portalRoutes.find((route) => route.path === location.pathname)?.view;
  const { hasPermission, hasFeature, user, madrasa, logout } = useAuth();
  
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

  return (
    <aside className={mobileOpen ? "sidebar sidebarOpen" : "sidebar"}>
      <div className="brandContainer">
        <div className="brand">
          {madrasa?.logo_url
            ? <img className="brandLogo" src={madrasa.logo_url} alt="" />
            : <span className="brandMark">م</span>}
          <div className="brandText">
            <strong>{(i18n.language === "ur" ? madrasa?.name_ur : madrasa?.name_en) || madrasa?.name || t("appName")}</strong>
            <small>{t("appName")}</small>
          </div>
        </div>
        <svg className="brandCurve" viewBox="0 0 100 20" preserveAspectRatio="none">
          <path d="M0,10 Q50,20 100,10" fill="none" stroke="#efb45f" strokeWidth="0.5" opacity="0.5" />
        </svg>
      </div>

      <nav className="navScroll" aria-label={t("primaryNavigationLabel")}>
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

          const toggleGroup = () => {
            if (isGroupActive) return;
            setCollapsedGroups((prev) => {
              const next = new Set(prev);
              if (next.has(group.labelKey)) {
                next.delete(group.labelKey);
              } else {
                next.add(group.labelKey);
              }
              return next;
            });
          };

          return (
            <div className="navGroup" key={group.labelKey}>
              <div 
                className="navGroupHeader" 
                onClick={toggleGroup} 
                style={{ 
                  cursor: isGroupActive ? "default" : "pointer", 
                  opacity: isGroupActive ? 1 : 0.8,
                  userSelect: "none"
                }}
              >
                <span className="navGroupLabel">{t(group.labelKey)}</span>
                <div className="navGroupDivider">
                  <div className="navGroupDividerLine" />
                  <Settings 
                    size={10} 
                    className="navGroupDividerIcon" 
                    style={{ 
                      transform: isCollapsed ? "rotate(90deg)" : "rotate(0deg)", 
                      transition: "transform 0.2s" 
                    }} 
                  />
                  <div className="navGroupDividerLine" />
                </div>
              </div>
              <div 
                className="navList"
                style={{
                  display: isCollapsed ? "none" : "grid"
                }}
              >
                {visible.map((item) => {
                  const Icon = item.icon;
                  return (
                    <NavLink
                      className={({ isActive }) => {
                        return isActive || activeView === item.id ? "navItem active" : "navItem";
                      }}
                      key={item.id}
                      onClick={onNavigate}
                      to={resolveNavItemPath(item, user?.role, hasPermission, hasFeature, user?.has_teaching_assignment, user?.is_principal_delegate)}
                    >
                      <Icon size={17} />
                      <span className="navItemText">{t(item.labelKey)}</span>
                      <ChevronRight size={16} className="navItemChevron" />
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
          <Button className="iconButton" type="button" title={t("logout")} aria-label={t("logout")} onClick={logout}>
            <LogOut size={16} />
          </Button>
        </div>
      )}
    </aside>
  );
}
