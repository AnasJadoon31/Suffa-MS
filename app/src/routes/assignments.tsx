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

export const Route = createFileRoute("/assignments")({
  head: () => ({
    meta: [
      { title: "Assignments — Suffa MS" },
      { name: "description", content: "Assignments, due dates, marks and submission status." },
      { property: "og:title", content: "Assignments — Suffa MS" },
      {
        property: "og:description",
        content: "Assignments, due dates, marks and submission status.",
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
  const { user } = useAuth();
  const client = useQueryClient();
  const isStudent = user?.role === "student";
  const canManage =
    user?.role === "principal" || user?.role === "super_admin" || user?.role === "teacher";

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
    }),
    [filters],
  );

  const query = useQuery({
    queryKey: ["assignments", params],
    queryFn: () => assessmentsApi.listAssignments(params),
  });

  const items = (query.data ?? []).slice().sort((a, b) => a.due_date.localeCompare(b.due_date));

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
  const [dueDate, setDueDate] = useState(new Date().toISOString().slice(0, 10));
  const [maxMarks, setMaxMarks] = useState("");

  const create = useMutation({
    mutationFn: () =>
      assessmentsMutations.createAssignment({
        class_id: classId,
        course_id: courseId,
        title: title.trim(),
        instructions: instructions.trim(),
        due_date: dueDate,
        ...(maxMarks ? { max_marks: Number(maxMarks) } : {}),
      }),
    onSuccess: () => {
      toast.success("Assignment created");
      setTitle("");
      setInstructions("");
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

  return (
    <AppShell
      title="Assignments"
      subtitle={`${items.length} total`}
      right={
        canManage ? (
          <FormSheet
            title="New assignment"
            triggerLabel="New"
            submitLabel="Create"
            onSubmit={() => create.mutateAsync()}
          >
            <Field label="Class">
              <CustomDropdown required value={classId} onChange={(e) => setClassId(e.target.value)}>
                <option value="">Select class</option>
                {(classes.data ?? []).map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </CustomDropdown>
            </Field>
            <Field label="Course">
              <CustomDropdown required value={courseId} onChange={(e) => setCourseId(e.target.value)}>
                <option value="">Select course</option>
                {(courses.data ?? []).map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </CustomDropdown>
            </Field>
            <Field label="Title">
              <TextInput required value={title} onChange={(e) => setTitle(e.target.value)} />
            </Field>
            <Field label="Instructions">
              <TextArea
                required
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Due date">
                <TextInput
                  type="date"
                  required
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                />
              </Field>
              <Field label="Max marks">
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
      <FilterBar activeCount={activeCount} onClear={() => setFilters(emptyFilters)}>
        {canManage ? (
          <>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Class">
                <CustomDropdown
                  value={filters.classId}
                  onChange={(e) =>
                    setFilters((f) => ({ ...f, classId: e.target.value, sectionId: "" }))
                  }
                >
                  <option value="">All classes</option>
                  {(classes.data ?? []).map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </CustomDropdown>
              </Field>
              <Field label="Section">
                <CustomDropdown
                  value={filters.sectionId}
                  disabled={!filters.classId}
                  onChange={(e) => setFilters((f) => ({ ...f, sectionId: e.target.value }))}
                >
                  <option value="">All sections</option>
                  {(sections.data ?? []).map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </CustomDropdown>
              </Field>
            </div>
            <Field label="Course">
              <CustomDropdown
                value={filters.courseId}
                onChange={(e) => setFilters((f) => ({ ...f, courseId: e.target.value }))}
              >
                <option value="">All courses</option>
                {(courses.data ?? []).map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </CustomDropdown>
            </Field>
          </>
        ) : null}
        <Field label="Category">
          <TextInput
            value={filters.category}
            onChange={(e) => setFilters((f) => ({ ...f, category: e.target.value }))}
            placeholder="e.g. Homework"
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Due from">
            <TextInput
              type="date"
              value={filters.dateFrom}
              onChange={(e) => setFilters((f) => ({ ...f, dateFrom: e.target.value }))}
            />
          </Field>
          <Field label="Due to">
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
          Mine only
        </label>
      </FilterBar>

      {query.isLoading ? <SkeletonList rows={5} /> : null}
      {!query.isLoading && items.length === 0 ? (
        <EmptyState title="No assignments" hint="New tasks will show up here." />
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
                  <Pill tone="success">Submitted</Pill>
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
                {item.max_marks != null ? <span>Max {item.max_marks}</span> : null}
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
                  Open
                </ActionButton>
                {isStudent ? (
                  item.submitted_at ? (
                    <ActionButton variant="soft" onClick={() => unsubmit.mutate(item.id)}>
                      Withdraw
                    </ActionButton>
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
                    Submit
                  </ActionButton>
                ) : null}
                {canManage ? (
                  <>
                    <ActionButton variant="soft" onClick={() => setEditingAssignment(item)}>
                      <Edit2 className="h-4 w-4" />
                      Edit
                    </ActionButton>
                    <ActionButton variant="danger" onClick={() => remove.mutate(item.id)}>
                      <Trash2 className="h-4 w-4" />
                      Delete
                    </ActionButton>
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
            Close
          </ActionButton>
        </div>

        <p className="mt-4 whitespace-pre-line text-sm text-muted-foreground">{assignment.instructions}</p>
        <div className="mt-3 flex flex-wrap gap-3 text-xs text-muted-foreground">
          <span>Due {new Date(assignment.due_date).toLocaleString()}</span>
          {assignment.max_marks != null ? <span>Max {assignment.max_marks}</span> : null}
        </div>

        {canManage ? (
          <>
            <Field label="Submissions">
              {submissions.isLoading ? <SkeletonList rows={3} /> : null}
              {!submissions.isLoading && (submissions.data ?? []).length === 0 ? (
                <EmptyState title="No submissions yet" />
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
                        {submission.is_late ? <Pill tone="warning">Late</Pill> : null}
                        <ActionButton variant="soft" onClick={() => void openSubmission(submission.file_key)}>
                          <Download className="h-4 w-4" />
                          File
                        </ActionButton>
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
                        placeholder="Feedback"
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
                        Save
                      </ActionButton>
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
  const client = useQueryClient();
  const [title, setTitle] = useState(assignment.title);
  const [instructions, setInstructions] = useState(assignment.instructions);
  const [dueDate, setDueDate] = useState(assignment.due_date.slice(0, 10));
  const [maxMarks, setMaxMarks] = useState(
    assignment.max_marks == null ? "" : String(assignment.max_marks),
  );

  const update = useMutation({
    mutationFn: () =>
      assessmentsMutations.updateAssignment(assignment.id, {
        title: title.trim(),
        instructions: instructions.trim(),
        due_date: dueDate,
        ...(maxMarks ? { max_marks: Number(maxMarks) } : { max_marks: undefined }),
      }),
    onSuccess: () => {
      toast.success("Assignment updated");
      void client.invalidateQueries({ queryKey: ["assignments"] });
      onOpenChange(false);
    },
  });

  return (
    <FormSheet
      title="Edit assignment"
      submitLabel="Save changes"
      open={open}
      onOpenChange={onOpenChange}
      onSubmit={() => update.mutateAsync()}
    >
      <Field label="Title">
        <TextInput required value={title} onChange={(e) => setTitle(e.target.value)} />
      </Field>
      <Field label="Instructions">
        <TextArea required value={instructions} onChange={(e) => setInstructions(e.target.value)} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Due date">
          <TextInput type="date" required value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        </Field>
        <Field label="Max marks">
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
