import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { CalendarCheck2, Home, LayoutGrid, LogOut, Menu, User, Users } from "lucide-react";
import { useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";

import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { useAuth } from "@/lib/mms/auth";
import { isNavItemVisible, navGroups, type NavItem } from "@/lib/mms/nav";
import { isTenantWorkspace } from "@/lib/mms/workspace";
import { filesApi } from "@/lib/mms/more-endpoints";
import { useTranslation } from "react-i18next";

const tabs = [
  { to: "/dashboard", label: "Home", icon: Home },
  { to: "/attendance", label: "Attendance", icon: CalendarCheck2, feature: "attendance" },
  { to: "/people", label: "People", icon: Users },
  { to: "/more", label: "More", icon: LayoutGrid },
  { to: "/me", label: "Profile", icon: User, roles: ["donor"] },
] as const;

function useActive() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return (to: string) => pathname === to || pathname.startsWith(`${to}/`);
}

export function BottomNav() {
    const { t } = useTranslation();
  const isActive = useActive();
  const { user, hasFeature } = useAuth();
  const visibleTabs = tabs
    .map((tab) => user?.role === "teacher" && tab.to === "/attendance" ? { ...tab, to: "/my-attendance" } : tab)
    .filter((tab) => {
      if ("roles" in tab && tab.roles) {
        return user?.role !== undefined && (tab.roles as readonly string[]).includes(user.role);
      }
      return isNavItemVisible(tab, user?.role, hasFeature);
    });

  return (
    <nav className="pb-safe fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card/95 backdrop-blur-md lg:hidden">
      <ul className="mx-auto grid max-w-lg" style={{ gridTemplateColumns: `repeat(${visibleTabs.length}, minmax(0, 1fr))` }}>
        {visibleTabs.map(({ to, label, icon: Icon }) => {
          const active = isActive(to);
          return (
            <li key={to}>
              <Link
                to={to}
                className="flex flex-col items-center gap-1 px-2 pb-2 pt-2.5 text-[0.68rem] font-semibold tracking-wide"
              >
                <span
                  className={
                    active
                      ? "gradient-emerald flex h-8 w-14 items-center justify-center rounded-full text-primary-foreground shadow-[var(--shadow-raised)]"
                      : "flex h-8 w-14 items-center justify-center rounded-full text-muted-foreground"
                  }
                >
                  <Icon className="h-[1.15rem] w-[1.15rem]" />
                </span>
                <span className={active ? "text-primary" : "text-muted-foreground"}>{t(label)}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function BrandBlock() {
    const { t } = useTranslation();
  const { madrasa, user } = useAuth();
  const logo = useQuery({
    queryKey: ["madrasa-logo", madrasa?.logo_file_key],
    queryFn: () => filesApi.presignDownload(madrasa!.logo_file_key!),
    enabled: Boolean(madrasa?.logo_file_key),
    staleTime: 10 * 60 * 1000,
  });
  const isPlatform = user?.role === "super_admin" && !isTenantWorkspace(user.role);
  return (
    <div className="flex min-w-0 items-center gap-3 px-2">
      <span className={logo.data && !isPlatform ? "grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-2xl bg-card" : "gradient-emerald grid h-11 w-11 shrink-0 place-items-center rounded-2xl font-display text-lg font-extrabold text-primary-foreground"}>
        {!isPlatform && logo.data ? <img src={logo.data} alt="" className="h-full w-full object-contain" /> : (isPlatform ? "P" : madrasa?.name ?? "S").slice(0, 1).toUpperCase()}
      </span>
      <div className="min-w-0">
         <p className="font-display text-base font-extrabold [overflow-wrap:anywhere]">
          {isPlatform ? "Suffa MS Platform" : madrasa?.name ?? "Suffa MS"}
        </p>
         <p className="text-xs text-muted-foreground [overflow-wrap:anywhere]">
          {(user?.name || user?.username) ?? ""}
          {user?.role ? ` · ${user.role.replace("_", " ")}` : ""}
        </p>
      </div>
    </div>
  );
}

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const { t } = useTranslation();
  const { user, hasFeature } = useAuth();
  const isActive = useActive();
  const groups = user?.role === "super_admin" && !isTenantWorkspace(user.role)
    ? navGroups.map((group) => ({ ...group, items: group.items.filter((item) => item.to === "/platform" || item.to === "/me") })).filter((group) => group.items.length)
    : navGroups.map((group) => ({
        ...group,
        items: group.items.filter((item) => (item.visible?.(user) ?? true) && isNavItemVisible(item, user?.role, hasFeature)),
      })).filter((group) => group.items.length);
  return (
    <div className="space-y-5">
      {groups.map((group) => (
        <div key={group.title}>
          <p className="px-3.5 pb-1.5 text-[0.62rem] font-extrabold uppercase tracking-[0.16em] text-muted-foreground/70">
            {t(group.title)}
          </p>
          <ul className="space-y-1">
            {group.items.map(({ to, label, icon: Icon }) => {
              const active = isActive(to);
              return (
                <li key={to}>
                  <Link
                    to={to}
                    onClick={onNavigate}
                    className={
                      active
                        ? "gradient-emerald flex items-center gap-3 rounded-2xl px-3.5 py-2.5 font-display text-sm font-extrabold text-primary-foreground shadow-[var(--shadow-raised)]"
                        : "flex items-center gap-3 rounded-2xl px-3.5 py-2.5 font-display text-sm font-bold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    }
                  >
                    <Icon className="h-[1.05rem] w-[1.05rem] shrink-0" />
                    <span className="truncate">{t(label)}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}

function SignOutButton({ onDone }: { onDone?: () => void }) {
    const { t } = useTranslation();
  const { logout } = useAuth();
  const navigate = useNavigate();
  return (
    <button
      onClick={() => {
        logout();
        onDone?.();
        void navigate({ to: "/" });
      }}
      className="flex w-full items-center gap-3 rounded-2xl px-3.5 py-3 font-display text-sm font-bold text-destructive transition-colors hover:bg-destructive/10"
    >
      <LogOut className="h-[1.15rem] w-[1.15rem] shrink-0" />
      {t("Sign out")}</button>
  );
}

export function DesktopSidebar() {
    const { t } = useTranslation();
  return (
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-[16rem] flex-col border-r border-border bg-card px-3 py-5 lg:flex">
      <BrandBlock />
      <nav className="mt-6 flex-1 overflow-y-auto pb-4">
        <NavLinks />
      </nav>
      <SignOutButton />
    </aside>
  );
}

export function MobileDrawer() {
    const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        aria-label="Open menu"
        className="grid h-10 w-10 place-items-center rounded-2xl bg-primary-foreground/15 text-primary-foreground lg:hidden"
      >
        <Menu className="h-5 w-5" />
      </SheetTrigger>
      <SheetContent side="left" className="flex w-[17rem] flex-col bg-card px-3 py-5">
        <SheetTitle className="sr-only">{t("Navigation")}</SheetTitle>
        <BrandBlock />
        <nav className="mt-6 flex-1 overflow-y-auto pb-4">
          <NavLinks onNavigate={() => setOpen(false)} />
        </nav>
        <SignOutButton onDone={() => setOpen(false)} />
      </SheetContent>
    </Sheet>
  );
}

export function TopBar({
  title,
  subtitle,
  right,
}: {
  title: string;
  subtitle?: string | undefined;
  right?: ReactNode | undefined;
}) {
    const { t } = useTranslation();
  return (
    <header className="pt-safe gradient-emerald sticky top-0 z-30 rounded-b-3xl px-4 pb-5 text-primary-foreground shadow-[var(--shadow-raised)] lg:rounded-none">
      <div className="mx-auto grid max-w-lg grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 pt-4 lg:max-w-5xl">
        <MobileDrawer />
        <div className="min-w-0">
          <h1 className="font-display text-base font-extrabold sm:text-lg lg:text-2xl break-words">{title}</h1>
          {subtitle ? (
            <p className="truncate text-xs text-primary-foreground/70">{subtitle}</p>
          ) : null}
        </div>
        {right ? <div className="shrink-0">{right}</div> : <div />}
      </div>
    </header>
  );
}
