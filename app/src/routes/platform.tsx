import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Settings2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { AppShell } from "@/components/app/AppShell";
import { Card, EmptyState, SectionTitle, SkeletonList } from "@/components/app/Primitives";
import { useAuth } from "@/lib/mms/auth";
import { api, apiErrorMessage, getAllPages } from "@/lib/mms/api";

interface MadrasaEntry {
  id: string;
  slug: string;
  name: string;
  content_language: string;
}

interface MadrasaFeature {
  madrasa_id: string;
  feature_key: string;
  enabled: boolean;
}

export const Route = createFileRoute("/platform")({
  head: () => ({
    meta: [
      { title: "Platform — Suffa MS" },
      { name: "description", content: "Super admin platform management console" },
    ],
  }),
  component: PlatformPage,
});

function PlatformPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const client = useQueryClient();

  if (user?.role !== "super_admin") {
    return (
      <AppShell title={t("Platform")} subtitle={t("Access denied")}>
        <EmptyState title={t("Only accessible to platform super admins")} />
      </AppShell>
    );
  }

  const madaris = useQuery({
    queryKey: ["platform", "madaris"],
    queryFn: () => getAllPages<MadrasaEntry>("/api/v1/platform/madaris"),
  });

  return (
    <AppShell title={t("Platform")} subtitle={t("Manage madaris and feature flags")}>
      <SectionTitle>{t("Madaris")}</SectionTitle>
      {madaris.isLoading ? <SkeletonList rows={3} /> : null}
      {madaris.data?.map((madrasa) => (
        <MadrasaCard key={madrasa.id} madrasa={madrasa} />
      ))}
    </AppShell>
  );
}

function MadrasaCard({ madrasa }: { madrasa: MadrasaEntry }) {
  const { t } = useTranslation();

  const features = useQuery({
    queryKey: ["platform", "features", madrasa.id],
    queryFn: () =>
      api
        .get<MadrasaFeature[]>(`/api/v1/platform/madaris/${madrasa.id}/features`)
        .then((r) => r.data),
  });

  return (
    <Card className="space-y-2">
      <div className="flex items-center justify-between">
        <div>
          <p className="font-semibold">{madrasa.name}</p>
          <p className="text-xs text-muted-foreground">{madrasa.slug}</p>
        </div>
        <span className="rounded-full bg-primary-soft px-2 py-0.5 text-xs font-bold text-primary">
          {madrasa.content_language.toUpperCase()}
        </span>
      </div>
      {features.data ? (
        <div className="mt-2 flex flex-wrap gap-1">
          {features.data.map((flag) => (
            <span
              key={flag.feature_key}
              className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                flag.enabled
                  ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400"
                  : "bg-muted text-muted-foreground line-through"
              }`}
            >
              {flag.feature_key}
            </span>
          ))}
        </div>
      ) : null}
    </Card>
  );
}
