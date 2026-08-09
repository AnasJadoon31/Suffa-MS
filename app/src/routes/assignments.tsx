import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import {
  CalendarDays,
  CheckCircle2,
  Download,
  Edit2,
  Eye,
  Loader2,
  Save,
  Trash2,
  Upload,
} from "lucide-react";
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
  assessmentsApi,
  assessmentsMutations,
  filesApi,
  type Assignment,
  type Submission,
  uploadFile,
} from "@/lib/mms/more-endpoints";
import { cn } from "@/lib/utils";
import { MarkingView, ResultsView } from "./examination";
import { useTranslation } from "react-i18next";

export const Route = createFileRoute("/assignments")({
  head: () => ({
    meta: [
      { title: "Assessments — Suffa MS" },
      { name: "description", content: "Assessments, due dates, marks and submission status." },
      { property: "og:title", content: "Assessments — Suffa MS" },
      {
        property: "og:description",
        content: "Assessments, due dates, marks and submission status.",
      },
    ],
  }),
  component: AssignmentsPage,
});

const emptyFilters = {
  classId: "",
  sectionId: "",
  courseId: "",
  category: "",
  dateFrom: "",
  dateTo: "",
  mineOnly: false,
};

function AssignmentsPage() {
    const { t } = useTranslation();
  const { user } = useAuth();
  const client = useQueryClient();
  const isStudent = user?.role === "student";
  const canManage =
    user?.role === "principal" || user?.role === "super_admin" || user?.is_principal_delegate || user?.role === "teacher";
  const [tab, setTab] = useState<"assignments" | "marking" | "results">("assignments");

  const [filters, setFilters] = useState(emptyFilters);
  const [selectedAssignment, setSelectedAssignment] = useState<Assignment | null>(null);
  const [editingAssignment, setEditingAssignment] = useState<Assignment | null>(null);
  const [submissionFile, setSubmissionFile] = useState<File | null>(null);

  const classes = useQuery({
    queryKey: ["classes"],
    queryFn: () => academicsApi.listClasses(),
    enabled: canManage,
  });
  const courses = useQuery({
    queryKey: ["courses"],
    queryFn: () => academicsExtraApi.listCourses(),
    enabled: canManage,
  });
  const sections = useQuery({
    queryKey: ["sections", filters.classId],
    queryFn: () => academicsExtraApi.listSections(filters.classId),
    enabled: canManage && !!filters.classId,
  });

  const params = useMemo(
    () => ({
      class_id: filters.classId || undefined,
      section_id: filters.sectionId || undefined,
      course_id: filters.courseId || undefined,
      category: filters.category || undefined,
      date_from: filters.dateFrom || undefined,
      date_to: filters.dateTo || undefined,
      mine_only: filters.mineOnly || undefined,
      sort: "created_at" as const,
    }),
    [filters],
  );

  const query = useQuery({
    queryKey: ["assignments", params],
    queryFn: () => assessmentsApi.listAssignments(params),
  });

  const items = query.data ?? [];

  const activeCount = [
    filters.classId,
    filters.sectionId,
    filters.courseId,
    filters.category,
    filters.dateFrom,
    filters.dateTo,
    filters.mineOnly ? "1" : "",
  ].filter(Boolean).length;

  const [classId, setClassId] = useState("");
  const [courseId, setCourseId] = useState("");
  const [title, setTitle] = useState("");
  const [instructions, setInstructions] = useState("");
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null);
  const [dueDate, setDueDate] = useState(new Date().toISOString().slice(0, 10));
  const [maxMarks, setMaxMarks] = useState("");

  const create = useMutation({
    mutationFn: async () => {
      const attachmentKey = attachmentFile ? await uploadFile(attachmentFile, "assignments") : undefined;
      return assessmentsMutations.createAssignment({
        class_id: classId,
        course_id: courseId,
        title: title.trim(),
        instructions: instructions.trim(),
        ...(attachmentKey ? { attachment_key: attachmentKey } : {}),
        due_date: dueDate,
        ...(maxMarks ? { max_marks: Number(maxMarks) } : {}),
      });
    },
    onSuccess: () => {
      toast.success("Assignment created");
      setTitle("");
      setInstructions("");
      setAttachmentFile(null);
      setMaxMarks("");
      void client.invalidateQueries({ queryKey: ["assignments"] });
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) => assessmentsMutations.deleteAssignment(id),
    onSuccess: () => {
      toast.success("Deleted");
      setSelectedAssignment(null);
      void client.invalidateQueries({ queryKey: ["assignments"] });
    },
  });

  const submit = useMutation({
    mutationFn: async ({ id, file }: { id: string; file: File }) => {
      const fileKey = await uploadFile(file, "submissions");
      return assessmentsMutations.submitAssignment(id, fileKey);
    },
    onSuccess: () => {
      toast.success("Assignment submitted");
      setSubmissionFile(null);
      void client.invalidateQueries({ queryKey: ["assignments"] });
      if (selectedAssignment) {
        void client.invalidateQueries({ queryKey: ["assignment-submissions", selectedAssignment.id] });
      }
    },
  });

  const unsubmit = useMutation({
    mutationFn: (id: string) => assessmentsMutations.removeOwnSubmission(id),
    onSuccess: () => {
      toast.success("Submission withdrawn");
      setSubmissionFile(null);
      void client.invalidateQueries({ queryKey: ["assignments"] });
    },
  });

  async function openAssignmentAttachment(fileKey: string) {
    const url = await filesApi.presignDownload(fileKey);
    window.open(url, "_blank", "noopener,noreferrer");
  }

  return (
    <AppShell
      title={t("Assessments")}
      subtitle={`${items.length} total`}
      right={
        canManage && tab === "assignments" ? (
          <FormSheet
            title={t("New assignment")}
            triggerLabel="New"
            submitLabel="Create"
            onSubmit={() => create.mutateAsync()}
          >
            <Field label={t("Class")}>
              <CustomDropdown required value={classId} onChange={(e) => setClassId(e.target.value)}>
                <option value="">{t("Select class")}</option>
                {(classes.data ?? []).map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </CustomDropdown>
            </Field>
            <Field label={t("Course")}>
              <CustomDropdown required value={courseId} onChange={(e) => setCourseId(e.target.value)}>
                <option value="">{t("Select course")}</option>
                {(courses.data ?? []).map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </CustomDropdown>
            </Field>
            <Field label={t("Title")}>
              <TextInput required value={title} onChange={(e) => setTitle(e.target.value)} />
            </Field>
            <Field label={t("Instructions")}>
              <TextArea
                required
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
              />
            </Field>
            <Field label={t("Attachment")}>
              <input
                type="file"
                accept=".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt,.jpg,.jpeg,.png,.webp"
                onChange={(event) => setAttachmentFile(event.target.files?.[0] ?? null)}
                className="block w-full text-xs text-muted-foreground file:mr-3 file:rounded-xl file:border file:border-border file:bg-card file:px-3 file:py-2 file:text-xs file:font-bold file:text-foreground"
              />
              {attachmentFile ? (
                <p className="mt-1 truncate text-xs font-medium text-muted-foreground">{attachmentFile.name}</p>
              ) : null}
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label={t("Due date")}>
                <TextInput
                  type="date"
                  required
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                />
              </Field>
              <Field label={t("Max marks")}>
                <TextInput
                  type="number"
                  min={0}
                  value={maxMarks}
                  onChange={(e) => setMaxMarks(e.target.value)}
                />
              </Field>
            </div>
          </FormSheet>
        ) : undefined
      }
    >
      <div className="mb-3 grid grid-cols-3 gap-1.5 rounded-2xl bg-muted p-1">
        {(["assignments", "marking", "results"] as const).map((key) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={cn(
              "rounded-xl py-2 text-[0.66rem] font-bold uppercase",
              tab === key ? "bg-card text-primary shadow-sm" : "text-muted-foreground",
            )}
          >
            {key === "assignments" ? t("Assignments") : key === "marking" ? t("Marking") : t("Results")}
          </button>
        ))}
      </div>

      {tab === "marking" ? <MarkingView canManage={canManage} /> : null}
      {tab === "results" ? <ResultsView canManage={canManage} /> : null}
      {tab === "assignments" ? (
        <>
      <FilterBar activeCount={activeCount} onClear={() => setFilters(emptyFilters)}>
        {canManage ? (
          <>
            <div className="grid grid-cols-2 gap-3">
              <Field label={t("Class")}>
                <CustomDropdown
                  value={filters.classId}
                  onChange={(e) =>
                    setFilters((f) => ({ ...f, classId: e.target.value, sectionId: "" }))
                  }
                >
                  <option value="">{t("All classes")}</option>
                  {(classes.data ?? []).map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </CustomDropdown>
              </Field>
              <Field label={t("Section")}>
                <CustomDropdown
                  value={filters.sectionId}
                  disabled={!filters.classId}
                  onChange={(e) => setFilters((f) => ({ ...f, sectionId: e.target.value }))}
                >
                  <option value="">{t("All sections")}</option>
                  {(sections.data ?? []).map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </CustomDropdown>
              </Field>
            </div>
            <Field label={t("Course")}>
              <CustomDropdown
                value={filters.courseId}
                onChange={(e) => setFilters((f) => ({ ...f, courseId: e.target.value }))}
              >
                <option value="">{t("All courses")}</option>
                {(courses.data ?? []).map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </CustomDropdown>
            </Field>
          </>
        ) : null}
        <Field label={t("Category")}>
          <TextInput
            value={filters.category}
            onChange={(e) => setFilters((f) => ({ ...f, category: e.target.value }))}
            placeholder={t("e.g. Homework")}
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t("Due from")}>
            <TextInput
              type="date"
              value={filters.dateFrom}
              onChange={(e) => setFilters((f) => ({ ...f, dateFrom: e.target.value }))}
            />
          </Field>
          <Field label={t("Due to")}>
            <TextInput
              type="date"
              value={filters.dateTo}
              onChange={(e) => setFilters((f) => ({ ...f, dateTo: e.target.value }))}
            />
          </Field>
        </div>
        <label className="flex items-center gap-2 text-sm font-semibold">
          <input
            type="checkbox"
            checked={filters.mineOnly}
            onChange={(e) => setFilters((f) => ({ ...f, mineOnly: e.target.checked }))}
            className="h-4 w-4 rounded border-border"
          />
          {t("Mine only")}</label>
      </FilterBar>

      {query.isLoading ? <SkeletonList rows={5} /> : null}
      {!query.isLoading && items.length === 0 ? (
        <EmptyState title={t("No assignments")} hint="New tasks will show up here." />
      ) : null}

      <div className="space-y-2.5">
        {items.map((item: Assignment) => {
          const overdue = new Date(item.due_date) < new Date() && !item.submitted_at;
          return (
            <Card key={item.id} className="space-y-2 p-3.5">
              <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
                <button
                  type="button"
                  className="min-w-0 text-left"
                  onClick={() => setSelectedAssignment(item)}
                >
                  <p className="truncate font-display text-base font-extrabold">{item.title}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {[item.course_name, item.class_name, item.section_name]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </button>
                {item.submitted_at ? (
                  <Pill tone="success">{t("Submitted")}</Pill>
                ) : (
                  <Pill tone={overdue ? "destructive" : "muted"}>
                    {overdue ? "Overdue" : "Open"}
                  </Pill>
                )}
              </div>

              <p className="line-clamp-3 whitespace-pre-line text-sm text-muted-foreground">
                {item.instructions}
              </p>

              <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1.5">
                  <CalendarDays className="h-3.5 w-3.5" />
                  {new Date(item.due_date).toLocaleDateString()}
                </span>
                {item.max_marks != null ? <span>{t("Max")}{item.max_marks}</span> : null}
                {item.submission_mark != null ? (
                  <span className="inline-flex items-center gap-1.5 font-bold text-success">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    {item.submission_mark}
                  </span>
                ) : null}
              </div>

              {item.submission_feedback ? (
                <p className="rounded-xl bg-muted px-3 py-2 text-xs text-muted-foreground">
                  {item.submission_feedback}
                </p>
              ) : null}

              <div className="flex flex-wrap items-center gap-2">
                <ActionButton variant="soft" onClick={() => setSelectedAssignment(item)}>
                  <Eye className="h-4 w-4" />
                  {t("Open")}</ActionButton>
                {item.attachment_key ? (
                  <ActionButton variant="soft" onClick={() => void openAssignmentAttachment(item.attachment_key!)}>
                    <Download className="h-4 w-4" />
                    {t("Attachment")}</ActionButton>
                ) : null}
                {isStudent ? (
                  item.submitted_at ? (
                    <ActionButton variant="soft" onClick={() => unsubmit.mutate(item.id)}>
                      {t("Withdraw")}</ActionButton>
                  ) : (
                    <label className="inline-flex cursor-pointer items-center gap-2 rounded-2xl bg-muted px-4 py-2.5 font-display text-sm font-extrabold">
                      <Upload className="h-4 w-4" />
                      {submissionFile?.name && selectedAssignment?.id === item.id
                        ? "Replace file"
                        : "Choose file"}
                      <input
                        type="file"
                        className="hidden"
                        onChange={(event) => setSubmissionFile(event.target.files?.[0] ?? null)}
                      />
                    </label>
                  )
                ) : null}
                {isStudent && !item.submitted_at ? (
                  <ActionButton
                    onClick={() => {
                      if (!submissionFile) {
                        toast.error("Choose a file first");
                        return;
                      }
                      submit.mutate({ id: item.id, file: submissionFile });
                    }}
                    disabled={submit.isPending}
                  >
                    {submit.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    {t("Submit")}</ActionButton>
                ) : null}
                {canManage ? (
                  <>
                    <ActionButton variant="soft" onClick={() => setEditingAssignment(item)}>
                      <Edit2 className="h-4 w-4" />
                      {t("Edit")}</ActionButton>
                    <ActionButton variant="danger" onClick={() => remove.mutate(item.id)}>
                      <Trash2 className="h-4 w-4" />
                      {t("Delete")}</ActionButton>
                  </>
                ) : null}
              </div>
            </Card>
          );
        })}
      </div>

      {selectedAssignment ? (
        <AssignmentDetailSheet
          assignment={selectedAssignment}
          open={Boolean(selectedAssignment)}
          onOpenChange={(next) => !next && setSelectedAssignment(null)}
          canManage={canManage}
        />
      ) : null}

      {editingAssignment ? (
        <EditAssignmentSheet
          assignment={editingAssignment}
          open={Boolean(editingAssignment)}
          onOpenChange={(next) => !next && setEditingAssignment(null)}
        />
      ) : null}
        </>
      ) : null}
    </AppShell>
  );
}

function AssignmentDetailSheet({
  assignment,
  open,
  onOpenChange,
  canManage,
}: {
  assignment: Assignment;
  open: boolean;
  onOpenChange: (next: boolean) => void;
  canManage: boolean;
}) {
    const { t } = useTranslation();
  const client = useQueryClient();
  const submissions = useQuery({
    queryKey: ["assignment-submissions", assignment.id],
    queryFn: () => assessmentsMutations.listSubmissions(assignment.id),
    enabled: open && canManage,
  });
  const [marks, setMarks] = useState<Record<string, string>>({});
  const [feedback, setFeedback] = useState<Record<string, string>>({});

  const grade = useMutation({
    mutationFn: ({ submissionId, mark, feedbackText }: { submissionId: string; mark?: number; feedbackText?: string }) =>
      assessmentsMutations.gradeSubmission(submissionId, {
        ...(mark != null ? { mark } : {}),
        ...(feedbackText ? { feedback: feedbackText } : {}),
      }),
    onSuccess: () => {
      toast.success("Submission graded");
      void client.invalidateQueries({ queryKey: ["assignment-submissions", assignment.id] });
      void client.invalidateQueries({ queryKey: ["assignments"] });
    },
  });

  async function openSubmission(fileKey: string) {
    const url = await filesApi.presignDownload(fileKey);
    window.open(url, "_blank", "noopener,noreferrer");
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
      <div className="max-h-[88vh] w-full max-w-2xl overflow-y-auto rounded-3xl bg-card p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate font-display text-lg font-extrabold">{assignment.title}</p>
            <p className="text-sm text-muted-foreground">
              {[assignment.course_name, assignment.class_name, assignment.section_name]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </div>
          <ActionButton variant="ghost" onClick={() => onOpenChange(false)}>
            {t("Close")}</ActionButton>
        </div>

        <p className="mt-4 whitespace-pre-line text-sm text-muted-foreground">{assignment.instructions}</p>
        <div className="mt-3 flex flex-wrap gap-3 text-xs text-muted-foreground">
          <span>{t("Due")}{new Date(assignment.due_date).toLocaleString()}</span>
          {assignment.max_marks != null ? <span>{t("Max")}{assignment.max_marks}</span> : null}
        </div>
        {assignment.attachment_key ? (
          <div className="mt-3">
            <ActionButton variant="soft" onClick={() => void openSubmission(assignment.attachment_key!)}>
              <Download className="h-4 w-4" />
              {t("Download attachment")}
            </ActionButton>
          </div>
        ) : null}

        {canManage ? (
          <>
            <Field label={t("Submissions")}>
              {submissions.isLoading ? <SkeletonList rows={3} /> : null}
              {!submissions.isLoading && (submissions.data ?? []).length === 0 ? (
                <EmptyState title={t("No submissions yet")} />
              ) : null}
              <div className="space-y-3">
                {(submissions.data ?? []).map((submission: Submission) => (
                  <Card key={submission.id} className="space-y-3 p-3.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="font-semibold">{submission.student_name ?? "Student"}</p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(submission.submitted_at).toLocaleString()}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        {submission.is_late ? <Pill tone="warning">{t("Late")}</Pill> : null}
                        {submission.file_key ? (
                          <ActionButton variant="soft" onClick={() => void openSubmission(submission.file_key!)}>
                            <Download className="h-4 w-4" />
                            {t("File")}</ActionButton>
                        ) : null}
                      </div>
                    </div>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-[140px_minmax(0,1fr)_auto]">
                      <TextInput
                        type="number"
                        min={0}
                        max={assignment.max_marks ?? undefined}
                        value={marks[submission.id] ?? String(submission.mark ?? "")}
                        onChange={(event) =>
                          setMarks((current) => ({ ...current, [submission.id]: event.target.value }))
                        }
                      />
                      <TextInput
                        value={feedback[submission.id] ?? submission.feedback ?? ""}
                        onChange={(event) =>
                          setFeedback((current) => ({ ...current, [submission.id]: event.target.value }))
                        }
                        placeholder={t("Feedback")}
                      />
                      <ActionButton
                        onClick={() =>
                          grade.mutate({
                            submissionId: submission.id,
                            mark:
                              (marks[submission.id] ?? "") === ""
                                ? submission.mark ?? undefined
                                : Number(marks[submission.id]),
                            feedbackText: feedback[submission.id] ?? submission.feedback ?? undefined,
                          })
                        }
                        disabled={grade.isPending}
                      >
                        {t("Save")}</ActionButton>
                    </div>
                  </Card>
                ))}
              </div>
            </Field>
          </>
        ) : null}
      </div>
    </div>
  );
}

function EditAssignmentSheet({
  assignment,
  open,
  onOpenChange,
}: {
  assignment: Assignment;
  open: boolean;
  onOpenChange: (next: boolean) => void;
}) {
    const { t } = useTranslation();
  const client = useQueryClient();
  const [title, setTitle] = useState(assignment.title);
  const [instructions, setInstructions] = useState(assignment.instructions);
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null);
  const [removeAttachment, setRemoveAttachment] = useState(false);
  const [dueDate, setDueDate] = useState(assignment.due_date.slice(0, 10));
  const [maxMarks, setMaxMarks] = useState(
    assignment.max_marks == null ? "" : String(assignment.max_marks),
  );

  const update = useMutation({
    mutationFn: async () => {
      const nextAttachmentKey = attachmentFile ? await uploadFile(attachmentFile, "assignments") : undefined;
      return assessmentsMutations.updateAssignment(assignment.id, {
        title: title.trim(),
        instructions: instructions.trim(),
        ...(nextAttachmentKey ? { attachment_key: nextAttachmentKey } : removeAttachment ? { attachment_key: null } : {}),
        due_date: dueDate,
        ...(maxMarks ? { max_marks: Number(maxMarks) } : { max_marks: undefined }),
      });
    },
    onSuccess: () => {
      toast.success("Assignment updated");
      void client.invalidateQueries({ queryKey: ["assignments"] });
      onOpenChange(false);
    },
  });

  return (
    <FormSheet
      title={t("Edit assignment")}
      submitLabel="Save changes"
      open={open}
      onOpenChange={onOpenChange}
      onSubmit={() => update.mutateAsync()}
    >
      <Field label={t("Title")}>
        <TextInput required value={title} onChange={(e) => setTitle(e.target.value)} />
      </Field>
      <Field label={t("Instructions")}>
        <TextArea required value={instructions} onChange={(e) => setInstructions(e.target.value)} />
      </Field>
      <Field label={t("Attachment")}>
        {assignment.attachment_key && !removeAttachment ? (
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <ActionButton variant="soft" onClick={async () => {
              const url = await filesApi.presignDownload(assignment.attachment_key!);
              window.open(url, "_blank", "noopener,noreferrer");
            }}>
              <Download className="h-4 w-4" />
              {t("Current attachment")}
            </ActionButton>
            <button type="button" className="text-xs font-bold text-destructive" onClick={() => setRemoveAttachment(true)}>
              {t("Remove")}
            </button>
          </div>
        ) : null}
        <input
          type="file"
          accept=".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt,.jpg,.jpeg,.png,.webp"
          onChange={(event) => {
            setAttachmentFile(event.target.files?.[0] ?? null);
            setRemoveAttachment(false);
          }}
          className="block w-full text-xs text-muted-foreground file:mr-3 file:rounded-xl file:border file:border-border file:bg-card file:px-3 file:py-2 file:text-xs file:font-bold file:text-foreground"
        />
        {attachmentFile ? (
          <p className="mt-1 truncate text-xs font-medium text-muted-foreground">{attachmentFile.name}</p>
        ) : removeAttachment ? (
          <p className="mt-1 text-xs font-medium text-destructive">{t("Attachment will be removed")}</p>
        ) : null}
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label={t("Due date")}>
          <TextInput type="date" required value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        </Field>
        <Field label={t("Max marks")}>
          <TextInput
            type="number"
            min={0}
            value={maxMarks}
            onChange={(e) => setMaxMarks(e.target.value)}
          />
        </Field>
      </div>
    </FormSheet>
  );
}
