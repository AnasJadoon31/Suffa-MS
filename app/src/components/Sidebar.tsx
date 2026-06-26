import { useTranslation } from "react-i18next";

import { navItems, type ViewId } from "../data/mockData";

export type SidebarProps = Readonly<{
  activeView: ViewId;
  onViewChange: (view: ViewId) => void;
  permissions: readonly string[];
}>;

export function Sidebar({ activeView, onViewChange, permissions }: SidebarProps) {
  const { t } = useTranslation();
  const visibleItems = navItems.filter((item) => !item.permission || permissions.includes(item.permission));

  return (
    <aside className="sidebar">
      <div className="brand">
        <span className="brandMark">م</span>
        <div>
          <strong>{t("appName")}</strong>
          <small>Principal workspace</small>
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
