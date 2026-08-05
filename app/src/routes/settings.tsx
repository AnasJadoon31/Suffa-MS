import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Building2, Check, Settings2 } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/app/AppShell";
import {
  Card,
  EmptyState,
  SectionTitle,
  CustomDropdown,
  SkeletonList,
  TextInput,
} from "@/components/app/Primitives";
import { useAuth } from "@/lib/mms/auth";
import { opsApi, opsMutations, type TypedMadrasaSetting } from "@/lib/mms/more-endpoints";
import { useTranslation } from "react-i18next";

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

function SettingsPage() {
    const { t } = useTranslation();
  const { madrasa, hasPermission } = useAuth();
  const canManage = hasPermission("settings.manage");

  const settings = useQuery({
    queryKey: ["settings-catalog"],
    queryFn: () => opsApi.listSettingsCatalog(),
    retry: false,
  });

  const grouped = useMemo(() => {
    const map = new Map<string, TypedMadrasaSetting[]>();
    for (const setting of settings.data ?? []) {
      const existing = map.get(setting.category) ?? [];
      existing.push(setting);
      map.set(setting.category, existing);
    }
    return Array.from(map.entries());
  }, [settings.data]);

  return (
    <AppShell title={t("Settings")} subtitle={madrasa?.name ?? "Suffa MS"}>
      <SectionTitle>{t("Madrasa")}</SectionTitle>
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

      <SectionTitle>{t("Configuration")}</SectionTitle>
      {settings.isLoading ? <SkeletonList rows={4} /> : null}
      {!settings.isLoading && grouped.length === 0 ? (
        <EmptyState
          title={t("No settings available")}
          hint="Only administrators can change configuration."
        />
      ) : null}
      <div className="space-y-5">
        {grouped.map(([category, entries]) => (
          <div key={category}>
            <SectionTitle>{category}</SectionTitle>
            <div className="space-y-2">
              {entries.map((setting) => (
                <SettingRow key={setting.key} setting={setting} canManage={canManage} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </AppShell>
  );
}

function SettingRow({
  setting,
  canManage,
}: {
  setting: TypedMadrasaSetting;
  canManage: boolean;
}) {
    const { t } = useTranslation();
  const client = useQueryClient();
  const [draft, setDraft] = useState(setting.value);
  const dirty = draft !== setting.value;

  const save = useMutation({
    mutationFn: () => opsMutations.updateSetting(setting.key, draft),
    onSuccess: () => {
      toast.success("Setting saved");
      void client.invalidateQueries({ queryKey: ["settings-catalog"] });
    },
  });

  return (
    <Card className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 p-3.5">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary">
        <Settings2 className="h-4 w-4" />
      </span>
      <label className="min-w-0">
        <span className="block truncate text-[0.7rem] font-bold uppercase tracking-wide text-muted-foreground">
          {setting.label}
        </span>
        {setting.type === "bool" ? (
          <CustomDropdown
            disabled={!canManage}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
          >
            <option value="true">{t("Enabled")}</option>
            <option value="false">{t("Disabled")}</option>
          </CustomDropdown>
        ) : setting.type === "int" ? (
          <TextInput
            disabled={!canManage}
            type="number"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
          />
        ) : (
          <TextInput
            disabled={!canManage}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
          />
        )}
      </label>
      {canManage ? (
        <button
          aria-label="Save setting"
          disabled={!dirty || save.isPending}
          onClick={() => save.mutate()}
          className="grid h-9 w-9 place-items-center rounded-xl bg-primary-soft text-primary disabled:opacity-40"
        >
          <Check className="h-4 w-4" />
        </button>
      ) : (
        <span />
      )}
    </Card>
  );
}
