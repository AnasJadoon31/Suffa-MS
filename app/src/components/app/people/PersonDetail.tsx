import { Copy, ShieldOff } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { ActionButton, Pill } from "@/components/app/Primitives";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { MultiPicker } from "./MultiPicker";
import { StudentForm } from "./StudentForm";
import { TeacherForm } from "./TeacherForm";
import { GuardianForm } from "./GuardianForm";
import { peopleApi } from "@/lib/mms/endpoints";
import {
  peopleMutations,
  type GuardianDetail,
  type StudentDetail,
  type TeacherDetail,
} from "@/lib/mms/more-endpoints";

function Row({ label, value }: { label: string; value: React.ReactNode }) {
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
  const client = useQueryClient();
  const [editOpen, setEditOpen] = useState(false);
  const [confirmDeactivate, setConfirmDeactivate] = useState(false);

  const guardiansQuery = useQuery({
    queryKey: ["student-guardians", student?.id],
    queryFn: () => peopleMutations.studentGuardians(student!.id),
    enabled: Boolean(student && open),
  });

  if (!student) return null;

  async function deactivate() {
    await peopleMutations.deactivateStudent(student!.id);
    toast.success("Student deactivated");
    void client.invalidateQueries({ queryKey: ["people", "students"] });
    onOpenChange(false);
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="max-h-[88vh] overflow-y-auto rounded-t-3xl border-border bg-card px-4 pb-8 pt-5"
      >
        <SheetTitle className="mb-1 font-display text-lg font-extrabold">{student.name}</SheetTitle>
        <div className="mb-3 flex items-center gap-2">
          <Pill tone={student.status === "active" ? "success" : "muted"}>{student.status}</Pill>
          <span className="text-xs text-muted-foreground">{student.admission_number}</span>
        </div>

        <div className="mb-4">
          <Row label="Date of birth" value={student.date_of_birth} />
          <Row label="Phone" value={student.phone} />
          <Row label="B-Form #" value={student.b_form_number} />
          <Row label="Address" value={student.address} />
          <Row label="Independent" value={student.is_independent ? "Yes" : "No"} />
          <Row label="Portal access" value={student.portal_enabled ? "Enabled" : "Disabled"} />
          {student.active_enrollment ? (
            <>
              <Row label="Session" value={student.active_enrollment.session_name} />
              <Row
                label="Class"
                value={`${student.active_enrollment.class_name} · ${student.active_enrollment.section_name}`}
              />
              <Row label="Program" value={student.active_enrollment.program_name} />
            </>
          ) : (
            <Row label="Enrollment" value="No active enrollment" />
          )}
        </div>

        <MultiPicker
          label="Guardians"
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

        <div className="mt-5 grid grid-cols-2 gap-2">
          <ActionButton variant="soft" onClick={() => setEditOpen(true)}>
            Edit
          </ActionButton>
          <ActionButton
            variant="soft"
            onClick={() =>
              copyCredentialsLink(() => peopleMutations.studentCredentialsLink(student.id))
            }
          >
            <Copy className="h-4 w-4" /> Credentials link
          </ActionButton>
        </div>
        {student.status === "active" ? (
          confirmDeactivate ? (
            <div className="mt-2 flex gap-2">
              <ActionButton variant="danger" className="flex-1" onClick={deactivate}>
                <ShieldOff className="h-4 w-4" /> Confirm deactivate
              </ActionButton>
              <ActionButton variant="ghost" onClick={() => setConfirmDeactivate(false)}>
                Cancel
              </ActionButton>
            </div>
          ) : (
            <ActionButton
              variant="danger"
              className="mt-2 w-full"
              onClick={() => setConfirmDeactivate(true)}
            >
              <ShieldOff className="h-4 w-4" /> Deactivate
            </ActionButton>
          )
        ) : null}

        <StudentForm student={student} open={editOpen} onOpenChange={setEditOpen} />
      </SheetContent>
    </Sheet>
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
  const client = useQueryClient();
  const [editOpen, setEditOpen] = useState(false);
  const [confirmDeactivate, setConfirmDeactivate] = useState(false);
  if (!teacher) return null;

  async function deactivate() {
    await peopleMutations.deactivateTeacher(teacher!.id);
    toast.success("Teacher deactivated");
    void client.invalidateQueries({ queryKey: ["people", "teachers"] });
    onOpenChange(false);
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="max-h-[88vh] overflow-y-auto rounded-t-3xl border-border bg-card px-4 pb-8 pt-5"
      >
        <SheetTitle className="mb-1 font-display text-lg font-extrabold">{teacher.name}</SheetTitle>
        <div className="mb-3 flex items-center gap-2">
          <Pill tone={teacher.status === "active" ? "success" : "muted"}>{teacher.status}</Pill>
          <span className="text-xs text-muted-foreground">{teacher.employee_code}</span>
        </div>
        <div className="mb-4">
          <Row label="WhatsApp" value={teacher.whatsapp_number} />
          <Row label="Qualifications" value={teacher.qualifications} />
          <Row label="Join date" value={teacher.join_date} />
          <Row label="CNIC" value={teacher.cnic} />
          <Row label="Address" value={teacher.address} />
          <Row label="Emergency contact" value={teacher.emergency_contact} />
          <Row label="Principal delegate" value={teacher.is_principal_delegate ? "Yes" : "No"} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <ActionButton variant="soft" onClick={() => setEditOpen(true)}>
            Edit
          </ActionButton>
          <ActionButton
            variant="soft"
            onClick={() =>
              copyCredentialsLink(() => peopleMutations.teacherCredentialsLink(teacher.id))
            }
          >
            <Copy className="h-4 w-4" /> Credentials link
          </ActionButton>
        </div>
        {teacher.status === "active" ? (
          confirmDeactivate ? (
            <div className="mt-2 flex gap-2">
              <ActionButton variant="danger" className="flex-1" onClick={deactivate}>
                <ShieldOff className="h-4 w-4" /> Confirm deactivate
              </ActionButton>
              <ActionButton variant="ghost" onClick={() => setConfirmDeactivate(false)}>
                Cancel
              </ActionButton>
            </div>
          ) : (
            <ActionButton
              variant="danger"
              className="mt-2 w-full"
              onClick={() => setConfirmDeactivate(true)}
            >
              <ShieldOff className="h-4 w-4" /> Deactivate
            </ActionButton>
          )
        ) : null}
        <TeacherForm teacher={teacher} open={editOpen} onOpenChange={setEditOpen} />
      </SheetContent>
    </Sheet>
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
  const client = useQueryClient();
  const [editOpen, setEditOpen] = useState(false);

  const studentsQuery = useQuery({
    queryKey: ["guardian-students", guardian?.id],
    queryFn: () => peopleMutations.guardianStudents(guardian!.id),
    enabled: Boolean(guardian && open),
  });

  if (!guardian) return null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="max-h-[88vh] overflow-y-auto rounded-t-3xl border-border bg-card px-4 pb-8 pt-5"
      >
        <SheetTitle className="mb-1 font-display text-lg font-extrabold">
          {guardian.name}
        </SheetTitle>
        <div className="mb-3">
          <Pill tone="muted">{guardian.relationship}</Pill>
        </div>
        <div className="mb-4">
          <Row label="Phone(s)" value={guardian.phone_numbers} />
          <Row label="CNIC" value={guardian.cnic} />
          <Row label="Address" value={guardian.address} />
          <Row label="Preferred language" value={guardian.preferred_language} />
        </div>

        <MultiPicker
          label="Linked students"
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

        <div className="mt-5 grid grid-cols-2 gap-2">
          <ActionButton variant="soft" onClick={() => setEditOpen(true)}>
            Edit
          </ActionButton>
          <ActionButton
            variant="soft"
            onClick={() =>
              copyCredentialsLink(() => peopleMutations.guardianCredentialsLink(guardian.id))
            }
          >
            <Copy className="h-4 w-4" /> Credentials link
          </ActionButton>
        </div>
        <GuardianForm guardian={guardian} open={editOpen} onOpenChange={setEditOpen} />
      </SheetContent>
    </Sheet>
  );
}
