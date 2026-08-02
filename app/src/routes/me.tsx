import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Building2, IdCard, LogOut, ShieldCheck } from "lucide-react";

import { AppShell } from "@/components/app/AppShell";
import { Card, Pill, SectionTitle } from "@/components/app/Primitives";
import { useAuth } from "@/lib/mms/auth";

export const Route = createFileRoute("/me")({
  head: () => ({
    meta: [
      { title: "My Profile — Suffa MS" },
      { name: "description", content: "Your Suffa MS account, madrasa and access details." },
      { property: "og:title", content: "My Profile — Suffa MS" },
      { property: "og:description", content: "Your Suffa MS account, madrasa and access details." },
    ],
  }),
  component: MePage,
});

function MePage() {
  const { user, madrasa, permissions, logout } = useAuth();
  const navigate = useNavigate();

  return (
    <AppShell title="My Profile" subtitle={madrasa?.name ?? "Suffa MS"}>
      <Card className="flex items-center gap-3">
        <span className="gradient-emerald grid h-14 w-14 shrink-0 place-items-center rounded-2xl font-display text-xl font-extrabold text-primary-foreground">
          {user?.username?.slice(0, 1).toUpperCase()}
        </span>
        <div className="min-w-0">
          <p className="truncate font-display text-lg font-extrabold">{user?.username}</p>
          <div className="mt-1 flex flex-wrap gap-1.5">
            <Pill tone="gold">{user?.role?.replace("_", " ")}</Pill>
            <Pill tone={user?.status === "active" ? "success" : "muted"}>{user?.status}</Pill>
          </div>
        </div>
      </Card>

      <SectionTitle>Account</SectionTitle>
      <div className="space-y-2.5">
        <Row
          icon={<Building2 className="h-4 w-4" />}
          label="Madrasa"
          value={madrasa?.name ?? "—"}
        />
        <Row icon={<IdCard className="h-4 w-4" />} label="Tenant" value={madrasa?.slug ?? "—"} />
        <Row
          icon={<ShieldCheck className="h-4 w-4" />}
          label="Permissions"
          value={`${permissions.length} granted`}
        />
      </div>

      <SectionTitle>Session</SectionTitle>
      <button
        onClick={() => {
          logout();
          void navigate({ to: "/" });
        }}
        className="flex w-full items-center justify-center gap-2 rounded-2xl bg-destructive/10 py-3.5 font-display font-extrabold text-destructive active:scale-[0.99]"
      >
        <LogOut className="h-4 w-4" />
        Sign out
      </button>
    </AppShell>
  );
}

function Row({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <Card className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 p-3.5">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary">
        {icon}
      </span>
      <span className="truncate text-sm font-semibold text-muted-foreground">{label}</span>
      <span className="truncate text-sm font-bold">{value}</span>
    </Card>
  );
}
