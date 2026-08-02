import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Building2, Check, Moon, Settings2, Sun } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/app/AppShell";
import { Card, EmptyState, SectionTitle, SkeletonList } from "@/components/app/Primitives";
import { useAuth } from "@/lib/mms/auth";
import { opsApi, opsMutations } from "@/lib/mms/more-endpoints";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "Settings — Suffa MS" },
      { name: "description", content: "Madrasa configuration and app appearance preferences." },
      { property: "og:title", content: "Settings — Suffa MS" },
      {
        property: "og:description",
        content: "Madrasa configuration and app appearance preferences.",
      },
    ],
  }),
  component: SettingsPage,
});

const THEME_KEY = "mms_theme";

function SettingsPage() {
  const { madrasa } = useAuth();
  const [dark, setDark] = useState(false);

  useEffect(() => {
    const stored = window.localStorage.getItem(THEME_KEY) === "dark";
    setDark(stored);
    document.documentElement.classList.toggle("dark", stored);
  }, []);

  const toggleTheme = () => {
    const next = !dark;
    setDark(next);
    window.localStorage.setItem(THEME_KEY, next ? "dark" : "light");
    document.documentElement.classList.toggle("dark", next);
  };

  const settings = useQuery({
    queryKey: ["settings"],
    queryFn: () => opsApi.listSettings(),
    retry: false,
  });

  return (
    <AppShell title="Settings" subtitle={madrasa?.name ?? "Suffa MS"}>
      <SectionTitle>Appearance</SectionTitle>
      <Card className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 p-3.5">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary">
          {dark ? <Moon className="h-5 w-5" /> : <Sun className="h-5 w-5" />}
        </span>
        <div className="min-w-0">
          <p className="truncate font-semibold">Dark mode</p>
          <p className="truncate text-xs text-muted-foreground">Easier on the eyes at night</p>
        </div>
        <button
          onClick={toggleTheme}
          aria-label="Toggle dark mode"
          className={
            dark
              ? "gradient-emerald h-7 w-12 rounded-full p-1 text-left"
              : "h-7 w-12 rounded-full bg-muted p-1 text-left"
          }
        >
          <span
            className={
              dark
                ? "block h-5 w-5 translate-x-5 rounded-full bg-primary-foreground transition-transform"
                : "block h-5 w-5 rounded-full bg-card transition-transform"
            }
          />
        </button>
      </Card>

      <SectionTitle>Madrasa</SectionTitle>
      <Card className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 p-3.5">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary">
          <Building2 className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <p className="truncate font-semibold">{madrasa?.name ?? "—"}</p>
          <p className="truncate text-xs text-muted-foreground">{madrasa?.slug ?? "—"}</p>
        </div>
        <span />
      </Card>

      <SectionTitle>Configuration</SectionTitle>
      {settings.isLoading ? <SkeletonList rows={4} /> : null}
      {!settings.isLoading && (settings.data ?? []).length === 0 ? (
        <EmptyState
          title="No settings available"
          hint="Only administrators can view configuration."
        />
      ) : null}
      <div className="space-y-2">
        {(settings.data ?? []).map((setting) => (
          <SettingRow key={setting.id} settingKey={setting.key} value={setting.value} />
        ))}
      </div>
    </AppShell>
  );
}

function SettingRow({ settingKey, value }: { settingKey: string; value: string }) {
  const client = useQueryClient();
  const [draft, setDraft] = useState(value);
  const dirty = draft !== value;

  const save = useMutation({
    mutationFn: () => opsMutations.updateSetting(settingKey, draft),
    onSuccess: () => {
      toast.success("Setting saved");
      void client.invalidateQueries({ queryKey: ["settings"] });
    },
  });

  return (
    <Card className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 p-3.5">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary">
        <Settings2 className="h-4 w-4" />
      </span>
      <label className="min-w-0">
        <span className="block truncate text-[0.7rem] font-bold uppercase tracking-wide text-muted-foreground">
          {settingKey}
        </span>
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          className="w-full bg-transparent text-sm font-bold outline-none"
        />
      </label>
      <button
        aria-label="Save setting"
        disabled={!dirty || save.isPending}
        onClick={() => save.mutate()}
        className="grid h-9 w-9 place-items-center rounded-xl bg-primary-soft text-primary disabled:opacity-40"
      >
        <Check className="h-4 w-4" />
      </button>
    </Card>
  );
}
