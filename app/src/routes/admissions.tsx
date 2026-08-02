import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { CheckCircle2, History, Phone, UserPlus, XCircle } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/app/AppShell";
import { FilterBar } from "@/components/app/FilterBar";
import { FormSheet } from "@/components/app/FormSheet";
import {
  ActionButton,
  Card,
  EmptyState,
  Field,
  Pill,
  CustomDropdown,
  SkeletonList,
  TextArea,
  TextInput,
} from "@/components/app/Primitives";
import { academicsApi } from "@/lib/mms/endpoints";
import { useAuth } from "@/lib/mms/auth";
import {
  academicsExtraApi,
  admissionsMutations,
  opsApi,
  peopleMutations,
  type AdmissionApplication,
} from "@/lib/mms/more-endpoints";
import { useTranslation } from "react-i18next";

export const Route = createFileRoute("/admissions")({
  head: () => ({
    meta: [
      { title: "Admissions — Suffa MS" },
      { name: "description", content: "Track admission applications from enquiry to enrolment." },
      { property: "og:title", content: "Admissions — Suffa MS" },
      {
        property: "og:description",
        content: "Track admission applications from enquiry to enrolment.",
      },
    ],
  }),
  component: AdmissionsPage,
});

const FILTERS = ["all", "pending", "accepted", "rejected"] as const;
const emptyExtra = { search: "" };

function AdmissionsPage() {
    const { t } = useTranslation();
  const { hasPermission } = useAuth();
  const canManage = hasPermission("admissions.manage");
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("all");
  const [extra, setExtra] = useState(emptyExtra);
  const [active, setActive] = useState<AdmissionApplication | null>(null);

  const query = useQuery({
    queryKey: ["admissions"],
    queryFn: () => opsApi.listAdmissions(),
    retry: false,
  });

  const items = useMemo(() => {
    const search = extra.search.trim().toLowerCase();
    return (query.data ?? []).filter((item) => {
      if (filter !== "all" && item.status !== filter) return false;
      if (!search) return true;
      return [
        item.applicant_name,
        item.guardian_contact,
        item.notes ?? "",
        item.form_title_snapshot ?? "",
      ]
        .join(" ")
        .toLowerCase()
        .includes(search);
    });
  }, [extra.search, filter, query.data]);

  const programs = useQuery({
    queryKey: ["programs"],
    queryFn: () => academicsExtraApi.listPrograms(),
    enabled: canManage,
    retry: false,
  });
  const forms = useQuery({
    queryKey: ["admission-forms"],
    queryFn: () => opsApi.listAdmissionForms(),
    enabled: canManage,
    retry: false,
  });

  const [applicant, setApplicant] = useState("");
  const [contact, setContact] = useState("");
  const [programId, setProgramId] = useState("");
  const [dob, setDob] = useState("");
  const [notes, setNotes] = useState("");
  const [formId, setFormId] = useState("");

  const create = useMutation({
    mutationFn: () => {
      const resolvedFormId = formId || forms.data?.find((form) => form.is_open)?.id;
      if (!resolvedFormId) throw new Error("Create an admission form first");
      return admissionsMutations.createAdmission({
        applicant_name: applicant.trim(),
        guardian_contact: contact.trim(),
        form_id: resolvedFormId,
        ...(programId ? { program_id: programId } : {}),
        ...(dob ? { date_of_birth: dob } : {}),
        ...(notes.trim() ? { notes: notes.trim() } : {}),
      });
    },
    onSuccess: () => {
      toast.success("Application added");
      setApplicant("");
      setContact("");
      setProgramId("");
      setDob("");
      setNotes("");
      setFormId("");
      void queryClient.invalidateQueries({ queryKey: ["admissions"] });
    },
    onError: (error: unknown) => {
      if (error instanceof Error) toast.error(error.message);
    },
  });

  const activeCount = (filter !== "all" ? 1 : 0) + (extra.search ? 1 : 0);

  return (
    <AppShell
      title={t("Admissions")}
      subtitle={`${items.length} applications`}
      right={
        canManage ? (
          <FormSheet
            title={t("New application")}
            triggerLabel="Add"
            submitLabel="Create"
            onSubmit={() => create.mutateAsync()}
          >
            <Field label={t("Admission form")}>
              <CustomDropdown value={formId} onChange={(e) => setFormId(e.target.value)}>
                <option value="">{t("Use first open form")}</option>
                {(forms.data ?? []).map((form) => (
                  <option key={form.id} value={form.id}>
                    {form.title}
                    {form.is_open ? " (Open)" : " (Closed)"}
                  </option>
                ))}
              </CustomDropdown>
            </Field>
            <Field label={t("Applicant name")}>
              <TextInput required value={applicant} onChange={(e) => setApplicant(e.target.value)} />
            </Field>
            <Field label={t("Guardian contact")}>
              <TextInput required value={contact} onChange={(e) => setContact(e.target.value)} />
            </Field>
            <Field label={t("Program")}>
              <CustomDropdown value={programId} onChange={(e) => setProgramId(e.target.value)}>
                <option value="">{t("Keep form program")}</option>
                {(programs.data ?? []).map((program) => (
                  <option key={program.id} value={program.id}>
                    {program.name}
                  </option>
                ))}
              </CustomDropdown>
            </Field>
            <Field label={t("Date of birth")}>
              <TextInput type="date" value={dob} onChange={(e) => setDob(e.target.value)} />
            </Field>
            <Field label={t("Notes")}>
              <TextArea value={notes} onChange={(e) => setNotes(e.target.value)} />
            </Field>
          </FormSheet>
        ) : undefined
      }
    >
      <FilterBar
        chips={FILTERS.map((key) => ({
          key,
          label: key,
          active: filter === key,
          onClick: () => setFilter(key),
        }))}
        search={{
          value: extra.search,
          onChange: (v) => setExtra({ search: v }),
          placeholder: "Search applicant, guardian…",
        }}
        activeCount={activeCount}
        onClear={() => {
          setFilter("all");
          setExtra(emptyExtra);
        }}
      />

      {query.isLoading ? <SkeletonList rows={5} /> : null}
      {query.isError ? (
        <EmptyState title={t("Admissions unavailable")} hint="You may not have access to this module." />
      ) : null}
      {!query.isLoading && !query.isError && items.length === 0 ? (
        <EmptyState title={t("No applications")} />
      ) : null}

      <div className="space-y-2.5">
        {items.map((item) => (
          <Card key={item.id} className="space-y-2 p-3.5">
            <button type="button" className="block w-full text-left" onClick={() => setActive(item)}>
              <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary">
                  <UserPlus className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <p className="truncate font-semibold">{item.applicant_name}</p>
                  <p className="flex items-center gap-1 truncate text-xs text-muted-foreground">
                    <Phone className="h-3.5 w-3.5" />
                    {item.guardian_contact}
                  </p>
                </div>
                <Pill
                  tone={
                    item.status === "accepted"
                      ? "success"
                      : item.status === "rejected"
                        ? "destructive"
                        : "warning"
                  }
                >
                  {item.status}
                </Pill>
              </div>
              {item.notes ? <p className="mt-2 text-sm text-muted-foreground">{item.notes}</p> : null}
            </button>
          </Card>
        ))}
      </div>

      {active ? (
        <AdmissionDetailSheet
          application={active}
          onClose={() => setActive(null)}
          canManage={canManage}
        />
      ) : null}
    </AppShell>
  );
}

function AdmissionDetailSheet({
  application,
  onClose,
  canManage,
}: {
  application: AdmissionApplication;
  onClose: () => void;
  canManage: boolean;
}) {
    const { t } = useTranslation();
  const client = useQueryClient();
  const sessions = useQuery({ queryKey: ["sessions"], queryFn: () => academicsApi.listSessions(), enabled: canManage });
  const classes = useQuery({ queryKey: ["classes"], queryFn: () => academicsApi.listClasses(), enabled: canManage });
  const sections = useQuery({
    queryKey: ["admission-sections", application.id],
    queryFn: async () => {
      const rows = await Promise.all((classes.data ?? []).map((item) => academicsExtraApi.listSections(item.id)));
      return rows.flat();
    },
    enabled: canManage && Boolean(classes.data),
  });
  const statusHistory = useQuery({
    queryKey: ["admission-history", application.id],
    queryFn: () => opsApi.getAdmissionStatusHistory(application.id),
    enabled: canManage,
  });

  const [applicantName, setApplicantName] = useState(application.applicant_name);
  const [guardianContact, setGuardianContact] = useState(application.guardian_contact);
  const [notes, setNotes] = useState(application.notes ?? "");
  const [dateOfBirth, setDateOfBirth] = useState(application.date_of_birth ?? "");
  const [studentUsername, setStudentUsername] = useState("");
  const [guardianUsername, setGuardianUsername] = useState("");
  const [sessionId, setSessionId] = useState("");
  const [classId, setClassId] = useState("");
  const [sectionId, setSectionId] = useState("");
  const [guardianName, setGuardianName] = useState("");
  const [guardianRelationship, setGuardianRelationship] = useState("");

  const save = useMutation({
    mutationFn: () =>
      admissionsMutations.updateAdmission(application.id, {
        applicant_name: applicantName.trim(),
        guardian_contact: guardianContact.trim(),
        ...(notes.trim() ? { notes: notes.trim() } : { notes: "" }),
        ...(dateOfBirth ? { date_of_birth: dateOfBirth } : {}),
      }),
    onSuccess: () => {
      toast.success("Application updated");
      void client.invalidateQueries({ queryKey: ["admissions"] });
    },
  });

  const setStatus = useMutation({
    mutationFn: (status: "pending" | "rejected") => opsApi.setAdmissionStatus(application.id, status),
    onSuccess: () => {
      toast.success("Status updated");
      void client.invalidateQueries({ queryKey: ["admissions"] });
      void client.invalidateQueries({ queryKey: ["admission-history", application.id] });
    },
  });

  const proposal = useQuery({
    queryKey: ["username-proposal", applicantName],
    queryFn: () => peopleMutations.usernameProposal(applicantName),
    enabled: canManage && applicantName.trim().length >= 3 && !studentUsername,
  });

  const convert = useMutation({
    mutationFn: () => {
      if (!studentUsername.trim()) throw new Error("Student username is required");
      if (!sessionId || !classId || !sectionId) throw new Error("Pick session, class, and section");
      return admissionsMutations.convertAdmission(application.id, {
        student_username: studentUsername.trim(),
        guardian_username: guardianUsername.trim() || undefined,
        session_id: sessionId,
        class_id: classId,
        section_id: sectionId,
        guardian_name: guardianName.trim() || undefined,
        guardian_relationship: guardianRelationship.trim() || undefined,
      });
    },
    onSuccess: (result) => {
      toast.success(result.already_converted ? "Already converted" : "Application converted");
      if (result.student_set_password_url) navigator.clipboard.writeText(result.student_set_password_url).catch(() => {});
      void client.invalidateQueries({ queryKey: ["admissions"] });
      void client.invalidateQueries({ queryKey: ["admission-history", application.id] });
    },
    onError: (error: unknown) => {
      if (error instanceof Error) toast.error(error.message);
    },
  });

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
      <div className="max-h-[88vh] w-full max-w-3xl overflow-y-auto rounded-3xl bg-card p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate font-display text-lg font-extrabold">{application.applicant_name}</p>
            <p className="text-sm text-muted-foreground">
              {application.form_title_snapshot ?? "Admission application"} · {new Date(application.created_at).toLocaleString()}
            </p>
          </div>
          <ActionButton variant="ghost" onClick={onClose}>
            {t("Close")}</ActionButton>
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <Card className="space-y-3 p-3.5">
            <Field label={t("Applicant name")}>
              <TextInput value={applicantName} onChange={(e) => setApplicantName(e.target.value)} />
            </Field>
            <Field label={t("Guardian contact")}>
              <TextInput value={guardianContact} onChange={(e) => setGuardianContact(e.target.value)} />
            </Field>
            <Field label={t("Date of birth")}>
              <TextInput type="date" value={dateOfBirth} onChange={(e) => setDateOfBirth(e.target.value)} />
            </Field>
            <Field label={t("Notes")}>
              <TextArea value={notes} onChange={(e) => setNotes(e.target.value)} />
            </Field>
            <ActionButton onClick={() => save.mutate()} disabled={save.isPending} className="w-full">
              {t("Save application")}</ActionButton>
          </Card>

          <Card className="space-y-3 p-3.5">
            <div className="flex flex-wrap gap-2">
              <Pill
                tone={
                  application.status === "accepted"
                    ? "success"
                    : application.status === "rejected"
                      ? "destructive"
                      : "warning"
                }
              >
                {application.status}
              </Pill>
              {application.converted_at ? <Pill tone="gold">{t("Converted")}</Pill> : null}
            </div>
            <div className="flex flex-wrap gap-2">
              {application.status !== "rejected" ? (
                <ActionButton variant="danger" onClick={() => setStatus.mutate("rejected")}>
                  <XCircle className="h-4 w-4" />
                  {t("Reject")}</ActionButton>
              ) : null}
              {application.status !== "pending" ? (
                <ActionButton variant="soft" onClick={() => setStatus.mutate("pending")}>
                  {t("Return to pending")}</ActionButton>
              ) : null}
            </div>

            <Field label={t("Status history")}>
              {statusHistory.isLoading ? <SkeletonList rows={2} /> : null}
              <div className="space-y-2">
                {(statusHistory.data ?? application.status_history ?? []).map((entry, index) => (
                  <div key={`${entry.changed_at}-${index}`} className="rounded-2xl bg-muted px-3 py-2 text-sm">
                    <div className="flex items-center gap-2 font-semibold">
                      <History className="h-4 w-4" />
                      {entry.status}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {new Date(entry.changed_at).toLocaleString()}
                    </p>
                  </div>
                ))}
              </div>
            </Field>
          </Card>
        </div>

        {canManage ? (
          <>
            <SectionHeader title={t("Convert to student")} />
            <Card className="grid gap-3 p-3.5 lg:grid-cols-2">
              <Field label={t("Student username")}>
                <TextInput
                  value={studentUsername}
                  onChange={(e) => setStudentUsername(e.target.value)}
                  placeholder={proposal.data ?? "student username"}
                />
              </Field>
              <Field label={t("Guardian username")}>
                <TextInput value={guardianUsername} onChange={(e) => setGuardianUsername(e.target.value)} />
              </Field>
              <Field label={t("Session")}>
                <CustomDropdown value={sessionId} onChange={(e) => setSessionId(e.target.value)}>
                  <option value="">{t("Select session")}</option>
                  {(sessions.data ?? []).map((session) => (
                    <option key={session.id} value={session.id}>
                      {session.name}
                    </option>
                  ))}
                </CustomDropdown>
              </Field>
              <Field label={t("Class")}>
                <CustomDropdown value={classId} onChange={(e) => setClassId(e.target.value)}>
                  <option value="">{t("Select class")}</option>
                  {(classes.data ?? []).map((academicClass) => (
                    <option key={academicClass.id} value={academicClass.id}>
                      {academicClass.name}
                    </option>
                  ))}
                </CustomDropdown>
              </Field>
              <Field label={t("Section")}>
                <CustomDropdown value={sectionId} onChange={(e) => setSectionId(e.target.value)}>
                  <option value="">{t("Select section")}</option>
                  {(sections.data ?? [])
                    .filter((section) => !classId || section.class_id === classId)
                    .map((section) => (
                      <option key={section.id} value={section.id}>
                        {section.name}
                      </option>
                    ))}
                </CustomDropdown>
              </Field>
              <Field label={t("Guardian name override")}>
                <TextInput value={guardianName} onChange={(e) => setGuardianName(e.target.value)} />
              </Field>
              <Field label={t("Guardian relationship")}>
                <TextInput
                  value={guardianRelationship}
                  onChange={(e) => setGuardianRelationship(e.target.value)}
                />
              </Field>
              <div className="lg:col-span-2">
                <ActionButton onClick={() => convert.mutate()} disabled={convert.isPending} className="w-full">
                  <CheckCircle2 className="h-4 w-4" />
                  {t("Convert application")}</ActionButton>
              </div>
            </Card>
          </>
        ) : null}
      </div>
    </div>
  );
}

function SectionHeader({ title }: { title: string }) {
    const { t } = useTranslation();
  return <h3 className="mb-3 mt-6 font-display text-sm font-extrabold uppercase tracking-[0.14em] text-muted-foreground">{title}</h3>;
}
