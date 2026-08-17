import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, CheckCircle2, Download, Edit2, Eye, GraduationCap, Trash2, Upload } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { AppShell } from "@/components/app/AppShell";
import { FilterBar } from "@/components/app/FilterBar";
import { FormSheet } from "@/components/app/FormSheet";
import { ActionButton, Card, CustomDropdown, EmptyState, Field, Pill, SectionTitle, SkeletonList, TextArea, TextInput } from "@/components/app/Primitives";
import { useAuth } from "@/lib/mms/auth";
import { operationsApi } from "@/lib/mms/endpoints";
import { assessmentsApi, assessmentsMutations, filesApi, type Assignment, uploadFile } from "@/lib/mms/more-endpoints";
import { apiErrorMessage } from "@/lib/mms/api";
import { cn } from "@/lib/utils";
import { AssignmentDetailSheet, EditAssignmentSheet } from "./assignments";
import { MarkingView, ResultsView } from "./examination";

export const Route = createFileRoute("/my-assessments")({
  head: () => ({
    meta: [
      { title: "My Assignments — Suffa MS" },
      { name: "description", content: "My assignments and submission status" },
    ],
  }),
  component: MyAssessmentsPage,
});

function MyAssessmentsPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  if (user?.role === "student") return <StudentAssessments />;
  return <TeacherAssessments />;
}

function StudentAssessments() {
  const { t } = useTranslation();
  const client = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "pending" | "submitted" | "graded" | "overdue">("all");
  const [courseFilter, setCourseFilter] = useState("");
  const [submissionFile, setSubmissionFile] = useState<File | null>(null);
  const [submittingId, setSubmittingId] = useState<string | null>(null);

  const assignments = useQuery({
    queryKey: ["my-assignments", "student"],
    queryFn: () => assessmentsApi.listAssignments({ mine_only: true, sort: "created_at" }),
  });

  const courseOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const a of assignments.data ?? []) {
      if (a.course_id && a.course_name) map.set(a.course_id, a.course_name);
    }
    return Array.from(map, ([id, name]) => ({ id, name }));
  }, [assignments.data]);

  const filtered = useMemo(() => {
    let list = assignments.data ?? [];
    const term = search.trim().toLowerCase();
    if (term) {
      list = list.filter((a) =>
        `${a.title} ${a.description ?? ""} ${a.course_name ?? ""} ${a.class_name ?? ""}`.toLowerCase().includes(term),
      );
    }
    if (courseFilter) {
      list = list.filter((a) => a.course_id === courseFilter);
    }
    if (statusFilter === "pending") list = list.filter((a) => !a.submitted_at && new Date(a.due_date) >= new Date());
    else if (statusFilter === "overdue") list = list.filter((a) => !a.submitted_at && new Date(a.due_date) < new Date());
    else if (statusFilter === "submitted") list = list.filter((a) => a.submitted_at && a.submission_mark == null);
    else if (statusFilter === "graded") list = list.filter((a) => a.submission_mark != null);
    return list;
  }, [assignments.data, search, statusFilter, courseFilter]);

  const pending = filtered.filter((a) => !a.submitted_at);
  const submitted = filtered.filter((a) => a.submitted_at);

  const openAttachment = async (fileKey: string) => {
    const url = await filesApi.presignDownload(fileKey);
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const handleSubmit = async (assignmentId: string) => {
    if (!submissionFile) {
      toast.error(t("Choose a file first"));
      return;
    }
    setSubmittingId(assignmentId);
    try {
      const fileKey = await uploadFile(submissionFile, "submissions");
      await assessmentsMutations.submitAssignment(assignmentId, fileKey);
      toast.success(t("Assignment submitted"));
      setSubmissionFile(null);
      await client.invalidateQueries({ queryKey: ["my-assignments"] });
    } catch (err) {
      toast.error(apiErrorMessage(err, t("Could not submit")));
    } finally {
      setSubmittingId(null);
    }
  };

  const handleWithdraw = async (assignmentId: string) => {
    try {
      await assessmentsMutations.removeOwnSubmission(assignmentId);
      toast.success(t("Submission withdrawn"));
      await client.invalidateQueries({ queryKey: ["my-assignments"] });
    } catch (err) {
      toast.error(apiErrorMessage(err, t("Could not withdraw")));
    }
  };

  const renderAssignmentCard = (assignment: Assignment) => {
    const overdue = new Date(assignment.due_date) < new Date() && !assignment.submitted_at;
    return (
      <Card key={assignment.id} className="space-y-2.5 p-3.5">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
          <div className="min-w-0">
            <p className="truncate font-display text-base font-extrabold">{assignment.title}</p>
            <p className="truncate text-xs text-muted-foreground">
              {[assignment.course_name, assignment.class_name, assignment.section_name].filter(Boolean).join(" · ")}
            </p>
          </div>
          {assignment.submitted_at ? (
            assignment.submission_mark != null ? (
              <Pill tone="success">{t("Graded")}</Pill>
            ) : (
              <Pill tone="muted">{t("Submitted")}</Pill>
            )
          ) : (
            <Pill tone={overdue ? "destructive" : "warning"}>
              {overdue ? t("Overdue") : t("Open")}
            </Pill>
          )}
        </div>

        {assignment.description ? (
          <p className="line-clamp-2 whitespace-pre-line text-sm text-muted-foreground">{assignment.description}</p>
        ) : null}

        <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          <span>{t("Due")}: {new Date(assignment.due_date).toLocaleDateString()}</span>
          {assignment.max_marks != null ? <span>{t("Max")}: {assignment.max_marks}</span> : null}
        </div>

        {assignment.attachment_key ? (
          <button onClick={() => void openAttachment(assignment.attachment_key!)} className="flex items-center gap-1 text-xs font-bold text-primary">
            <Download className="h-3.5 w-3.5" />
            {t("Attachment")}
          </button>
        ) : null}

        {assignment.submission_mark != null ? (
          <div className="rounded-xl bg-success/10 px-3 py-2 text-xs font-semibold text-success">
            {t("Mark")}: {assignment.submission_mark}
            {assignment.submission_feedback ? ` — ${assignment.submission_feedback}` : ""}
          </div>
        ) : null}

        {!assignment.submitted_at ? (
          <div className="flex flex-wrap items-center gap-2 border-t border-border pt-2.5">
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-muted px-3 py-2 text-xs font-bold">
              <Upload className="h-3.5 w-3.5" />
              {submissionFile?.name && submittingId === assignment.id ? submissionFile.name : t("Choose file")}
              <input
                type="file"
                className="hidden"
                onChange={(e) => {
                  setSubmissionFile(e.target.files?.[0] ?? null);
                  setSubmittingId(assignment.id);
                }}
              />
            </label>
            <button
              onClick={() => void handleSubmit(assignment.id)}
              disabled={!submissionFile || submittingId !== assignment.id}
              className="gradient-emerald flex items-center gap-1 rounded-xl px-3 py-2 text-xs font-bold text-primary-foreground disabled:opacity-50"
            >
              {submittingId === assignment.id && submissionFile ? <GraduationCap className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
              {t("Submit")}
            </button>
          </div>
        ) : (
          <button
            onClick={() => void handleWithdraw(assignment.id)}
            className="text-xs font-bold text-destructive"
          >
            {t("Withdraw submission")}
          </button>
        )}
      </Card>
    );
  };

  return (
    <AppShell title={t("My assignments")} subtitle={t("Your assignments and submission status")}>
      {assignments.isLoading ? <SkeletonList rows={4} /> : null}
      {assignments.isError ? (
        <EmptyState title={apiErrorMessage(assignments.error, t("Could not load assignments"))} />
      ) : null}

      {assignments.data ? (
        <>
          <div className="mb-3 space-y-2">
            <Field label={t("Search assignments")}>
              <TextInput value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t("Type a title, course or class...")} />
            </Field>
            <div className="flex flex-wrap gap-2">
              <div className="min-w-[7rem] flex-1">
                <CustomDropdown value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}>
                  <option value="all">{t("All status")}</option>
                  <option value="pending">{t("Pending")}</option>
                  <option value="overdue">{t("Overdue")}</option>
                  <option value="submitted">{t("Submitted")}</option>
                  <option value="graded">{t("Graded")}</option>
                </CustomDropdown>
              </div>
              {courseOptions.length > 1 ? (
                <div className="min-w-[7rem] flex-1">
                  <CustomDropdown value={courseFilter} onChange={(e) => setCourseFilter(e.target.value)}>
                    <option value="">{t("All courses")}</option>
                    {courseOptions.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </CustomDropdown>
                </div>
              ) : null}
            </div>
          </div>

          {pending.length > 0 ? (
            <>
              <SectionTitle>{t("Pending")}</SectionTitle>
              <div className="space-y-2.5">{pending.map(renderAssignmentCard)}</div>
            </>
          ) : null}

          {submitted.length > 0 ? (
            <>
              <SectionTitle>{t("Submitted")}</SectionTitle>
              <div className="space-y-2.5">{submitted.map(renderAssignmentCard)}</div>
            </>
          ) : null}

          {pending.length === 0 && submitted.length === 0 ? (
            <EmptyState title={t("No assignments yet")} hint={t("New tasks will show up here.")} />
          ) : null}
        </>
      ) : null}
    </AppShell>
  );
}

function TeacherAssessments() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const client = useQueryClient();
  const canManage =
    user?.role === "principal" || user?.role === "super_admin" || user?.is_principal_delegate || user?.role === "teacher";
  const [tab, setTab] = useState<"assignments" | "marking" | "results">("assignments");

  const [selectedAssignment, setSelectedAssignment] = useState<Assignment | null>(null);
  const [editingAssignment, setEditingAssignment] = useState<Assignment | null>(null);
  const [filters, setFilters] = useState({ classId: "", sectionId: "", courseId: "", mineOnly: false });
  const [search, setSearch] = useState("");
  const [newClassId, setNewClassId] = useState("");
  const [newSectionId, setNewSectionId] = useState("");
  const [newCourseId, setNewCourseId] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [newInstructions, setNewInstructions] = useState("");
  const [newAttachmentFile, setNewAttachmentFile] = useState<File | null>(null);
  const [newDueDate, setNewDueDate] = useState(new Date().toISOString().slice(0, 10));
  const [newMaxMarks, setNewMaxMarks] = useState("");

  const myTimetable = useQuery({
    queryKey: ["my-timetable"],
    queryFn: () => operationsApi.listMyTimetable(),
    enabled: Boolean(user),
  });

  const classOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const slot of myTimetable.data ?? []) {
      if (slot.class_id) map.set(slot.class_id, slot.class_name ?? "—");
    }
    return Array.from(map, ([id, name]) => ({ id, name }));
  }, [myTimetable.data]);
  const sectionOptions = useMemo(() => {
    if (!filters.classId) return [];
    const map = new Map<string, string>();
    for (const slot of myTimetable.data ?? []) {
      if (slot.class_id === filters.classId && slot.section_id) {
        map.set(slot.section_id, slot.section_name ?? "—");
      }
    }
    return Array.from(map, ([id, name]) => ({ id, name }));
  }, [filters.classId, myTimetable.data]);
  const courseOptions = useMemo(() => {
    if (!filters.classId) return [];
    const map = new Map<string, string>();
    for (const slot of myTimetable.data ?? []) {
      if (
        slot.class_id === filters.classId &&
        (!filters.sectionId || slot.section_id === filters.sectionId) &&
        slot.course_id
      ) {
        map.set(slot.course_id, slot.course_name ?? "—");
      }
    }
    return Array.from(map, ([id, name]) => ({ id, name }));
  }, [filters.classId, filters.sectionId, myTimetable.data]);
  const newSectionOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const slot of myTimetable.data ?? []) {
      if (slot.class_id === newClassId && slot.section_id) map.set(slot.section_id, slot.section_name ?? "—");
    }
    return Array.from(map, ([id, name]) => ({ id, name }));
  }, [myTimetable.data, newClassId]);
  const newCourseOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const slot of myTimetable.data ?? []) {
      if (
        slot.class_id === newClassId &&
        (!newSectionId || slot.section_id === newSectionId) &&
        slot.course_id
      ) {
        map.set(slot.course_id, slot.course_name ?? "—");
      }
    }
    return Array.from(map, ([id, name]) => ({ id, name }));
  }, [myTimetable.data, newClassId, newSectionId]);

  const assignments = useQuery({
    queryKey: ["my-assignments", "teacher", filters],
    queryFn: () => assessmentsApi.listAssignments({
      class_id: filters.classId || undefined,
      section_id: filters.sectionId || undefined,
      course_id: filters.courseId || undefined,
      mine_only: filters.mineOnly || undefined,
      scope_to_timetable: true,
      sort: "created_at",
    }),
    enabled: Boolean(user),
  });

  const filteredAssignments = useMemo(() => {
    const list = assignments.data ?? [];
    const term = search.trim().toLowerCase();
    if (!term) return list;
    return list.filter((a) =>
      `${a.title} ${a.description ?? ""} ${a.teacher_name ?? ""} ${a.course_name ?? ""} ${a.class_name ?? ""}`.toLowerCase().includes(term),
    );
  }, [assignments.data, search]);

  const activeCount = [filters.classId, filters.sectionId, filters.courseId, filters.mineOnly].filter(Boolean).length;

  const handleCreateAssignment = async () => {
    const attachmentKey = newAttachmentFile ? await uploadFile(newAttachmentFile, "assignments") : undefined;
    await assessmentsMutations.createAssignment({
      mine_only: true,
      class_id: newClassId,
      section_ids: newSectionId ? [newSectionId] : [],
      course_id: newCourseId,
      title: newTitle.trim(),
      instructions: newInstructions.trim(),
      ...(attachmentKey ? { attachment_key: attachmentKey } : {}),
      due_date: newDueDate,
      ...(newMaxMarks ? { max_marks: Number(newMaxMarks) } : {}),
    });
    setNewTitle("");
    setNewInstructions("");
    setNewAttachmentFile(null);
    setNewMaxMarks("");
    await client.invalidateQueries({ queryKey: ["my-assignments"] });
    await client.invalidateQueries({ queryKey: ["assignments"] });
  };

  const remove = useMutation({
    mutationFn: (id: string) => assessmentsMutations.deleteAssignment(id),
    onSuccess: () => {
      toast.success("Deleted");
      setSelectedAssignment(null);
      void client.invalidateQueries({ queryKey: ["my-assignments"] });
      void client.invalidateQueries({ queryKey: ["assignments"] });
    },
  });

  const openAssignmentAttachment = async (fileKey: string) => {
    const url = await filesApi.presignDownload(fileKey);
    window.open(url, "_blank", "noopener,noreferrer");
  };

  return (
    <AppShell
      title={t("My assignments")}
      subtitle={t("Your classes, marking and results")}
      right={
        tab === "assignments" ? (
          <FormSheet
            title={t("New assignment")}
            triggerLabel={t("New")}
            submitLabel={t("Create")}
            onSubmit={handleCreateAssignment}
          >
            <Field label={t("Class")}>
              <CustomDropdown required value={newClassId} onChange={(event) => { setNewClassId(event.target.value); setNewSectionId(""); setNewCourseId(""); }}>
                <option value="">{t("Select class")}</option>
                {classOptions.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </CustomDropdown>
            </Field>
            <Field label={t("Section")}>
              <CustomDropdown value={newSectionId} disabled={!newClassId} onChange={(event) => { setNewSectionId(event.target.value); setNewCourseId(""); }}>
                <option value="">{t("Whole class")}</option>
                {newSectionOptions.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </CustomDropdown>
            </Field>
            <Field label={t("Course")}>
              <CustomDropdown required value={newCourseId} disabled={!newClassId} onChange={(event) => setNewCourseId(event.target.value)}>
                <option value="">{t("Select course")}</option>
                {newCourseOptions.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </CustomDropdown>
            </Field>
            <Field label={t("Title")}>
              <TextInput required value={newTitle} onChange={(event) => setNewTitle(event.target.value)} />
            </Field>
            <Field label={t("Instructions")}>
              <TextArea required value={newInstructions} onChange={(event) => setNewInstructions(event.target.value)} />
            </Field>
            <Field label={t("Attachment")}>
              <input
                type="file"
                accept=".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt,.jpg,.jpeg,.png,.webp"
                onChange={(event) => setNewAttachmentFile(event.target.files?.[0] ?? null)}
                className="block w-full text-xs text-muted-foreground file:mr-3 file:rounded-xl file:border file:border-border file:bg-card file:px-3 file:py-2 file:text-xs file:font-bold file:text-foreground"
              />
              {newAttachmentFile ? (
                <p className="mt-1 truncate text-xs font-medium text-muted-foreground">{newAttachmentFile.name}</p>
              ) : null}
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label={t("Due date")}>
                <TextInput type="date" required value={newDueDate} onChange={(event) => setNewDueDate(event.target.value)} />
              </Field>
              <Field label={t("Max marks")}>
                <TextInput type="number" min={0} value={newMaxMarks} onChange={(event) => setNewMaxMarks(event.target.value)} />
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

      {tab === "marking" ? <MarkingView canManage={false} teacherScoped /> : null}
      {tab === "results" ? <ResultsView canManage={false} teacherScoped /> : null}
      {tab !== "assignments" ? null : (
        <>
          <div className="mb-3 space-y-2">
            <div className="flex items-center gap-2">
              <label className="flex shrink-0 items-center gap-2 text-sm font-semibold">
                <input
                  type="checkbox"
                  checked={filters.mineOnly}
                  onChange={(e) => setFilters((f) => ({ ...f, mineOnly: e.target.checked }))}
                  className="h-4 w-4 rounded border-border"
                />
                {t("Mine only")}
              </label>
              <div className="min-w-0 flex-1">
                <FilterBar activeCount={activeCount} onClear={() => setFilters({ classId: "", sectionId: "", courseId: "", mineOnly: false })}>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label={t("Class")}>
                      <CustomDropdown
                        value={filters.classId}
                        onChange={(e) => setFilters((f) => ({ ...f, classId: e.target.value, sectionId: "", courseId: "" }))}
                      >
                        <option value="">{t("All classes")}</option>
                        {classOptions.map((item) => (
                          <option key={item.id} value={item.id}>{item.name}</option>
                        ))}
                      </CustomDropdown>
                    </Field>
                    <Field label={t("Section")}>
                      <CustomDropdown
                        value={filters.sectionId}
                        disabled={!filters.classId}
                        onChange={(e) => setFilters((f) => ({ ...f, sectionId: e.target.value, courseId: "" }))}
                      >
                        <option value="">{t("All sections")}</option>
                        {sectionOptions.map((item) => (
                          <option key={item.id} value={item.id}>{item.name}</option>
                        ))}
                      </CustomDropdown>
                    </Field>
                  </div>
                  <Field label={t("Course")}>
                    <CustomDropdown
                      value={filters.courseId}
                      disabled={!filters.classId}
                      onChange={(e) => setFilters((f) => ({ ...f, courseId: e.target.value }))}
                    >
                      <option value="">{t("All courses")}</option>
                      {courseOptions.map((item) => (
                        <option key={item.id} value={item.id}>{item.name}</option>
                      ))}
                    </CustomDropdown>
                  </Field>
                </FilterBar>
              </div>
            </div>
            <TextInput
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("Search assignments...")}
              className="mb-2"
            />
          </div>

          {assignments.isLoading ? <SkeletonList rows={4} /> : null}
          {assignments.isError ? (
            <EmptyState title={apiErrorMessage(assignments.error, t("Could not load assignments"))} />
          ) : null}

          {!assignments.isLoading && !assignments.isError && filteredAssignments.length === 0 ? (
            <EmptyState title={t("No assignments")} hint={t("New tasks will show up here.")} />
          ) : null}

          <div className="space-y-2.5">
            {filteredAssignments.map((item) => {
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
                      {item.teacher_name ? (
                        <p className="mt-0.5 text-xs font-medium text-muted-foreground">
                          {t("By")} {item.teacher_name}
                        </p>
                      ) : null}
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
                    {item.is_mine ? (
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
              onMutated={() => void client.invalidateQueries({ queryKey: ["my-assignments"] })}
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
      )}
    </AppShell>
  );
}
