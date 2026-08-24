import { ArrowLeft, Copy, Download, Image, ShieldCheck, ShieldOff, UserRound, ArrowRight } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { useNavigate } from "@tanstack/react-router";

import { ActionButton, Pill, ManagedSheet, ActionBar, CustomDropdown, SearchableSelect, Field, SectionTitle } from "@/components/app/Primitives";
import { WhatsAppSendAction } from "@/components/app/WhatsAppSendAction";
import { StudentForm } from "./StudentForm";
import { TeacherForm } from "./TeacherForm";
import { GuardianForm } from "./GuardianForm";
import { DonorForm } from "./DonorForm";
import { academicsApi, peopleApi, reportingApi } from "@/lib/mms/endpoints";
import { filesApi, financeApi, academicsExtraApi } from "@/lib/mms/more-endpoints";
import { api, apiErrorMessage } from "@/lib/mms/api";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import {
  peopleMutations,
  financeMutations,
  rolesApi,
  type GuardianDetail,
  type StudentDetail,
  type TeacherDetail,
  type DonorFinanceProfile,
  type Donor,
  type PermissionRole,
} from "@/lib/mms/more-endpoints";
import { useTranslation } from "react-i18next";

function Row({ label, value }: { label: string; value: React.ReactNode }) {
    const { t } = useTranslation();
  return (
    <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-3 border-b border-border py-2 text-sm last:border-0">
      <span className="font-semibold text-muted-foreground">{label}</span>
      <span className="text-right">{value ?? "—"}</span>
    </div>
  );
}

function money(amount: number, currency = "PKR") {
  return `${currency} ${Number(amount ?? 0).toLocaleString()}`;
}

async function copyCredentialsLink(
  fetcher: () => Promise<{ username: string; set_password_url: string }>,
  t: (key: string) => string,
) {
  try {
    const data = await fetcher();
    await navigator.clipboard.writeText(data.set_password_url);
    toast.success(`${t("Link copied for")} ${data.username}`);
  } catch {
    toast.error(t("Failed to generate credentials link"));
  }
}

type CredentialSubjectType = "student" | "teacher" | "guardian";

async function sendCredentialsToWhatsApp({
  subjectType,
  subjectId,
  phoneNumber,
  fetcher,
  t,
}: {
  subjectType: CredentialSubjectType;
  subjectId: string;
  phoneNumber?: string;
  fetcher: () => Promise<{ username: string; set_password_url: string }>;
  t: (key: string) => string;
}) {
  try {
    const credentials = await fetcher();
    const setupUrl = credentials.set_password_url.startsWith("http")
      ? credentials.set_password_url
      : new URL(credentials.set_password_url, window.location.origin).toString();
    const result = await peopleMutations.sendCredentialsToWhatsApp({
      subject_type: subjectType,
      subject_id: subjectId,
      set_password_url: setupUrl,
      phone_number: phoneNumber || undefined,
    });
    toast.success(`${t("Credentials sent on WhatsApp")} +${result.normalised_number}`);
  } catch (error) {
    toast.error(apiErrorMessage(error, t("Failed to send credentials on WhatsApp")));
  }
}

function phoneOptions(value: string | null | undefined, label: string) {
  return (value ?? "")
    .replace(/;/g, ",")
    .split(",")
    .map((phone) => phone.trim())
    .filter(Boolean)
    .map((phone) => ({ value: phone, label: `${label}: ${phone}` }));
}

export function StudentDetailSheet({
  student,
  open,
  onOpenChange,
  page = false,
}: {
  student: StudentDetail | null;
  open: boolean;
  onOpenChange: (next: boolean) => void;
  page?: boolean;
}) {
    const { t } = useTranslation();
  const client = useQueryClient();
  const [editOpen, setEditOpen] = useState(false);
  const [confirmDeactivate, setConfirmDeactivate] = useState(false);
  const [confirmReactivate, setConfirmReactivate] = useState(false);
  const [credentialPhone, setCredentialPhone] = useState("");
  const [photoOpen, setPhotoOpen] = useState(false);

  const guardiansQuery = useQuery({
    queryKey: ["student-guardians", student?.id],
    queryFn: () => peopleMutations.studentGuardians(student!.id),
    enabled: Boolean(student && open),
  });

  const incompleteQuery = useQuery({
    queryKey: ["incomplete-profiles", "student"],
    queryFn: () => reportingApi.incompleteProfiles("student"),
    enabled: Boolean(student && open && student.status === "active"),
  });
  const missingFields = incompleteQuery.data?.find((p) => p.id === student?.id)?.missing_fields;

  const [editEnrollment, setEditEnrollment] = useState(false);
  const [enrollClassId, setEnrollClassId] = useState(student?.active_enrollment?.class_id ?? "");
  const [enrollSectionId, setEnrollSectionId] = useState(student?.active_enrollment?.section_id ?? "");

  const classesQuery = useQuery({
    queryKey: ["classes"],
    queryFn: () => academicsApi.listClasses(),
    enabled: editEnrollment,
  });

  const sectionsQuery = useQuery({
    queryKey: ["sections", enrollClassId],
    queryFn: () => (enrollClassId ? academicsExtraApi.listSections(enrollClassId) : Promise.resolve([])),
    enabled: editEnrollment && Boolean(enrollClassId),
  });

  const photoQuery = useQuery({
    queryKey: ["student-photo", student?.photo_file_id],
    queryFn: () => filesApi.presignDownloadById(student!.photo_file_id!),
    enabled: Boolean(open && student?.photo_file_id),
    retry: false,
  });

  async function submitEnrollment() {
    if (!enrollClassId || !enrollSectionId || !student) return;
    const activeSession = (await academicsApi.listSessions()).find((s) => s.is_active);
    if (!activeSession) { toast.error("No active session"); return; }
    const cls = classesQuery.data?.find((c) => c.id === enrollClassId);
    if (!cls) { toast.error("Class not found"); return; }
    try {
      await api.post("/api/v1/academics/students/enroll", {
        student_id: student.id,
        session_id: activeSession.id,
        program_id: cls.program_id,
        class_id: enrollClassId,
        section_id: enrollSectionId,
      });
      toast.success("Enrollment updated");
      setEditEnrollment(false);
      void client.invalidateQueries({ queryKey: ["people"] });
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err?.response?.data?.detail ?? "Failed to enroll");
    }
  }

  if (!student) return null;

  const credentialPhoneOptions = [
    ...(student.is_independent ? phoneOptions(student.phone_list?.join(",") || student.phone, t("Student")) : []),
    ...(guardiansQuery.data ?? []).flatMap((guardian) => phoneOptions(guardian.phone_list?.join(",") || guardian.phone_numbers, guardian.name)),
  ];
  const missingRequiredGuardian =
    !student.is_independent && !guardiansQuery.isLoading && (guardiansQuery.data ?? []).length === 0;

  async function deactivate() {
    await peopleMutations.deactivateStudent(student!.id);
    toast.success("Student deactivated");
    void client.invalidateQueries({ queryKey: ["people"] });
    onOpenChange(false);
  }

  async function reactivate() {
    await peopleMutations.reactivateStudent(student!.id);
    toast.success("Student reactivated");
    void client.invalidateQueries({ queryKey: ["people"] });
    onOpenChange(false);
  }

  return (
    <>
    <StudentDetailContainer
      page={page}
      onBack={() => onOpenChange(false)}
      open={open}
      title={student.name}
      photoUrl={photoQuery.data}
      onPhotoClick={() => setPhotoOpen(true)}
      subtitle={
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <Pill tone={student.status === "active" ? "success" : "muted"}>{student.status}</Pill>
            <span className="text-xs text-muted-foreground">{student.admission_number}</span>
          </div>
          <div className="flex flex-wrap items-center gap-2 empty:hidden">
            {missingFields?.map((field) => (
              <Pill key={field} tone="warning">Missing: {field}</Pill>
            ))}
          </div>
        </div>
      }
    >
      <div className="mb-4">
          <Row label={t("Date of birth")} value={student.date_of_birth} />
          <Row label={t("Phone")} value={student.is_independent ? (student.phone_list?.join(" · ") || student.phone) : (guardiansQuery.data ?? []).flatMap((guardian) => (guardian.phone_list?.length ? guardian.phone_list : guardian.phone_numbers.split(",").map((phone) => phone.trim()))).join(" · ")} />
          <Row label={t("B-Form #")} value={student.b_form_number} />
          <Row label={t("Address")} value={student.is_independent ? student.address : (guardiansQuery.data ?? []).map((guardian) => guardian.address).filter(Boolean).join(" · ")} />
          <Row label={t("Independent")} value={student.is_independent ? "Yes" : "No"} />
          <Row label={t("Portal access")} value={student.portal_enabled ? "Enabled" : "Disabled"} />
          {student.active_enrollment ? (
            <>
              <Row label={t("Session")} value={student.active_enrollment.session_name} />
              <Row
                label={t("Class")}
                value={`${student.active_enrollment.class_name} · ${student.active_enrollment.section_name}`}
              />
              <Row label={t("Program")} value={student.active_enrollment.program_name} />
            </>
          ) : (
            <Row label={t("Enrollment")} value="No active enrollment" />
          )}

          {student.admission_record ? (
            <div className="mt-4 border-t border-border pt-3">
              <SectionTitle>{student.admission_record.form_title ?? t("Admission application")}</SectionTitle>
              <div className="mt-2">
                {student.admission_record.fields_definition
                  .filter((field) => field.enabled !== false && field.type !== "label" && !field.built_in && !field.key.startsWith("guardian_"))
                  .map((field) => {
                    const answer = student.admission_record?.answers[field.key];
                    if (field.type === "file" || field.type === "image") return <Row key={field.key} label={field.label} value={typeof answer === "string" && answer ? <button type="button" onClick={async () => { const url = await filesApi.presignDownload(answer); window.open(url, "_blank", "noopener,noreferrer"); }} className="inline-flex items-center gap-1 font-semibold text-primary"><>{field.type === "image" ? <Image className="h-4 w-4" /> : <Download className="h-4 w-4" />}</> {t("Open")}</button> : "—"} />;
                    return <Row key={field.key} label={field.label} value={answer === undefined || answer === "" ? "—" : Array.isArray(answer) ? answer.join(", ") : String(answer)} />;
                  })}
              </div>
            </div>
          ) : null}

          {editEnrollment ? (
            <div className="space-y-3 border-t border-border px-2 pt-3">
              <Field label={t("Class")}>
                <CustomDropdown
                  value={enrollClassId}
                  onChange={(e) => { setEnrollClassId(e.target.value); setEnrollSectionId(""); }}
                >
                  <option value="">{t("Select class")}</option>
                  {(classesQuery.data ?? []).map((c) => (<option key={c.id} value={c.id}>{c.name}</option>))}
                </CustomDropdown>
              </Field>
              {enrollClassId ? (
                <Field label={t("Section")}>
                  <CustomDropdown value={enrollSectionId} onChange={(e) => setEnrollSectionId(e.target.value)}>
                    <option value="">{t("Select section")}</option>
                    {(sectionsQuery.data ?? []).map((s) => (<option key={s.id} value={s.id}>{s.name}</option>))}
                  </CustomDropdown>
                </Field>
              ) : null}
              <div className="flex gap-2">
                <ActionButton variant="soft" className="flex-1" onClick={submitEnrollment}>
                  {t("Save")}</ActionButton>
                <ActionButton variant="ghost" onClick={() => setEditEnrollment(false)}>
                  {t("Cancel")}</ActionButton>
              </div>
            </div>
          ) : (
            <ActionBar>
              <ActionButton
                className="flex-1"
                variant="soft"
                onClick={() => setEditEnrollment(true)}
              >
                {student.active_enrollment ? t("Change class / section") : t("Enroll in class")}
              </ActionButton>
            </ActionBar>
          )}
        </div>

        <div className="mb-4">
          <p className="mb-1 text-xs font-semibold text-muted-foreground">{t("Guardians")}</p>
          {missingRequiredGuardian ? (
            <p className="mb-2 rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {t("A dependent student requires at least one guardian")}
            </p>
          ) : null}
          <div className="mb-2 flex flex-wrap gap-1.5">
            {(guardiansQuery.data ?? []).map((g) => (
              <button key={g.id} type="button" onClick={() => { peopleMutations.unlinkStudentFromGuardian(g.id, student.id).then(() => { void client.invalidateQueries({ queryKey: ["student-guardians", student.id] }); }); }} className="rounded-full bg-primary-soft px-2.5 py-1 text-xs font-bold text-primary">{g.name} ×</button>
            ))}
          </div>
          <GuardianSearchSelect
            excludeIds={(guardiansQuery.data ?? []).map((g) => g.id)}
            onSelect={(guardianId) => {
              peopleMutations.linkStudentToGuardian(guardianId, student.id).then(() => {
                void client.invalidateQueries({ queryKey: ["student-guardians", student.id] });
              });
            }}
          />
        </div>

        <ActionBar>
          <ActionButton className="flex-1" variant="soft" onClick={() => setEditOpen(true)}>
            {t("Edit")}</ActionButton>
          <ActionButton
            className="flex-1"
            variant="soft"
            onClick={() =>
              copyCredentialsLink(() => peopleMutations.studentCredentialsLink(student.id), t)
            }
          >
            <Copy className="h-4 w-4" /> {t("Credentials link")}</ActionButton>
        </ActionBar>
        {credentialPhoneOptions.length > 1 ? (
          <div className="mt-2">
            <Field label={t("Credential recipient")}>
              <CustomDropdown value={credentialPhone} onChange={(event) => setCredentialPhone(event.target.value)}>
                <option value="">{t("Default recipient")}</option>
                {credentialPhoneOptions.map((option) => (
                  <option key={`${option.label}-${option.value}`} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </CustomDropdown>
            </Field>
          </div>
        ) : null}
        <ActionBar className="mt-2">
          <WhatsAppSendAction
            disabled={credentialPhoneOptions.length === 0}
            onSend={() =>
              sendCredentialsToWhatsApp({
                subjectType: "student",
                subjectId: student.id,
                phoneNumber: credentialPhone || credentialPhoneOptions[0]?.value,
                fetcher: () => peopleMutations.studentCredentialsLink(student.id),
                t,
              })
            }
          >
            {t("Send via WhatsApp")}
          </WhatsAppSendAction>
        </ActionBar>
        {credentialPhoneOptions.length === 0 ? (
          <p className="mt-1 text-xs text-muted-foreground">
            {t("Link a guardian with a WhatsApp number before sending credentials.")}
          </p>
        ) : null}
        {student.status === "active" ? (
          confirmDeactivate ? (
            <ActionBar className="mt-2">
              <ActionButton variant="danger" className="flex-1" onClick={deactivate}>
                <ShieldOff className="h-4 w-4" /> {t("Confirm deactivate")}</ActionButton>
              <ActionButton className="flex-1" variant="ghost" onClick={() => setConfirmDeactivate(false)}>
                {t("Cancel")}</ActionButton>
            </ActionBar>
          ) : (
            <ActionBar className="mt-2">
              <ActionButton
                variant="danger"
                className="w-full"
                onClick={() => setConfirmDeactivate(true)}
              >
                <ShieldOff className="h-4 w-4" /> {t("Deactivate")}</ActionButton>
            </ActionBar>
          )
        ) : confirmReactivate ? (
          <ActionBar className="mt-2">
            <ActionButton variant="success" className="flex-1" onClick={reactivate}>
              <ShieldCheck className="h-4 w-4" /> {t("Confirm reactivate")}</ActionButton>
            <ActionButton className="flex-1" variant="ghost" onClick={() => setConfirmReactivate(false)}>
              {t("Cancel")}</ActionButton>
          </ActionBar>
        ) : (
          <ActionBar className="mt-2">
            <ActionButton
              variant="success"
              className="w-full"
              onClick={() => setConfirmReactivate(true)}
            >
              <ShieldCheck className="h-4 w-4" /> {t("Reactivate")}</ActionButton>
          </ActionBar>
        )}

        <StudentForm student={student} open={editOpen} onOpenChange={setEditOpen} />
    </StudentDetailContainer>
    <Dialog open={photoOpen} onOpenChange={setPhotoOpen}>
      <DialogContent className="max-w-4xl border-0 bg-transparent p-2 shadow-none [&>button]:text-white">
        <DialogTitle className="sr-only">{t("Profile picture")}</DialogTitle>
        {photoQuery.data ? <img src={photoQuery.data} alt={student.name} className="max-h-[78vh] w-auto max-w-full rounded-lg object-contain" /> : null}
      </DialogContent>
    </Dialog>
    </>
  );
}

export function StudentDetailContainer({
  page,
  open,
  onBack,
  title,
  photoUrl,
  onPhotoClick,
  subtitle,
  children,
}: {
  page: boolean;
  open: boolean;
  onBack: () => void;
  title: string;
  photoUrl?: string;
  onPhotoClick: () => void;
  subtitle: React.ReactNode;
  children: React.ReactNode;
}) {
  if (!page) return <ManagedSheet open={open} onOpenChange={(next) => !next && onBack()} title={title} subtitle={subtitle}>{children}</ManagedSheet>;
  const initials = title.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
  return <div className="mx-auto w-full max-w-4xl space-y-4 px-4 py-5 sm:px-6"><div className="flex items-start gap-3"><button type="button" aria-label="Back" onClick={onBack} className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-muted"><ArrowLeft className="h-5 w-5" /></button>{photoUrl ? <button type="button" onClick={onPhotoClick} aria-label="View profile picture" className="grid h-12 w-12 shrink-0 cursor-zoom-in place-items-center overflow-hidden rounded-full bg-primary-soft text-primary" title="View profile picture"><img src={photoUrl} alt="" className="h-full w-full object-cover" /></button> : <div className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-full bg-primary-soft text-primary" title="Profile picture"><UserRound className="h-5 w-5" /><span className="sr-only">{initials || "Student"}</span></div>}<div className="min-w-0 [overflow-wrap:anywhere]"><h1 className="font-display text-xl font-extrabold [overflow-wrap:anywhere]">{title}</h1>{subtitle}</div></div><div className="rounded-2xl border border-border bg-card p-4 shadow-sm">{children}</div></div>;
}

export function TeacherDetailSheet({
  teacher,
  open,
  onOpenChange,
}: {
  teacher: TeacherDetail | null;
  open: boolean;
  onOpenChange: (next: boolean) => void;
}) {
    const { t } = useTranslation();
  const client = useQueryClient();
  const [editOpen, setEditOpen] = useState(false);
  const [confirmDeactivate, setConfirmDeactivate] = useState(false);
  const [confirmReactivate, setConfirmReactivate] = useState(false);
  const [credentialPhone, setCredentialPhone] = useState("");

  const roles = useQuery({
    queryKey: ["roles"],
    queryFn: () => rolesApi.list(),
    enabled: Boolean(teacher && open),
  });

  const teacherRoles = useQuery({
    queryKey: ["user-roles", teacher?.user_id],
    queryFn: () => (teacher?.user_id ? rolesApi.listUserRoles(teacher.user_id) : Promise.resolve([])),
    enabled: Boolean(teacher?.user_id && open),
  });

  if (!teacher) return null;

  const credentialPhoneOptions = phoneOptions(teacher.whatsapp_number, t("Teacher"));

  async function deactivate() {
    await peopleMutations.deactivateTeacher(teacher!.id);
    toast.success("Teacher deactivated");
    void client.invalidateQueries({ queryKey: ["people"] });
    onOpenChange(false);
  }

  async function reactivate() {
    await peopleMutations.reactivateTeacher(teacher!.id);
    toast.success("Teacher reactivated");
    void client.invalidateQueries({ queryKey: ["people"] });
    onOpenChange(false);
  }

  return (
    <ManagedSheet
      open={open}
      onOpenChange={onOpenChange}
      title={teacher.name}
      subtitle={
        <div className="flex flex-wrap items-center gap-2">
          <Pill tone={teacher.status === "active" ? "success" : "muted"}>{teacher.status}</Pill>
          <span className="text-xs text-muted-foreground">{teacher.employee_code}</span>
        </div>
      }
    >
      <div className="mb-4">
          <Row label={t("WhatsApp")} value={teacher.whatsapp_number} />
          <Row label={t("Qualifications")} value={teacher.qualifications} />
          <Row label={t("Join date")} value={teacher.join_date} />
          <Row label={t("CNIC")} value={teacher.cnic} />
          <Row label={t("Address")} value={teacher.address} />
          <Row label={t("Emergency contact")} value={teacher.emergency_contact} />
          <Row label={t("Principal delegate")} value={teacher.is_principal_delegate ? "Yes" : "No"} />
        </div>

        {!teacher.is_principal_delegate ? (
          <>
        <SectionTitle>{t("Roles")}</SectionTitle>
        <div className="mb-3">
          {teacherRoles.data?.map((role: PermissionRole) => (
            <div key={role.id} className="flex items-center justify-between rounded-lg px-2 py-1.5">
              <span className="text-sm">{role.name}</span>
              <button
                onClick={() => {
                  rolesApi.unassign(teacher.user_id!, role.id).then(() => {
                    toast.success("Role removed");
                    void client.invalidateQueries({ queryKey: ["user-roles", teacher.user_id] });
                  });
                }}
                className="text-xs text-muted-foreground hover:text-destructive"
              >
                ×
              </button>
            </div>
          ))}
          {teacherRoles.data?.length === 0 ? (
            <p className="px-2 py-1.5 text-xs text-muted-foreground">{t("No roles assigned")}</p>
          ) : null}
          {teacher.user_id ? (
            <div className="mt-1 px-2">
              <SearchableSelect
                value=""
                onChange={(roleId) => {
                  if (roleId) {
                    rolesApi.assign(teacher.user_id!, roleId).then(() => {
                      toast.success("Role assigned");
                      void client.invalidateQueries({ queryKey: ["user-roles", teacher.user_id] });
                    });
                  }
                }}
                options={(roles.data ?? [])
                  .filter((r) => !teacherRoles.data?.some((tr) => tr.id === r.id))
                  .map((r) => ({ value: r.id, label: r.name }))}
                placeholder={t("Assign role...")}
              />
            </div>
          ) : null}
        </div>
          </>
        ) : null}

        <ActionBar>
          <ActionButton className="flex-1" variant="soft" onClick={() => setEditOpen(true)}>
            {t("Edit")}</ActionButton>
          <ActionButton
            className="flex-1"
            variant="soft"
            onClick={() =>
              copyCredentialsLink(() => peopleMutations.teacherCredentialsLink(teacher.id), t)
            }
          >
            <Copy className="h-4 w-4" /> {t("Credentials link")}</ActionButton>
        </ActionBar>
        <ActionBar className="mt-2">
          <WhatsAppSendAction
            onSend={() =>
              sendCredentialsToWhatsApp({
                subjectType: "teacher",
                subjectId: teacher.id,
                phoneNumber: credentialPhone || credentialPhoneOptions[0]?.value,
                fetcher: () => peopleMutations.teacherCredentialsLink(teacher.id),
                t,
              })
            }
          >
            {t("Send via WhatsApp")}
          </WhatsAppSendAction>
        </ActionBar>
        {teacher.status === "active" ? (
          confirmDeactivate ? (
            <ActionBar className="mt-2">
              <ActionButton variant="danger" className="flex-1" onClick={deactivate}>
                <ShieldOff className="h-4 w-4" /> {t("Confirm deactivate")}</ActionButton>
              <ActionButton className="flex-1" variant="ghost" onClick={() => setConfirmDeactivate(false)}>
                {t("Cancel")}</ActionButton>
            </ActionBar>
          ) : (
            <ActionBar className="mt-2">
              <ActionButton
                variant="danger"
                className="w-full"
                onClick={() => setConfirmDeactivate(true)}
              >
                <ShieldOff className="h-4 w-4" /> {t("Deactivate")}</ActionButton>
            </ActionBar>
          )
        ) : confirmReactivate ? (
          <ActionBar className="mt-2">
            <ActionButton variant="success" className="flex-1" onClick={reactivate}>
              <ShieldCheck className="h-4 w-4" /> {t("Confirm reactivate")}</ActionButton>
            <ActionButton className="flex-1" variant="ghost" onClick={() => setConfirmReactivate(false)}>
              {t("Cancel")}</ActionButton>
          </ActionBar>
        ) : (
          <ActionBar className="mt-2">
            <ActionButton
              variant="success"
              className="w-full"
              onClick={() => setConfirmReactivate(true)}
            >
              <ShieldCheck className="h-4 w-4" /> {t("Reactivate")}</ActionButton>
          </ActionBar>
        )}
        <TeacherForm teacher={teacher} open={editOpen} onOpenChange={setEditOpen} />
    </ManagedSheet>
  );
}

export function GuardianDetailSheet({
  guardian,
  open,
  onOpenChange,
  page = false,
}: {
  guardian: GuardianDetail | null;
  open: boolean;
  onOpenChange: (next: boolean) => void;
  page?: boolean;
}) {
  const { t } = useTranslation();
  const client = useQueryClient();
  const [editOpen, setEditOpen] = useState(false);
  const [confirmDeactivate, setConfirmDeactivate] = useState(false);
  const [confirmReactivate, setConfirmReactivate] = useState(false);
  const [credentialPhone, setCredentialPhone] = useState("");

  const incompleteQuery = useQuery({
    queryKey: ["incomplete-profiles", "guardian"],
    queryFn: () => reportingApi.incompleteProfiles("guardian"),
    enabled: Boolean(guardian && open),
  });
  const missingFields = incompleteQuery.data?.find((p) => p.id === guardian?.id)?.missing_fields;

  const studentsQuery = useQuery({
    queryKey: ["guardian-students", guardian?.id],
    queryFn: () => peopleMutations.guardianStudents(guardian!.id),
    enabled: Boolean(guardian && open),
  });

  if (!guardian) return null;

  const credentialPhoneOptions = phoneOptions(guardian.phone_numbers, t("Guardian"));

  const subtitle = (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <Pill tone="muted">{guardian.relationship}</Pill>
        {guardian.username ? (
          <span className="rounded-full bg-accent-soft px-2 py-0.5 text-xs font-bold text-accent-foreground">
            {guardian.username}
          </span>
        ) : null}
        {guardian.is_donor ? <Pill tone="success">{t("Donor")}</Pill> : null}
        <Pill tone={guardian.status === "active" ? "success" : "muted"}>
          {t(guardian.status)}
        </Pill>
      </div>
      <div className="flex flex-wrap items-center gap-2 empty:hidden">
        {missingFields?.map((field) => (
          <Pill key={field} tone="warning">
            Missing: {field}
          </Pill>
        ))}
      </div>
    </div>
  );

  const containerContent = (
    <>
      <div className="mb-4">
        <Row label={t("Phone(s)")} value={guardian.phone_list?.join(" · ") || guardian.phone_numbers} />
        <Row label={t("CNIC")} value={guardian.cnic} />
        <Row label={t("Address")} value={guardian.address} />
      </div>

      <div className="mb-4">
        <p className="mb-1 text-xs font-semibold text-muted-foreground">{t("Students")}</p>
        <div className="mb-2 flex flex-wrap gap-1.5">
          {(studentsQuery.data ?? []).map((s) => (
            <button key={s.id} type="button" onClick={() => { peopleMutations.unlinkStudentFromGuardian(guardian.id, s.id).then(() => { void client.invalidateQueries({ queryKey: ["guardian-students", guardian.id] }); }); }} className="rounded-full bg-primary-soft px-2.5 py-1 text-xs font-bold text-primary">{s.name} ×</button>
          ))}
        </div>
        <StudentSearchSelect
          excludeIds={(studentsQuery.data ?? []).map((s) => s.id)}
          onSelect={(studentId) => {
            peopleMutations.linkStudentToGuardian(guardian.id, studentId).then(() => {
              void client.invalidateQueries({ queryKey: ["guardian-students", guardian.id] });
            });
          }}
        />
      </div>

      <ActionBar>
        <ActionButton className="flex-1" variant="soft" onClick={() => setEditOpen(true)}>
          {t("Edit")}</ActionButton>
        <ActionButton
          className="flex-1"
          variant="soft"
          onClick={() =>
            copyCredentialsLink(() => peopleMutations.guardianCredentialsLink(guardian.id), t)
          }
        >
          <Copy className="h-4 w-4" /> {t("Credentials link")}</ActionButton>
      </ActionBar>
      {credentialPhoneOptions.length > 1 ? (
        <div className="mt-2">
          <Field label={t("Credential recipient")}>
            <CustomDropdown value={credentialPhone} onChange={(event) => setCredentialPhone(event.target.value)}>
              <option value="">{t("Default recipient")}</option>
              {credentialPhoneOptions.map((option) => (
                <option key={`${option.label}-${option.value}`} value={option.value}>
                  {option.label}
                </option>
              ))}
            </CustomDropdown>
          </Field>
        </div>
      ) : null}
      <ActionBar className="mt-2">
        <WhatsAppSendAction
          onSend={() =>
            sendCredentialsToWhatsApp({
              subjectType: "guardian",
              subjectId: guardian.id,
              phoneNumber: credentialPhone || credentialPhoneOptions[0]?.value,
              fetcher: () => peopleMutations.guardianCredentialsLink(guardian.id),
              t,
            })
          }
        >
          {t("Send via WhatsApp")}
        </WhatsAppSendAction>
      </ActionBar>
      {guardian.status === "active" ? (
        confirmDeactivate ? (
          <ActionBar className="mt-2">
            <ActionButton variant="danger" className="flex-1" onClick={async () => { await peopleMutations.deactivateGuardian(guardian.id); toast.success("Guardian deactivated"); void client.invalidateQueries({ queryKey: ["people"] }); onOpenChange(false); }}>
              <ShieldOff className="h-4 w-4" /> {t("Confirm deactivate")}</ActionButton>
            <ActionButton className="flex-1" variant="ghost" onClick={() => setConfirmDeactivate(false)}>
              {t("Cancel")}</ActionButton>
          </ActionBar>
        ) : (
          <ActionBar className="mt-2">
            <ActionButton
              variant="danger"
              className="w-full"
              onClick={() => setConfirmDeactivate(true)}
            >
              <ShieldOff className="h-4 w-4" /> {t("Deactivate")}</ActionButton>
          </ActionBar>
        )
      ) : confirmReactivate ? (
        <ActionBar className="mt-2">
          <ActionButton variant="success" className="flex-1" onClick={async () => { await peopleMutations.reactivateGuardian(guardian.id); toast.success("Guardian reactivated"); void client.invalidateQueries({ queryKey: ["people"] }); onOpenChange(false); }}>
            <ShieldCheck className="h-4 w-4" /> {t("Confirm reactivate")}</ActionButton>
          <ActionButton className="flex-1" variant="ghost" onClick={() => setConfirmReactivate(false)}>
            {t("Cancel")}</ActionButton>
        </ActionBar>
      ) : (
        <ActionBar className="mt-2">
          <ActionButton
            variant="success"
            className="w-full"
            onClick={() => setConfirmReactivate(true)}
          >
            <ShieldCheck className="h-4 w-4" /> {t("Reactivate")}</ActionButton>
        </ActionBar>
      )}
      <GuardianForm guardian={guardian} open={editOpen} onOpenChange={setEditOpen} />
    </>
  );

  if (page) {
    return (
      <StudentDetailContainer
        page={page}
        open={open}
        onBack={() => onOpenChange(false)}
        title={guardian.name}
        onPhotoClick={() => {}}
        subtitle={subtitle}
      >
        {containerContent}
      </StudentDetailContainer>
    );
  }

  return (
    <ManagedSheet
      open={open}
      onOpenChange={onOpenChange}
      title={guardian.name}
      subtitle={subtitle}
    >
      {containerContent}
    </ManagedSheet>
  );
}

export function DonorDetailSheet({
  donor,
  open,
  onOpenChange,
}: {
  donor: Donor | null;
  open: boolean;
  onOpenChange: (next: boolean) => void;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const client = useQueryClient();
  const [editOpen, setEditOpen] = useState(false);
  const [confirmDeactivate, setConfirmDeactivate] = useState(false);
  const [confirmReactivate, setConfirmReactivate] = useState(false);

  const profile = useQuery({
    queryKey: ["donor-profile", donor?.id],
    queryFn: () => (donor ? financeApi.donorProfile(donor.id) : Promise.reject()),
    enabled: Boolean(donor),
  });
  const donationTotal = (profile.data?.donations ?? []).reduce(
    (sum: number, donation: { amount?: number }) => sum + Number(donation.amount ?? 0),
    0,
  );

  const donorPhone = donor?.default_phone_number || donor?.contact;
  const hasDonorLogin = Boolean(donor?.user_id);

  async function sendDonorCredentials() {
    if (!donor) return;
    try {
      const credentials = await peopleMutations.donorCredentialsLink(donor.id);
      const setupUrl = credentials.set_password_url.startsWith("http")
        ? credentials.set_password_url
        : new URL(credentials.set_password_url, window.location.origin).toString();
      const result = await peopleMutations.sendCredentialsToWhatsApp({
        subject_type: "donor",
        subject_id: donor.id,
        set_password_url: setupUrl,
        phone_number: donorPhone || undefined,
      });
      toast.success(`${t("Credentials sent on WhatsApp")} +${result.normalised_number}`);
    } catch (error) {
      toast.error(apiErrorMessage(error, t("Failed to send credentials on WhatsApp")));
    }
  }

  if (!donor) return null;

  return (
    <ManagedSheet
      open={open}
      onOpenChange={onOpenChange}
      title={donor.name}
      subtitle={
        <div className="flex flex-wrap items-center gap-2">
          <Pill tone={donor.status === "active" ? "success" : "muted"}>{donor.status}</Pill>
          {donor.username ? (
            <span className="rounded-full bg-accent-soft px-2 py-0.5 text-xs font-bold text-accent-foreground">
              {donor.username}
            </span>
          ) : null}
        </div>
      }
    >
      <div className="mb-4">
        <Row label={t("Contact")} value={donor.contact} />
        <Row
          label={t("Donations")}
          value={profile.data ? money(donationTotal) : "—"}
        />
      </div>

      <ActionBar>
        <ActionButton className="flex-1" variant="soft" onClick={() => setEditOpen(true)}>
          {t("Edit")}
        </ActionButton>
        <ActionButton
          className="flex-1"
          variant="soft"
          onClick={() => {
            onOpenChange(false);
            navigate({ to: "/finance", search: { tab: "donations", donor_id: donor.id } });
          }}
        >
          <ArrowRight className="h-4 w-4" /> {t("View donation history")}
        </ActionButton>
      </ActionBar>
      {hasDonorLogin ? (
        <ActionBar className="mt-2">
          <ActionButton
            className="flex-1"
            variant="soft"
            onClick={() => copyCredentialsLink(() => peopleMutations.donorCredentialsLink(donor.id), t)}
          >
            <Copy className="h-4 w-4" /> {t("Credentials link")}
          </ActionButton>
        </ActionBar>
      ) : null}
      {hasDonorLogin && donorPhone ? (
        <ActionBar className="mt-2">
          <WhatsAppSendAction onSend={() => sendDonorCredentials()}>
            {t("Send via WhatsApp")}
          </WhatsAppSendAction>
        </ActionBar>
      ) : null}
      {donor.status === "active" ? (
        confirmDeactivate ? (
          <ActionBar className="mt-2">
            <ActionButton variant="danger" className="flex-1" onClick={async () => { await financeMutations.deactivateDonor(donor.id); toast.success("Donor deactivated"); void client.invalidateQueries({ queryKey: ["people"] }); onOpenChange(false); }}>
              <ShieldOff className="h-4 w-4" /> {t("Confirm deactivate")}</ActionButton>
            <ActionButton className="flex-1" variant="ghost" onClick={() => setConfirmDeactivate(false)}>
              {t("Cancel")}</ActionButton>
          </ActionBar>
        ) : (
          <ActionBar className="mt-2">
            <ActionButton
              variant="danger"
              className="w-full"
              onClick={() => setConfirmDeactivate(true)}
            >
              <ShieldOff className="h-4 w-4" /> {t("Deactivate")}</ActionButton>
          </ActionBar>
        )
      ) : confirmReactivate ? (
        <ActionBar className="mt-2">
          <ActionButton variant="success" className="flex-1" onClick={async () => { await financeMutations.reactivateDonor(donor.id); toast.success("Donor reactivated"); void client.invalidateQueries({ queryKey: ["people"] }); onOpenChange(false); }}>
            <ShieldCheck className="h-4 w-4" /> {t("Confirm reactivate")}</ActionButton>
          <ActionButton className="flex-1" variant="ghost" onClick={() => setConfirmReactivate(false)}>
            {t("Cancel")}</ActionButton>
        </ActionBar>
      ) : (
        <ActionBar className="mt-2">
          <ActionButton
            variant="success"
            className="w-full"
            onClick={() => setConfirmReactivate(true)}
          >
            <ShieldCheck className="h-4 w-4" /> {t("Reactivate")}</ActionButton>
        </ActionBar>
      )}
      <DonorForm donor={donor} open={editOpen} onOpenChange={setEditOpen} />
    </ManagedSheet>
  );
}

function GuardianSearchSelect({ excludeIds, onSelect }: { excludeIds: string[]; onSelect: (id: string) => void }) {
  const { t } = useTranslation();
  const [search, setSearch] = useState("");
  const guardians = useQuery({
    queryKey: ["guardians-search", search],
    queryFn: () => peopleApi.listGuardiansPage({ search, limit: 50, offset: 0 }),
    enabled: true,
  });

  const options = (guardians.data?.items ?? [])
    .filter((g) => !excludeIds.includes(g.id))
    .map((g) => ({ value: g.id, label: g.name }));

  return (
    <SearchableSelect
      value=""
      onChange={(id) => { if (id) { onSelect(id); setSearch(""); } }}
      options={options}
      placeholder={t("Search guardians...")}
      searchValue={search}
      onSearchChange={setSearch}
    />
  );
}

function StudentSearchSelect({ excludeIds, onSelect }: { excludeIds: string[]; onSelect: (id: string) => void }) {
  const { t } = useTranslation();
  const [search, setSearch] = useState("");
  const students = useQuery({
    queryKey: ["students-search", search],
    queryFn: () => peopleApi.listStudentsPage({ search, limit: 50, offset: 0 }),
    enabled: true,
  });

  const options = (students.data?.items ?? [])
    .filter((s) => !excludeIds.includes(s.id))
    .map((s) => ({ value: s.id, label: s.name }));

  return (
    <SearchableSelect
      value=""
      onChange={(id) => { if (id) { onSelect(id); setSearch(""); } }}
      options={options}
      placeholder={t("Search students...")}
      searchValue={search}
      onSearchChange={setSearch}
    />
  );
}
