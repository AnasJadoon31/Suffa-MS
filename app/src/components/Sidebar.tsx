import { useTranslation } from "react-i18next";

import { navItems, type ViewId } from "../data/mockData";
import { useAuth } from "../lib/AuthContext";

export type SidebarProps = Readonly<{
  activeView: ViewId;
  onViewChange: (view: ViewId) => void;
}>;

export function Sidebar({ activeView, onViewChange }: SidebarProps) {
  const { t } = useTranslation();
  const { hasPermission, user } = useAuth();
  const visibleItems = navItems.filter((item) => !item.permission || hasPermission(item.permission));

  return (
    <aside className="sidebar">
      <div className="brand">
        <span className="brandMark">م</span>
        <div>
          <strong>{t("appName")}</strong>
          <small>{user?.role ? `${user.role[0]?.toUpperCase()}${user.role.slice(1)} workspace` : "Workspace"}</small>
        </div>
      </div>
      <nav className="navList" aria-label="Primary">
        {visibleItems.map((item) => {
          const Icon = item.icon;
          return (
            <button
              aria-current={activeView === item.id ? "page" : undefined}
              className={activeView === item.id ? "navItem active" : "navItem"}
              key={item.id}
              type="button"
              onClick={() => onViewChange(item.id)}
            >
              <Icon size={18} />
              <span>{t(item.labelKey)}</span>
            </button>
          );
        })}
      </nav>
    </aside>
  );
}
