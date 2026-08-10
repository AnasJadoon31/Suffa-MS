import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { CheckCircle2, Download, Image, XCircle } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/app/AppShell";
import { Card, EmptyState, Pill, SkeletonList } from "@/components/app/Primitives";
import { StudentDetailContainer, StudentDetailSheet } from "@/components/app/people/PersonDetail";
import { filesApi, admissionsMutations, opsApi, peopleMutations, type FormFieldDefinition } from "@/lib/mms/more-endpoints";

export const Route = createFileRoute("/admissions/$applicationId")({
  component: AdmissionProfilePage,
});

function AdmissionProfilePage() {
  const { applicationId } = Route.useParams();
  const navigate = useNavigate();
  const client = useQueryClient();
  const [confirmEnroll, setConfirmEnroll] = useState(false);
  const application = useQuery({ queryKey: ["admission", applicationId], queryFn: () => opsApi.getAdmission(applicationId) });
  const student = useQuery({
    queryKey: ["student", application.data?.converted_student_id],
    queryFn: () => peopleMutations.getStudent(application.data!.converted_student_id!),
    enabled: Boolean(application.data?.converted_student_id),
  });
  const photoKey = typeof application.data?.extra_data?.student_profile_picture === "string"
    ? application.data.extra_data.student_profile_picture
    : "";
  const photo = useQuery({
    queryKey: ["admission-photo", photoKey],
    queryFn: () => filesApi.presignDownload(photoKey),
    enabled: Boolean(photoKey),
    retry: false,
  });

  const reject = useMutation({
    mutationFn: () => opsApi.setAdmissionStatus(applicationId, "rejected"),
    onSuccess: () => {
      toast.success("Application rejected");
      void client.invalidateQueries({ queryKey: ["admission", applicationId] });
      void client.invalidateQueries({ queryKey: ["admissions"] });
    },
  });
  const enroll = useMutation({
    mutationFn: () => admissionsMutations.convertAdmission(applicationId, {}),
    onSuccess: (result) => {
      toast.success(result.already_converted ? "Already enrolled" : "Student enrolled");
      void client.invalidateQueries({ queryKey: ["admission", applicationId] });
      void client.invalidateQueries({ queryKey: ["admissions"] });
      void client.invalidateQueries({ queryKey: ["people"] });
    },
  });

  if (application.isLoading) return <AppShell title="Application" subtitle="Admission record"><SkeletonList rows={6} /></AppShell>;
  if (!application.data) return <AppShell title="Application" subtitle="Admission record"><EmptyState title="Application not found" /></AppShell>;
  if (application.data.converted_student_id && student.data) {
    return <AppShell title="Student profile" subtitle="Student record">
      <StudentDetailSheet student={student.data} open page onOpenChange={() => navigate({ to: "/admissions" })} />
    </AppShell>;
  }

  const guardianName = stringAnswer(application.data.extra_data, "guardian_name") || application.data.guardian_contact;
  const fields = application.data.fields_definition_snapshot ?? [];

  return <AppShell title="Application" subtitle="Admission record">
    <StudentDetailContainer
      page
      open
      onBack={() => navigate({ to: "/admissions" })}
      title={application.data.applicant_name}
      photoUrl={photo.data}
      onPhotoClick={() => { if (photo.data) window.open(photo.data, "_blank", "noopener,noreferrer"); }}
      subtitle={<div className="flex items-center gap-2"><Pill tone={application.data.status === "rejected" ? "destructive" : "warning"}>{application.data.status}</Pill><span className="text-xs text-muted-foreground">{application.data.form_title_snapshot ?? "Admission application"}</span></div>}
    >
      <div className="space-y-3">
        <ApplicationAnswers fields={fields} answers={application.data.extra_data ?? {}} />
        {application.data.notes ? <DetailRow label="Notes" value={application.data.notes} /> : null}
        <div className="flex gap-2 pt-2">
          {application.data.status !== "rejected" ? <button type="button" onClick={() => reject.mutate()} disabled={reject.isPending} className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-destructive/10 px-3 py-2 text-sm font-bold text-destructive"><XCircle className="h-4 w-4" />Reject</button> : null}
          <button type="button" onClick={() => setConfirmEnroll(true)} disabled={enroll.isPending} className="gradient-emerald inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm font-bold text-primary-foreground"><CheckCircle2 className="h-4 w-4" />Enroll student</button>
        </div>
      </div>
    </StudentDetailContainer>
    {confirmEnroll ? <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4"><Card className="w-full max-w-sm space-y-4 p-5"><div><p className="font-display text-lg font-extrabold">Enroll student?</p><p className="mt-1 text-sm text-muted-foreground">This will create the student and guardian from this application.</p></div><div className="space-y-2 rounded-xl bg-muted p-3 text-sm"><p><span className="font-semibold">Student:</span> {application.data.applicant_name}</p><p><span className="font-semibold">Guardian:</span> {guardianName}</p></div><div className="flex gap-2"><button type="button" className="min-h-11 flex-1 rounded-xl bg-muted px-3 py-2 text-sm font-bold" onClick={() => setConfirmEnroll(false)}>Cancel</button><button type="button" className="gradient-emerald min-h-11 flex-1 rounded-xl px-3 py-2 text-sm font-bold text-primary-foreground" onClick={() => { setConfirmEnroll(false); enroll.mutate(); }}>Enroll</button></div></Card></div> : null}
  </AppShell>;
}

function ApplicationAnswers({ fields, answers }: { fields: FormFieldDefinition[]; answers: Record<string, unknown> }) {
  return <>{fields.filter((field) => field.enabled !== false && field.type !== "label" && field.key !== "student_profile_picture").map((field) => <DetailRow key={field.key} label={field.label} value={answerValue(field, answers[field.key])} />)}</>;
}

function answerValue(field: FormFieldDefinition, value: unknown) {
  if (value === undefined || value === "" || (Array.isArray(value) && value.length === 0)) return "—";
  if ((field.type === "file" || field.type === "image") && typeof value === "string") return <a className="inline-flex items-center gap-1 font-semibold text-primary" href="#" onClick={(event) => { event.preventDefault(); void filesApi.presignDownload(value).then((url) => window.open(url, "_blank", "noopener,noreferrer")); }}><>{field.type === "image" ? <Image className="h-4 w-4" /> : <Download className="h-4 w-4" />}</>Open</a>;
  return Array.isArray(value) ? value.join(", ") : String(value);
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-3 border-b border-border py-2 text-sm last:border-0"><span className="font-semibold text-muted-foreground">{label}</span><span className="text-right">{value}</span></div>;
}

function stringAnswer(answers: Record<string, unknown> | null | undefined, key: string) {
  const value = answers?.[key];
  return typeof value === "string" ? value : "";
}
