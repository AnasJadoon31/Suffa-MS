import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { CalendarDays, CheckCircle2, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/app/AppShell";
import { FilterBar } from "@/components/app/FilterBar";
import { FormSheet } from "@/components/app/FormSheet";
import {
  Card,
  EmptyState,
  Field,
  Pill,
  SelectInput,
  SkeletonList,
  TextArea,
  TextInput,
} from "@/components/app/Primitives";
import { useAuth } from "@/lib/mms/auth";
import { academicsApi } from "@/lib/mms/endpoints";
import {
  academicsExtraApi,
  assessmentsApi,
  assessmentsMutations,
  type Assignment,
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
      void client.invalidateQueries({ queryKey: ["assignments"] });
    },
  });

  const submit = useMutation({
    mutationFn: (id: string) => assessmentsMutations.submitAssignment(id, `manual:${Date.now()}`),
    onSuccess: () => {
      toast.success("Marked as submitted");
      void client.invalidateQueries({ queryKey: ["assignments"] });
    },
  });

  const unsubmit = useMutation({
    mutationFn: (id: string) => assessmentsMutations.removeOwnSubmission(id),
    onSuccess: () => {
      toast.success("Submission withdrawn");
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
              <SelectInput required value={classId} onChange={(e) => setClassId(e.target.value)}>
                <option value="">Select class</option>
                {(classes.data ?? []).map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </SelectInput>
            </Field>
            <Field label="Course">
              <SelectInput required value={courseId} onChange={(e) => setCourseId(e.target.value)}>
                <option value="">Select course</option>
                {(courses.data ?? []).map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </SelectInput>
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
                <SelectInput
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
                </SelectInput>
              </Field>
              <Field label="Section">
                <SelectInput
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
                </SelectInput>
              </Field>
            </div>
            <Field label="Course">
              <SelectInput
                value={filters.courseId}
                onChange={(e) => setFilters((f) => ({ ...f, courseId: e.target.value }))}
              >
                <option value="">All courses</option>
                {(courses.data ?? []).map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </SelectInput>
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
                <div className="min-w-0">
                  <p className="truncate font-display text-base font-extrabold">{item.title}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {[item.course_name, item.class_name, item.section_name]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>
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

              <div className="flex items-center gap-2">
                {isStudent ? (
                  item.submitted_at ? (
                    <button
                      onClick={() => unsubmit.mutate(item.id)}
                      className="rounded-xl bg-muted px-3 py-1.5 text-xs font-bold"
                    >
                      Withdraw submission
                    </button>
                  ) : (
                    <button
                      onClick={() => submit.mutate(item.id)}
                      className="gradient-emerald rounded-xl px-3 py-1.5 text-xs font-extrabold text-primary-foreground"
                    >
                      Mark as submitted
                    </button>
                  )
                ) : null}
                {canManage ? (
                  <button
                    onClick={() => remove.mutate(item.id)}
                    className="ml-auto inline-flex items-center gap-1.5 rounded-xl bg-destructive/10 px-3 py-1.5 text-xs font-bold text-destructive"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Delete
                  </button>
                ) : null}
              </div>
            </Card>
          );
        })}
      </div>
    </AppShell>
  );
}
