import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Download } from "lucide-react";
import type { KeyboardEvent } from "react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { AppShell } from "@/components/app/AppShell";
import { FilterBar } from "@/components/app/FilterBar";
import { FormSheet } from "@/components/app/FormSheet";
import { Card, CustomDropdown, EmptyState, Field, Pill, SectionTitle, SkeletonList, TextArea, TextInput } from "@/components/app/Primitives";
import { useAuth } from "@/lib/mms/auth";
import { operationsApi } from "@/lib/mms/endpoints";
import { assessmentsApi, assessmentsMutations, filesApi, type Assignment, uploadFile } from "@/lib/mms/more-endpoints";
import { apiErrorMessage } from "@/lib/mms/api";
import { cn } from "@/lib/utils";
import { MarkingView, ResultsView } from "./examination";

export const Route = createFileRoute("/my-assessments")({
  head: () => ({
    meta: [
      { title: "My Assessments — Suffa MS" },
      { name: "description", content: "My assignments and submission status" },
    ],
  }),
  component: MyAssessmentsPage,
});

function MyAssessmentsPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const client = useQueryClient();
  const [tab, setTab] = useState<"assignments" | "marking" | "results">("assignments");

  const [selectedAssignment, setSelectedAssignment] = useState<Assignment | null>(null);
  const [filters, setFilters] = useState({ classId: "", sectionId: "", courseId: "" });
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
      if (
        slot.class_id === filters.classId &&
        (!filters.courseId || slot.course_id === filters.courseId) &&
        slot.section_id
      ) {
        map.set(slot.section_id, slot.section_name ?? "—");
      }
    }
    return Array.from(map, ([id, name]) => ({ id, name }));
  }, [filters.classId, filters.courseId, myTimetable.data]);
  const courseOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const slot of myTimetable.data ?? []) {
      if (
        (!filters.classId || slot.class_id === filters.classId) &&
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
    queryKey: ["my-assignments", filters],
    queryFn: () => assessmentsApi.listAssignments({
      mine_only: true,
      class_id: filters.classId || undefined,
      section_id: filters.sectionId || undefined,
      course_id: filters.courseId || undefined,
      sort: "created_at",
    }),
    enabled: Boolean(user),
  });
  const activeCount = [filters.classId, filters.sectionId, filters.courseId].filter(Boolean).length;

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

  const openAssignmentAttachment = async (fileKey: string) => {
    const url = await filesApi.presignDownload(fileKey);
    window.open(url, "_blank", "noopener,noreferrer");
  };

  return (
    <AppShell
      title={t("My assessments")}
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
      <FilterBar
        activeCount={activeCount}
        onClear={() => setFilters({ classId: "", sectionId: "", courseId: "" })}
      >
        <Field label={t("Class")}>
          <CustomDropdown
            value={filters.classId}
            onChange={(event) => setFilters({ classId: event.target.value, sectionId: "", courseId: "" })}
          >
            <option value="">{t("All classes")}</option>
            {classOptions.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </CustomDropdown>
        </Field>
        <Field label={t("Section")}>
          <CustomDropdown
            value={filters.sectionId}
            disabled={!filters.classId}
            onChange={(event) => setFilters((current) => ({ ...current, sectionId: event.target.value }))}
          >
            <option value="">{t("All sections")}</option>
            {sectionOptions.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </CustomDropdown>
        </Field>
        <Field label={t("Course")}>
          <CustomDropdown
            value={filters.courseId}
            onChange={(event) => setFilters((current) => ({ ...current, courseId: event.target.value, sectionId: "" }))}
          >
            <option value="">{t("All courses")}</option>
            {courseOptions.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </CustomDropdown>
        </Field>
      </FilterBar>
      {assignments.isLoading ? <SkeletonList rows={4} /> : null}
      {assignments.isError ? (
        <EmptyState title={apiErrorMessage(assignments.error, t("Could not load assignments"))} />
      ) : null}
      <SectionTitle>{t("Assignments")}</SectionTitle>
      {assignments.data?.length === 0 ? (
        <EmptyState title={t("No assignments yet")} />
      ) : (
        <div className="space-y-2.5">
          {assignments.data?.map((assignment) => {
            return (
              <div
                key={assignment.id}
                role="button"
                tabIndex={0}
                onClick={() => setSelectedAssignment(assignment)}
                onKeyDown={(event: KeyboardEvent<HTMLDivElement>) => {
                  if (event.key === "Enter" || event.key === " ") setSelectedAssignment(assignment);
                }}
                className="cursor-pointer"
              >
              <Card className="space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold">{assignment.title}</p>
                    {assignment.description ? (
                      <p className="mt-0.5 text-xs text-muted-foreground">{assignment.description}</p>
                    ) : null}
                    {assignment.due_date ? (
                      <p className="mt-1 text-xs">
                        <Pill tone="warning">{t("Due")} {assignment.due_date.slice(0, 10)}</Pill>
                      </p>
                    ) : null}
                  </div>
                  <Pill tone="muted">{t("Review")}</Pill>
                </div>
                {assignment.attachment_key ? (
                  <button
                    onClick={(event) => {
                      event.stopPropagation();
                      void openAssignmentAttachment(assignment.attachment_key!);
                    }}
                    className="flex items-center gap-1 text-xs font-bold text-primary"
                  >
                    <Download className="h-3 w-3" />
                    {t("Attachment")}
                  </button>
                ) : null}
                {assignment.submission_mark != null ? (
                  <p className="text-xs">
                    {t("Mark")}: {assignment.submission_mark}{" "}
                    {assignment.submission_feedback ? `— ${assignment.submission_feedback}` : ""}
                  </p>
                ) : null}
              </Card>
              </div>
            );
          })}
        </div>
      )}
      {selectedAssignment ? (
        <TeacherAssignmentReviewSheet
          assignment={selectedAssignment}
          onClose={() => setSelectedAssignment(null)}
        />
      ) : null}
        </>
      )}
    </AppShell>
  );
}

function TeacherAssignmentReviewSheet({
  assignment,
  onClose,
}: {
  assignment: Assignment;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const status = useQuery({
    queryKey: ["assignment-submission-status", assignment.id],
    queryFn: () => assessmentsMutations.listSubmissionStatus(assignment.id),
  });

  const openFile = async (fileKey: string) => {
    const url = await filesApi.presignDownload(fileKey);
    window.open(url, "_blank", "noopener,noreferrer");
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
      <div className="max-h-[88vh] w-full max-w-2xl overflow-y-auto rounded-3xl bg-card p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate font-display text-lg font-extrabold">{assignment.title}</p>
            <p className="text-sm text-muted-foreground">
              {[assignment.course_name, assignment.class_name, assignment.section_name].filter(Boolean).join(" · ")}
            </p>
          </div>
          <button onClick={onClose} className="rounded-xl px-3 py-2 text-xs font-bold text-primary">{t("Close")}</button>
        </div>

        <p className="mt-4 whitespace-pre-line text-sm text-muted-foreground">{assignment.instructions}</p>
        {assignment.attachment_key ? (
          <button onClick={() => void openFile(assignment.attachment_key!)} className="mt-3 flex items-center gap-1 rounded-xl bg-primary-soft px-3 py-2 text-xs font-bold text-primary">
            <Download className="h-4 w-4" />
            {t("Download attachment")}
          </button>
        ) : null}

        <SectionTitle>{t("Students")}</SectionTitle>
        {status.isLoading ? <SkeletonList rows={4} /> : null}
        {status.isError ? <EmptyState title={apiErrorMessage(status.error, t("Could not load submissions"))} /> : null}
        <div className="space-y-2">
          {(status.data ?? []).map((student) => (
            <Card key={student.student_id} className="flex items-center gap-3 p-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold">{student.student_name}</p>
                <p className="text-xs text-muted-foreground">{student.admission_number}</p>
              </div>
              {student.file_key ? (
                <button onClick={() => void openFile(student.file_key!)} className="flex items-center gap-1 rounded-xl bg-primary px-3 py-2 text-xs font-bold text-primary-foreground">
                  <Download className="h-4 w-4" />
                  {t("Download")}
                </button>
              ) : (
                <Pill tone="warning">{t("Not submitted")}</Pill>
              )}
            </Card>
          ))}
        </div>
        {!status.isLoading && !status.isError && (status.data ?? []).length === 0 ? <EmptyState title={t("No students found")} /> : null}
      </div>
    </div>
  );
}
