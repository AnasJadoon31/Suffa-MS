import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { ExternalLink, Pencil } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/app/AppShell";
import { ActionButton, Card, EmptyState, SectionTitle, SkeletonList, TextInput } from "@/components/app/Primitives";
import { useAuth } from "@/lib/mms/auth";
import { api, getAllPages, TENANT_KEY } from "@/lib/mms/api";
import { setSuperAdminWorkspace } from "@/lib/mms/workspace";

interface MadrasaEntry { id: string; slug: string; name: string; content_language: string; }
interface MadrasaFeature { key: string; label: string; enabled: boolean; }

export const Route = createFileRoute("/platform")({ component: PlatformPage });

function PlatformPage() {
  const { user } = useAuth();
  const [, setPlatformMode] = useState(false);
  const madaris = useQuery({ queryKey: ["platform", "madaris"], queryFn: () => getAllPages<MadrasaEntry>("/api/v1/platform/madaris") });
  useEffect(() => {
    setSuperAdminWorkspace("platform");
    setPlatformMode(true);
  }, []);
  if (user?.role !== "super_admin") return <AppShell title="Platform" subtitle="Access denied"><EmptyState title="Only accessible to platform super admins" /></AppShell>;
  return <AppShell title="Platform" subtitle="Manage madaris and modules"><SectionTitle>Madaris</SectionTitle>{madaris.isLoading ? <SkeletonList rows={3} /> : null}<div className="space-y-3">{madaris.data?.map((madrasa) => <MadrasaCard key={madrasa.id} madrasa={madrasa} />)}</div></AppShell>;
}

function MadrasaCard({ madrasa }: { madrasa: MadrasaEntry }) {
  const client = useQueryClient();
  const [editingSlug, setEditingSlug] = useState(false);
  const [slug, setSlug] = useState(madrasa.slug);
  
  const isDefault = madrasa.slug === "default";
  
  const features = useQuery({ 
    queryKey: ["platform", "features", madrasa.id], 
    queryFn: () => api.get<MadrasaFeature[]>(`/api/v1/platform/madaris/${madrasa.id}/features`).then((r) => r.data),
    enabled: !isDefault
  });
  
  const saveSlug = useMutation({ mutationFn: () => api.patch<MadrasaEntry>(`/api/v1/platform/madaris/${madrasa.id}`, { slug }).then((r) => r.data), onSuccess: () => { toast.success("Slug updated"); setEditingSlug(false); void client.invalidateQueries({ queryKey: ["platform", "madaris"] }); }, onError: () => toast.error("Could not update slug") });
  const toggle = useMutation({ mutationFn: ({ key, enabled }: MadrasaFeature) => api.put(`/api/v1/platform/madaris/${madrasa.id}/features`, { features: { [key]: enabled } }), onSuccess: () => void client.invalidateQueries({ queryKey: ["platform", "features", madrasa.id] }), onError: () => toast.error("Could not update screen access") });
  const openWorkspace = () => { localStorage.setItem(TENANT_KEY, madrasa.slug); setSuperAdminWorkspace("tenant"); window.location.assign("/dashboard"); };

  return (
    <Card className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-display font-extrabold">{madrasa.name}</p>
          {editingSlug ? (
            <div className="mt-2 flex gap-2">
              <TextInput value={slug} onChange={(event) => setSlug(event.target.value)} />
              <ActionButton onClick={() => saveSlug.mutate()} disabled={saveSlug.isPending}>Save</ActionButton>
            </div>
          ) : (
            <p className="mt-1 text-xs text-muted-foreground">{madrasa.slug}</p>
          )}
        </div>
        <div className="flex gap-2">
          {!isDefault && (
            <button type="button" aria-label="Edit slug" title="Edit slug" onClick={() => setEditingSlug((value) => !value)} className="grid h-10 w-10 place-items-center rounded-xl bg-muted">
              <Pencil className="h-4 w-4" />
            </button>
          )}
          <button type="button" aria-label="Open madrasa workspace" title="Open madrasa workspace" onClick={openWorkspace} className="grid h-10 w-10 place-items-center rounded-xl bg-primary text-primary-foreground">
            <ExternalLink className="h-4 w-4" />
          </button>
        </div>
      </div>
      {!isDefault && (
        <div>
          <p className="mb-2 text-xs font-bold uppercase tracking-widest text-muted-foreground">Screens</p>
          {features.isLoading ? (
            <SkeletonList rows={2} />
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {features.data?.map((feature) => (
                <label key={feature.key} className="flex items-center justify-between gap-2 rounded-xl bg-muted px-3 py-2 text-sm font-semibold">
                  <span>{feature.label}</span>
                  <input type="checkbox" checked={feature.enabled} onChange={(event) => toggle.mutate({ ...feature, enabled: event.target.checked })} className="h-4 w-4 accent-primary" />
                </label>
              ))}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
