import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";

import { AppShell } from "@/components/app/AppShell";
import { SectionTitle } from "@/components/app/Primitives";
import { navGroups } from "@/lib/mms/nav";
import { useTranslation } from "react-i18next";

export const Route = createFileRoute("/more")({
  head: () => ({
    meta: [
      { title: "All Screens — Suffa MS" },
      {
        name: "description",
        content: "Jump to every Suffa MS module: academics, finance, operations and admin.",
      },
      { property: "og:title", content: "All Screens — Suffa MS" },
      { property: "og:description", content: "Every module of the madrasa portal in one place." },
    ],
  }),
  component: MorePage,
});

function MorePage() {
    const { t } = useTranslation();
  return (
    <AppShell title={t("More")} subtitle={t("Every module in one place")}>
      {navGroups.map((group) => (
        <div key={group.title}>
          <SectionTitle>{group.title}</SectionTitle>
          <div className="grid gap-2.5 sm:grid-cols-2">
            {group.items.map(({ to, label, icon: Icon, description }) => (
              <Link
                key={to}
                to={to}
                className="card-surface grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 p-3.5 transition-transform active:scale-[0.99]"
              >
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary">
                  <Icon className="h-5 w-5" />
                </span>
                <span className="min-w-0">
                  <span className="block truncate font-display text-sm font-extrabold">
                    {label}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {description}
                  </span>
                </span>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </Link>
            ))}
          </div>
        </div>
      ))}
    </AppShell>
  );
}
