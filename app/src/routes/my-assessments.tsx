import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Upload, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { AppShell } from "@/components/app/AppShell";
import { FilterBar } from "@/components/app/FilterBar";
import { FormSheet } from "@/components/app/FormSheet";
import { Card, CustomDropdown, EmptyState, Field, Pill, SectionTitle, SkeletonList, TextArea, TextInput } from "@/components/app/Primitives";
import { useAuth } from "@/lib/mms/auth";
import { operationsApi } from "@/lib/mms/endpoints";
import { assessmentsApi, assessmentsMutations, filesApi, type Assignment } from "@/lib/mms/more-endpoints";
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

  const [files, setFiles] = useState<Record<string, File | null>>({});
  const [submitting, setSubmitting] = useState<Set<string>>(new Set());
  const [error, setError] = useState("");
  const [filters, setFilters] = useState({ classId: "", sectionId: "", courseId: "" });
  const [newClassId, setNewClassId] = useState("");
  const [newSectionId, setNewSectionId] = useState("");
  const [newCourseId, setNewCourseId] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [newInstructions, setNewInstructions] = useState("");
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
    const map = new Map<string, string>();
    for (const slot of myTimetable.data ?? []) {
      if ((!filters.classId || slot.class_id === filters.classId) && slot.section_id) {
        map.set(slot.section_id, slot.section_name ?? "—");
      }
    }
    return Array.from(map, ([id, name]) => ({ id, name }));
  }, [filters.classId, myTimetable.data]);
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
    }),
    enabled: Boolean(user),
  });
  const activeCount = [filters.classId, filters.sectionId, filters.courseId].filter(Boolean).length;

  const handleFileSelect = (assignmentId: string, file: File | null) => {
    setFiles((prev) => ({ ...prev, [assignmentId]: file }));
  };

  const handleSubmit = async (assignment: Assignment) => {
    const file = files[assignment.id];
    if (!file) return;
    setError("");
    setSubmitting((prev) => new Set(prev).add(assignment.id));
    try {
      const { object_key, upload_url } = await filesApi.presignUpload({
        category: "submissions",
        filename: file.name,
        content_type: file.type || "application/octet-stream",
        size_bytes: file.size,
      });
      await fetch(upload_url, { method: "PUT", body: file, headers: { "Content-Type": file.type || "application/octet-stream" } });
      await assessmentsApi.submitAssignment(assignment.id, object_key);
      await client.invalidateQueries({ queryKey: ["assignments"] });
    } catch (err) {
      setError(apiErrorMessage(err, t("Failed to submit assignment")));
    } finally {
      setSubmitting((prev) => {
        const next = new Set(prev);
        next.delete(assignment.id);
        return next;
      });
    }
  };

  const handleRemove = async (assignmentId: string) => {
    setError("");
    try {
      await assessmentsApi.removeOwnSubmission(assignmentId);
      await client.invalidateQueries({ queryKey: ["assignments"] });
    } catch (err) {
      setError(apiErrorMessage(err, t("Failed to remove submission")));
    }
  };
  const handleCreateAssignment = async () => {
    await assessmentsMutations.createAssignment({
      mine_only: true,
      class_id: newClassId,
      section_ids: newSectionId ? [newSectionId] : [],
      course_id: newCourseId,
      title: newTitle.trim(),
      instructions: newInstructions.trim(),
      due_date: newDueDate,
      ...(newMaxMarks ? { max_marks: Number(newMaxMarks) } : {}),
    });
    setNewTitle("");
    setNewInstructions("");
    setNewMaxMarks("");
    await client.invalidateQueries({ queryKey: ["my-assignments"] });
    await client.invalidateQueries({ queryKey: ["assignments"] });
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
            onChange={(event) => setFilters((current) => ({ ...current, sectionId: event.target.value, courseId: "" }))}
          >
            <option value="">{t("All sections")}</option>
            {sectionOptions.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </CustomDropdown>
        </Field>
        <Field label={t("Course")}>
          <CustomDropdown
            value={filters.courseId}
            onChange={(event) => setFilters((current) => ({ ...current, courseId: event.target.value }))}
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
      {error ? (
        <p className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error}</p>
      ) : null}
      <SectionTitle>{t("Assignments")}</SectionTitle>
      {assignments.data?.length === 0 ? (
        <EmptyState title={t("No assignments yet")} />
      ) : (
        <div className="space-y-2.5">
          {assignments.data?.map((assignment) => {
            const submitted = Boolean(assignment.submission_file_key);
            const isSubmitting = submitting.has(assignment.id);
            return (
              <Card key={assignment.id} className="space-y-2">
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
                  <Pill tone={submitted ? "success" : "warning"}>
                    {submitted ? t("Submitted") : t("Pending")}
                  </Pill>
                </div>
                {submitted ? (
                  <button
                    onClick={() => handleRemove(assignment.id)}
                    className="flex items-center gap-1 text-xs text-destructive"
                  >
                    <Trash2 className="h-3 w-3" />
                    {t("Remove submission")}
                  </button>
                ) : (
                  <div className="flex items-center gap-2">
                    <input
                      type="file"
                      accept=".pdf,.doc,.docx,.txt,.jpg,.png,.webp"
                      onChange={(e) => handleFileSelect(assignment.id, e.target.files?.[0] ?? null)}
                      className="text-xs text-muted-foreground file:rounded-lg file:border file:border-border file:bg-card file:px-2 file:py-1 file:text-xs file:font-semibold file:text-foreground"
                    />
                    <button
                      onClick={() => handleSubmit(assignment)}
                      disabled={!files[assignment.id] || isSubmitting}
                      className="flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground disabled:opacity-50"
                    >
                      <Upload className="h-3 w-3" />
                      {isSubmitting ? t("Uploading...") : t("Submit")}
                    </button>
                  </div>
                )}
                {assignment.submission_mark != null ? (
                  <p className="text-xs">
                    {t("Mark")}: {assignment.submission_mark}{" "}
                    {assignment.submission_feedback ? `— ${assignment.submission_feedback}` : ""}
                  </p>
                ) : null}
              </Card>
            );
          })}
        </div>
      )}
        </>
      )}
    </AppShell>
  );
}
