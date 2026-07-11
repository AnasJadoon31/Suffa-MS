import { LogOut } from "lucide-react";
import { useTranslation } from "react-i18next";

import { navGroups, type ViewId } from "../data/mockData";
import { useAuth } from "../lib/AuthContext";

export type SidebarProps = Readonly<{
  activeView: ViewId;
  onViewChange: (view: ViewId) => void;
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

export function Sidebar({ activeView, onViewChange }: SidebarProps) {
  const { t } = useTranslation();
  const { hasPermission, hasFeature, user, madrasa, logout } = useAuth();

  return (
    <aside className="sidebar">
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
            (item) =>
              (!item.permission || hasPermission(item.permission)) &&
              (!item.feature || hasFeature(item.feature))
          );
          if (visible.length === 0) return null;
          return (
            <div className="navGroup" key={group.labelKey}>
              <span className="navGroupLabel">{t(group.labelKey)}</span>
              <div className="navList">
                {visible.map((item) => {
                  const Icon = item.icon;
                  const isActive = activeView === item.id;
                  return (
                    <button
                      aria-current={isActive ? "page" : undefined}
                      className={isActive ? "navItem active" : "navItem"}
                      key={item.id}
                      type="button"
                      onClick={() => onViewChange(item.id)}
                    >
                      <Icon size={17} />
                      <span>{t(item.labelKey)}</span>
                    </button>
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
