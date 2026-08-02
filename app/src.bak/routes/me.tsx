import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Building2, Globe, IdCard, KeyRound, Languages, LogOut, ShieldCheck } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/app/AppShell";
import {
  ActionButton,
  Card,
  Field,
  Pill,
  SectionTitle,
  CustomDropdown,
  TextInput,
} from "@/components/app/Primitives";
import { academicsApi, authApi } from "@/lib/mms/endpoints";
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
  const { user, madrasa, permissions, logout, refresh } = useAuth();
  const navigate = useNavigate();
  const client = useQueryClient();

  const sessions = useQuery({
    queryKey: ["sessions"],
    queryFn: () => academicsApi.listSessions(),
    enabled: Boolean(user),
  });

  const [language, setLanguage] = useState(user?.preferred_language ?? "en");
  const [selectedSessionId, setSelectedSessionId] = useState(user?.selected_session_id ?? "");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const canChooseSession = (sessions.data ?? []).length > 0;
  const activeSessionLabel = useMemo(() => {
    const sessionId = user?.selected_session_id;
    if (!sessionId) return "Following active madrasa session";
    return sessions.data?.find((session) => session.id === sessionId)?.name ?? "Custom session";
  }, [sessions.data, user?.selected_session_id]);

  const saveProfile = useMutation({
    mutationFn: async () =>
      authApi.updateMe({
        preferred_language: language,
        ...(selectedSessionId
          ? { selected_session_id: selectedSessionId }
          : { clear_selected_session: true }),
      }),
    onSuccess: async () => {
      await refresh();
      toast.success("Profile updated");
      await client.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });

  const changePassword = useMutation({
    mutationFn: async () => {
      if (!currentPassword || !newPassword) throw new Error("Enter both passwords");
      if (newPassword.length < 8) throw new Error("New password must be at least 8 characters");
      if (newPassword !== confirmPassword) throw new Error("New passwords do not match");
      return authApi.changePassword({
        current_password: currentPassword,
        new_password: newPassword,
      });
    },
    onSuccess: () => {
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      toast.success("Password changed");
    },
    onError: (error: unknown) => {
      if (error instanceof Error) toast.error(error.message);
    },
  });

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
        <Row icon={<Building2 className="h-4 w-4" />} label="Madrasa" value={madrasa?.name ?? "—"} />
        <Row icon={<IdCard className="h-4 w-4" />} label="Tenant" value={madrasa?.slug ?? "—"} />
        <Row
          icon={<ShieldCheck className="h-4 w-4" />}
          label="Permissions"
          value={`${permissions.length} granted`}
        />
        <Row icon={<Globe className="h-4 w-4" />} label="Session" value={activeSessionLabel} />
      </div>

      <SectionTitle>Preferences</SectionTitle>
      <Card className="space-y-3 p-3.5">
        <Field label="Preferred language">
          <CustomDropdown value={language} onChange={(event) => setLanguage(event.target.value)}>
            <option value="en">English</option>
            <option value="ur">Urdu</option>
          </CustomDropdown>
        </Field>

        {canChooseSession ? (
          <Field label="Academic session">
            <CustomDropdown
              value={selectedSessionId}
              onChange={(event) => setSelectedSessionId(event.target.value)}
            >
              <option value="">Follow active madrasa session</option>
              {(sessions.data ?? []).map((session) => (
                <option key={session.id} value={session.id}>
                  {session.name}
                  {session.is_active ? " (Active)" : ""}
                </option>
              ))}
            </CustomDropdown>
          </Field>
        ) : null}

        <ActionButton
          onClick={() => saveProfile.mutate()}
          disabled={saveProfile.isPending || !user}
          className="w-full"
        >
          <Languages className="h-4 w-4" />
          Save preferences
        </ActionButton>
      </Card>

      <SectionTitle>Security</SectionTitle>
      <Card className="space-y-3 p-3.5">
        <Field label="Current password">
          <TextInput
            type="password"
            value={currentPassword}
            onChange={(event) => setCurrentPassword(event.target.value)}
          />
        </Field>
        <Field label="New password">
          <TextInput
            type="password"
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
          />
        </Field>
        <Field label="Confirm new password">
          <TextInput
            type="password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
          />
        </Field>
        <ActionButton
          onClick={() => changePassword.mutate()}
          disabled={changePassword.isPending}
          className="w-full"
        >
          <KeyRound className="h-4 w-4" />
          Change password
        </ActionButton>
      </Card>

      <SectionTitle>Session</SectionTitle>
      <ActionButton
        variant="danger"
        className="w-full"
        onClick={() => {
          logout();
          void navigate({ to: "/" });
        }}
      >
        <LogOut className="h-4 w-4" />
        Sign out
      </ActionButton>
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
      <span className="truncate text-right text-sm font-bold">{value}</span>
    </Card>
  );
}
