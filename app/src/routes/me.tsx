import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Building2, Globe, IdCard, KeyRound, Languages, LogOut, Moon, ShieldCheck, Sun } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
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
import { peopleApi } from "@/lib/mms/endpoints";
import { PhoneNumbersField } from "@/components/app/people/PhoneNumbersField";
import { AdmissionAnswerFields } from "@/components/app/admissions/AdmissionAnswerFields";
import { useAuth } from "@/lib/mms/auth";
import { useTranslation } from "react-i18next";

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
    const { t } = useTranslation();
  const { user, madrasa, permissions, logout, refresh } = useAuth();
  const navigate = useNavigate();
  const client = useQueryClient();

  const [dark, setDark] = useState(false);

  useEffect(() => {
    const stored = window.localStorage.getItem("mms_theme") === "dark";
    setDark(stored);
  }, []);

  const toggleTheme = () => {
    const next = !dark;
    setDark(next);
    window.localStorage.setItem("mms_theme", next ? "dark" : "light");
    document.documentElement.classList.toggle("dark", next);
  };

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
  const personProfile = useQuery({ queryKey: ["my-person-profile"], queryFn: peopleApi.myProfile, enabled: user?.role === "student" || user?.role === "parent", retry: false });
  const [personName, setPersonName] = useState("");
  const [personAddress, setPersonAddress] = useState("");
  const [personCnic, setPersonCnic] = useState("");
  const [personDob, setPersonDob] = useState("");
  const [personPhones, setPersonPhones] = useState<string[]>(["+92"]);
  const [personDefaultPhone, setPersonDefaultPhone] = useState("+92");
  const [admissionAnswers, setAdmissionAnswers] = useState<Record<string, unknown>>({});

  useEffect(() => {
    setLanguage(user?.preferred_language ?? "en");
    setSelectedSessionId(user?.selected_session_id ?? "");
  }, [user?.preferred_language, user?.selected_session_id]);
  useEffect(() => {
    const profile = personProfile.data?.profile as Record<string, unknown> | undefined;
    if (!profile) return;
    setPersonName(String(profile.name ?? "")); setPersonAddress(String(profile.address ?? ""));
    setPersonCnic(String(profile.cnic ?? profile.b_form_number ?? "")); setPersonDob(String(profile.date_of_birth ?? ""));
    const phones = Array.isArray(profile.phone_list) && profile.phone_list.length ? profile.phone_list.map(String) : [String(profile.default_phone_number ?? profile.phone ?? profile.phone_numbers ?? "+92")];
    setPersonPhones(phones); setPersonDefaultPhone(String(profile.default_phone_number ?? phones[0]));
    setAdmissionAnswers((profile.admission_record as { answers?: Record<string, unknown> } | undefined)?.answers ?? {});
  }, [personProfile.data]);

  const savePersonProfile = useMutation({ mutationFn: () => peopleApi.updateMyProfile(personProfile.data?.profile_type === "guardian" ? { name: personName, address: personAddress, cnic: personCnic, phone_list: personPhones.filter((phone) => phone.length > 3), default_phone_number: personDefaultPhone } : { name: personName, date_of_birth: personDob || undefined, b_form_number: personCnic, address: personAddress, phone_list: personPhones.filter((phone) => phone.length > 3), default_phone_number: personDefaultPhone, admission_answers: admissionAnswers }), onSuccess: () => { toast.success("Profile updated"); void client.invalidateQueries({ queryKey: ["my-person-profile"] }); } });

  const canChooseSession = (sessions.data ?? []).length > 0;
  const activeSession = useMemo(
    () => (sessions.data ?? []).find((session) => session.is_active) ?? null,
    [sessions.data],
  );
  const selectedSession = useMemo(
    () => (selectedSessionId ? (sessions.data ?? []).find((session) => session.id === selectedSessionId) ?? null : null),
    [selectedSessionId, sessions.data],
  );
  const isViewingReadOnlySession = Boolean(selectedSession && !selectedSession.is_active);
  const activeSessionLabel = useMemo(() => {
    const sessionId = user?.selected_session_id;
    if (!sessionId) return activeSession ? `${activeSession.name} (Active)` : "Following active madrasa session";
    return sessions.data?.find((session) => session.id === sessionId)?.name ?? "Custom session";
  }, [activeSession, sessions.data, user?.selected_session_id]);

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
      await client.invalidateQueries();
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
    <AppShell title={t("My Profile")} subtitle={madrasa?.name ?? "Suffa MS"}>
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

      <SectionTitle>{t("Account")}</SectionTitle>
      <div className="space-y-2.5">
        <Row icon={<Building2 className="h-4 w-4" />} label={t("Madrasa")} value={madrasa?.name ?? "—"} />
        <Row icon={<IdCard className="h-4 w-4" />} label={t("Tenant")} value={madrasa?.slug ?? "—"} />
        <Row
          icon={<ShieldCheck className="h-4 w-4" />}
          label={t("Permissions")}
          value={`${permissions.length} granted`}
        />
        <Row icon={<Globe className="h-4 w-4" />} label={t("Session")} value={activeSessionLabel} />
      </div>

      {personProfile.data ? <><SectionTitle>{t("Personal profile")}</SectionTitle><Card className="space-y-3 p-3.5"><Field label={t("Full name")}><TextInput value={personName} onChange={(event) => setPersonName(event.target.value)} /></Field>{personProfile.data.profile_type === "student" ? <><Field label={t("Date of birth")}><TextInput type="date" value={personDob} onChange={(event) => setPersonDob(event.target.value)} /></Field><Field label={t("B-Form number")}><TextInput value={personCnic} onChange={(event) => setPersonCnic(event.target.value)} /></Field></> : <Field label={t("CNIC")}><TextInput value={personCnic} onChange={(event) => setPersonCnic(event.target.value)} /></Field>}{(personProfile.data.profile_type === "guardian" || Boolean((personProfile.data.profile as any).is_independent)) ? <><Field label={t("Address")}><TextInput value={personAddress} onChange={(event) => setPersonAddress(event.target.value)} /></Field><Field label={t("Phone number(s)")}><PhoneNumbersField numbers={personPhones} defaultNumber={personDefaultPhone} onChange={(numbers, defaultNumber) => { setPersonPhones(numbers); setPersonDefaultPhone(defaultNumber); }} /></Field></> : <p className="text-sm text-muted-foreground">Contact details are managed by your guardian.</p>}{personProfile.data.profile_type === "student" && (personProfile.data.profile as any).admission_record ? <AdmissionAnswerFields fields={((personProfile.data.profile as any).admission_record.fields_definition ?? []).filter((field: any) => !field.built_in && !field.key.startsWith("guardian_"))} answers={admissionAnswers} onChange={setAdmissionAnswers} /> : null}<ActionButton onClick={() => savePersonProfile.mutate()} disabled={savePersonProfile.isPending} className="w-full">{t("Save profile")}</ActionButton></Card></> : null}

      <SectionTitle>{t("Preferences")}</SectionTitle>
      <Card className="space-y-3 p-3.5">
        <Field label={t("Preferred language")}>
          <CustomDropdown value={language} onChange={(event) => setLanguage(event.target.value)}>
            <option value="en">{t("English")}</option>
            <option value="ur">{t("Urdu")}</option>
          </CustomDropdown>
        </Field>

        {canChooseSession ? (
          <Field label={t("Academic session")}>
            <CustomDropdown
              value={selectedSessionId}
              onChange={(event) => setSelectedSessionId(event.target.value)}
            >
              <option value="">
                {activeSession
                  ? `${t("Follow active madrasa session")} (${activeSession.name})`
                  : t("Follow active madrasa session")}
              </option>
              {(sessions.data ?? []).map((session) => (
                <option key={session.id} value={session.id}>
                  {session.name}
                  {session.is_active ? " (Active)" : " (Read only)"}
                </option>
              ))}
            </CustomDropdown>
          </Field>
        ) : null}

        {isViewingReadOnlySession ? (
          <div className="space-y-1.5 rounded-xl bg-accent-soft p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-extrabold">{t("Read-only session")}</p>
              <Pill tone="gold">{t("Archive")}</Pill>
            </div>
            <p className="text-xs font-semibold text-muted-foreground">
              {t("Previous sessions can be viewed for attendance, assignments and results. Changes are only allowed in the active session.")}
            </p>
          </div>
        ) : null}

        <ActionButton
          onClick={() => saveProfile.mutate()}
          disabled={saveProfile.isPending || !user}
          className="w-full"
        >
          <Languages className="h-4 w-4" />
          {t("Save preferences")}        </ActionButton>
      </Card>

      <SectionTitle>{t("Appearance")}</SectionTitle>
      <Card className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 p-3.5">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary">
          {dark ? <Moon className="h-5 w-5" /> : <Sun className="h-5 w-5" />}
        </span>
        <div className="min-w-0">
          <p className="truncate font-semibold">{t("Dark mode")}</p>
          <p className="truncate text-xs text-muted-foreground">{t("Easier on the eyes at night")}</p>
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

      <SectionTitle>{t("Security")}</SectionTitle>
      <Card className="space-y-3 p-3.5">
        <Field label={t("Current password")}>
          <TextInput
            type="password"
            value={currentPassword}
            onChange={(event) => setCurrentPassword(event.target.value)}
          />
        </Field>
        <Field label={t("New password")}>
          <TextInput
            type="password"
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
          />
        </Field>
        <Field label={t("Confirm new password")}>
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
          {t("Change password")}</ActionButton>
      </Card>

      <SectionTitle>{t("Session")}</SectionTitle>
      <ActionButton
        variant="danger"
        className="w-full"
        onClick={() => {
          logout();
          void navigate({ to: "/" });
        }}
      >
        <LogOut className="h-4 w-4" />
        {t("Sign out")}</ActionButton>
    </AppShell>
  );
}

function Row({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
    const { t } = useTranslation();
  return (
    <Card className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 p-3.5">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary">
        {icon}
      </span>
      <span className="truncate text-sm font-semibold text-muted-foreground ltr:text-left rtl:text-right">{label}</span>
      <span className="truncate text-sm font-bold ltr:text-right rtl:text-left">{value}</span>
    </Card>
  );
}
