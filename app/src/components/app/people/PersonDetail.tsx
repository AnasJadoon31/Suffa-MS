import { Copy, ShieldOff, ArrowRight } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { useNavigate } from "@tanstack/react-router";

import { ActionButton, Pill, ManagedSheet, ActionBar, CustomDropdown, SearchableSelect, Field, SectionTitle } from "@/components/app/Primitives";
import { MultiPicker } from "./MultiPicker";
import { StudentForm } from "./StudentForm";
import { TeacherForm } from "./TeacherForm";
import { GuardianForm } from "./GuardianForm";
import { academicsApi, peopleApi } from "@/lib/mms/endpoints";
import { academicsExtraApi } from "@/lib/mms/more-endpoints";
import { api } from "@/lib/mms/api";
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

async function copyCredentialsLink(
  fetcher: () => Promise<{ username: string; set_password_url: string }>,
) {
  try {
    const data = await fetcher();
    await navigator.clipboard.writeText(data.set_password_url);
    toast.success(`Link copied for ${data.username}`);
  } catch {
    toast.error("Failed to generate credentials link");
  }
}

export function StudentDetailSheet({
  student,
  open,
  onOpenChange,
}: {
  student: StudentDetail | null;
  open: boolean;
  onOpenChange: (next: boolean) => void;
}) {
    const { t } = useTranslation();
  const client = useQueryClient();
  const [editOpen, setEditOpen] = useState(false);
  const [confirmDeactivate, setConfirmDeactivate] = useState(false);

  const guardiansQuery = useQuery({
    queryKey: ["student-guardians", student?.id],
    queryFn: () => peopleMutations.studentGuardians(student!.id),
    enabled: Boolean(student && open),
  });

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

  async function deactivate() {
    await peopleMutations.deactivateStudent(student!.id);
    toast.success("Student deactivated");
    void client.invalidateQueries({ queryKey: ["people"] });
    onOpenChange(false);
  }

  return (
    <ManagedSheet
      open={open}
      onOpenChange={onOpenChange}
      title={student.name}
      subtitle={
        <div className="flex items-center gap-2">
          <Pill tone={student.status === "active" ? "success" : "muted"}>{student.status}</Pill>
          <span className="text-xs text-muted-foreground">{student.admission_number}</span>
        </div>
      }
    >
      <div className="mb-4">
          <Row label={t("Date of birth")} value={student.date_of_birth} />
          <Row label={t("Phone")} value={student.phone} />
          <Row label={t("B-Form #")} value={student.b_form_number} />
          <Row label={t("Address")} value={student.address} />
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

        <MultiPicker
          label={t("Guardians")}
          selected={(guardiansQuery.data ?? []).map((g) => ({ id: g.id, name: g.name }))}
          onChange={async (next) => {
            const previous = new Set((guardiansQuery.data ?? []).map((g) => g.id));
            const nextIds = new Set(next.map((n) => n.id));
            const added = next.find((n) => !previous.has(n.id));
            const removedId = [...previous].find((id) => !nextIds.has(id));
            if (added) await peopleMutations.linkStudentToGuardian(added.id, student.id);
            if (removedId) await peopleMutations.unlinkStudentFromGuardian(removedId, student.id);
            void client.invalidateQueries({ queryKey: ["student-guardians", student.id] });
          }}
          queryKey="detail-guardians"
          fetchOptions={async (search) => {
            const result = await peopleApi.listGuardiansPage({ search, limit: 20, offset: 0 });
            return result.items.map((g) => ({ id: g.id, name: g.name }));
          }}
        />

        <ActionBar>
          <ActionButton className="flex-1" variant="soft" onClick={() => setEditOpen(true)}>
            {t("Edit")}</ActionButton>
          <ActionButton
            className="flex-1"
            variant="soft"
            onClick={() =>
              copyCredentialsLink(() => peopleMutations.studentCredentialsLink(student.id))
            }
          >
            <Copy className="h-4 w-4" /> {t("Credentials link")}</ActionButton>
        </ActionBar>
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
        ) : null}

        <StudentForm student={student} open={editOpen} onOpenChange={setEditOpen} />
    </ManagedSheet>
  );
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

  async function deactivate() {
    await peopleMutations.deactivateTeacher(teacher!.id);
    toast.success("Teacher deactivated");
    void client.invalidateQueries({ queryKey: ["people"] });
    onOpenChange(false);
  }

  return (
    <ManagedSheet
      open={open}
      onOpenChange={onOpenChange}
      title={teacher.name}
      subtitle={
        <div className="flex items-center gap-2">
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
              copyCredentialsLink(() => peopleMutations.teacherCredentialsLink(teacher.id))
            }
          >
            <Copy className="h-4 w-4" /> {t("Credentials link")}</ActionButton>
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
        ) : null}
        <TeacherForm teacher={teacher} open={editOpen} onOpenChange={setEditOpen} />
    </ManagedSheet>
  );
}

export function GuardianDetailSheet({
  guardian,
  open,
  onOpenChange,
}: {
  guardian: GuardianDetail | null;
  open: boolean;
  onOpenChange: (next: boolean) => void;
}) {
    const { t } = useTranslation();
  const client = useQueryClient();
  const [editOpen, setEditOpen] = useState(false);

  const studentsQuery = useQuery({
    queryKey: ["guardian-students", guardian?.id],
    queryFn: () => peopleMutations.guardianStudents(guardian!.id),
    enabled: Boolean(guardian && open),
  });

  if (!guardian) return null;

  return (
    <ManagedSheet
      open={open}
      onOpenChange={onOpenChange}
      title={guardian.name}
      subtitle={
        <div className="flex items-center gap-2">
          <Pill tone="muted">{guardian.relationship}</Pill>
        </div>
      }
    >
      <div className="mb-4">
          <Row label={t("Phone(s)")} value={guardian.phone_numbers} />
          <Row label={t("CNIC")} value={guardian.cnic} />
          <Row label={t("Address")} value={guardian.address} />
          <Row label={t("Preferred language")} value={guardian.preferred_language} />
        </div>

        <MultiPicker
          label={t("Linked students")}
          selected={(studentsQuery.data ?? []).map((s) => ({ id: s.id, name: s.name }))}
          onChange={async (next) => {
            const previous = new Set((studentsQuery.data ?? []).map((s) => s.id));
            const nextIds = new Set(next.map((n) => n.id));
            const added = next.find((n) => !previous.has(n.id));
            const removedId = [...previous].find((id) => !nextIds.has(id));
            if (added) await peopleMutations.linkStudentToGuardian(guardian.id, added.id);
            if (removedId) await peopleMutations.unlinkStudentFromGuardian(guardian.id, removedId);
            void client.invalidateQueries({ queryKey: ["guardian-students", guardian.id] });
          }}
          queryKey="detail-students"
          fetchOptions={async (search) => {
            const result = await peopleApi.listStudentsPage({ search, limit: 20, offset: 0 });
            return result.items.map((s) => ({ id: s.id, name: s.name }));
          }}
        />

        <ActionBar>
          <ActionButton className="flex-1" variant="soft" onClick={() => setEditOpen(true)}>
            {t("Edit")}</ActionButton>
          <ActionButton
            className="flex-1"
            variant="soft"
            onClick={() =>
              copyCredentialsLink(() => peopleMutations.guardianCredentialsLink(guardian.id))
            }
          >
            <Copy className="h-4 w-4" /> {t("Credentials link")}</ActionButton>
        </ActionBar>
        <GuardianForm guardian={guardian} open={editOpen} onOpenChange={setEditOpen} />
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

  const profile = useQuery({
    queryKey: ["donor-profile", donor?.id],
    queryFn: () => (donor ? financeMutations.donorProfile(donor.id) : Promise.reject()),
    enabled: Boolean(donor),
  });

  if (!donor) return null;

  return (
    <ManagedSheet
      open={open}
      onOpenChange={onOpenChange}
      title={donor.name}
      subtitle={
        <div className="flex items-center gap-2">
          <Pill tone="success">{t("Active")}</Pill>
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
          value={profile.data ? String(profile.data.donations.length) : "…"}
        />
      </div>

      <ActionBar>
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
    </ManagedSheet>
  );
}
