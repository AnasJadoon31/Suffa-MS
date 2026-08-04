import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { BookOpen, CalendarRange, ChevronDown, ChevronUp, GraduationCap, Layers, Plus, Trash2, Users } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/app/AppShell";
import { FormSheet } from "@/components/app/FormSheet";
import {
  Card,
  EmptyState,
  Field,
  Pill,
  CustomDropdown,
  SearchableSelect,
  SkeletonList,
  TextInput,
} from "@/components/app/Primitives";
import { cn } from "@/lib/utils";
import { api } from "@/lib/mms/api";
import { useAuth } from "@/lib/mms/auth";
import { academicsApi, type AcademicClass } from "@/lib/mms/endpoints";
import { academicsExtraApi, academicsMutations, type Section } from "@/lib/mms/more-endpoints";
import { useTranslation } from "react-i18next";

export const Route = createFileRoute("/academics")({
  head: () => ({
    meta: [
      { title: "Academics — Suffa MS" },
      { name: "description", content: "Sessions, programs, classes and courses of the madrasa." },
      { property: "og:title", content: "Academics — Suffa MS" },
      { property: "og:description", content: "Sessions, programs, classes and courses." },
    ],
  }),
  component: AcademicsPage,
});

type Tab = "sessions" | "programs" | "classes" | "courses";

function AcademicsPage() {
    const { t } = useTranslation();
  const { user } = useAuth();
  const client = useQueryClient();
  const canManage = user?.role === "principal" || user?.role === "super_admin" || user?.is_principal_delegate;
  const [tab, setTab] = useState<Tab>("sessions");
  const today = new Date().toISOString().slice(0, 10);

  const sessions = useQuery({ queryKey: ["sessions"], queryFn: () => academicsApi.listSessions() });
  const classes = useQuery({ queryKey: ["classes"], queryFn: () => academicsApi.listClasses() });
  const programs = useQuery({
    queryKey: ["programs"],
    queryFn: () => academicsExtraApi.listPrograms(),
  });
  const courses = useQuery({
    queryKey: ["courses"],
    queryFn: () => academicsExtraApi.listCourses(),
  });

  const loading =
    (tab === "sessions" && sessions.isLoading) ||
    (tab === "classes" && classes.isLoading) ||
    (tab === "programs" && programs.isLoading) ||
    (tab === "courses" && courses.isLoading);

  const [name, setName] = useState("");
  const [programId, setProgramId] = useState("");
  const [start, setStart] = useState(today);
  const [end, setEnd] = useState(today);
  const [expandedClassId, setExpandedClassId] = useState<string | null>(null);
  const [expandedProgramId, setExpandedProgramId] = useState<string | null>(null);
  const [sectionName, setSectionName] = useState("");

  const sections = useQuery({
    queryKey: ["sections", expandedClassId],
    queryFn: () => (expandedClassId ? academicsExtraApi.listSections(expandedClassId) : Promise.resolve([])),
    enabled: Boolean(expandedClassId),
  });

  const createSection = useMutation({
    mutationFn: ({ classId, name }: { classId: string; name: string }) =>
      academicsMutations.createSection(classId, name),
    onSuccess: (_data, { classId }) => {
      toast.success("Section added");
      setSectionName("");
      void client.invalidateQueries({ queryKey: ["sections", classId] });
    },
  });

  const deleteSection = useMutation({
    mutationFn: ({ classId, sectionId }: { classId: string; sectionId: string }) =>
      academicsMutations.deleteSection(classId, sectionId),
    onSuccess: (_data, { classId }) => {
      toast.success("Section removed");
      void client.invalidateQueries({ queryKey: ["sections", classId] });
    },
  });

  const programCourses = useQuery({
    queryKey: ["program-courses", expandedProgramId],
    queryFn: () => (expandedProgramId ? academicsExtraApi.listProgramCourses(expandedProgramId) : Promise.resolve([])),
    enabled: Boolean(expandedProgramId),
  });

  const assignProgramCourse = useMutation({
    mutationFn: ({ programId, courseId }: { programId: string; courseId: string }) =>
      academicsMutations.assignCourseToProgram(programId, courseId),
    onSuccess: (_data, { programId }) => {
      toast.success("Course assigned");
      void client.invalidateQueries({ queryKey: ["program-courses", programId] });
    },
  });

  const unassignProgramCourse = useMutation({
    mutationFn: ({ programId, courseId }: { programId: string; courseId: string }) =>
      api.delete(`/api/v1/academics/programs/${programId}/courses/${courseId}`).then((r) => r.data),
    onSuccess: (_data, { programId }) => {
      toast.success("Course removed");
      void client.invalidateQueries({ queryKey: ["program-courses", programId] });
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      if (tab === "sessions")
        return academicsMutations.createSession({
          name: name.trim(),
          start_date: start,
          end_date: end,
        });
      if (tab === "programs") return academicsMutations.createProgram(name.trim());
      if (tab === "classes")
        return academicsMutations.createClass({ program_id: programId, name: name.trim() });
      return academicsMutations.createCourse(name.trim());
    },
    onSuccess: () => {
      toast.success("Created");
      setName("");
      void client.invalidateQueries({ queryKey: [tab] });
    },
  });

  const activate = useMutation({
    mutationFn: (id: string) => academicsMutations.activateSession(id),
    onSuccess: () => {
      toast.success("Session activated");
      void client.invalidateQueries({ queryKey: ["sessions"] });
    },
  });

  return (
    <AppShell
      title={t("Academics")}
      subtitle={t("Structure of your madrasa")}
      right={
        canManage ? (
          <FormSheet
            title={`New ${tab.slice(0, -1)}`}
            triggerLabel="Add"
            submitLabel="Create"
            onSubmit={() => create.mutateAsync()}
          >
            <Field label={t("Name")}>
              <TextInput required value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
            {tab === "classes" ? (
              <Field label={t("Program")}>
                <CustomDropdown
                  required
                  value={programId}
                  onChange={(e) => setProgramId(e.target.value)}
                >
                  <option value="">{t("Select program")}</option>
                  {(programs.data ?? []).map((program) => (
                    <option key={program.id} value={program.id}>
                      {program.name}
                    </option>
                  ))}
                </CustomDropdown>
              </Field>
            ) : null}
            {tab === "sessions" ? (
              <div className="grid grid-cols-2 gap-3">
                <Field label={t("Start")}>
                  <TextInput
                    type="date"
                    required
                    value={start}
                    onChange={(e) => setStart(e.target.value)}
                  />
                </Field>
                <Field label={t("End")}>
                  <TextInput
                    type="date"
                    required
                    value={end}
                    onChange={(e) => setEnd(e.target.value)}
                  />
                </Field>
              </div>
            ) : null}
          </FormSheet>
        ) : undefined
      }
    >
      <div className="mb-3 grid grid-cols-4 gap-1.5 rounded-2xl bg-muted p-1">
        {(["sessions", "programs", "classes", "courses"] as Tab[]).map((key) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={cn(
              "rounded-xl py-2 text-[0.68rem] font-bold uppercase tracking-wide transition-colors",
              tab === key
                ? "bg-card text-primary shadow-[var(--shadow-soft)]"
                : "text-muted-foreground",
            )}
          >
            {t(key === "sessions" ? "Sessions" : key === "programs" ? "Programs" : key === "classes" ? "Classes" : "Courses")}
          </button>
        ))}
      </div>

      {loading ? <SkeletonList rows={5} /> : null}

      {!loading && tab === "sessions" ? (
        <Items
          empty={(sessions.data ?? []).length === 0}
          rows={(sessions.data ?? []).map((item) => ({
            id: item.id,
            icon: <CalendarRange className="h-5 w-5" />,
            title: item.name,
            subtitle: `${item.start_date ?? ""} — ${item.end_date ?? ""}`,
            pill: item.is_active ? "Active" : undefined,
            action:
              canManage && !item.is_active
                ? { label: "Activate", onClick: () => activate.mutate(item.id) }
                : undefined,
          }))}
        />
      ) : null}

      {!loading && tab === "programs" ? (
        <div className="space-y-2">
          {(programs.data ?? []).map((program) => {
            const isExpanded = expandedProgramId === program.id;
            const assignedCourses = (isExpanded ? programCourses.data ?? [] : []);
            const availableCourses = (courses.data ?? []).filter(
              (c) => !assignedCourses.some((ac) => ac.id === c.id),
            );
            return (
              <div key={program.id}>
                <button
                  onClick={() => setExpandedProgramId(isExpanded ? null : program.id)}
                  className="w-full"
                >
                  <Card className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 p-3.5">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary">
                      <Layers className="h-5 w-5" />
                    </span>
                    <div className="min-w-0 text-left">
                      <p className="truncate font-semibold">{program.name}</p>
                      <p className="truncate text-xs text-muted-foreground">Program</p>
                    </div>
                    {isExpanded ? <ChevronUp className="h-5 w-5 text-muted-foreground" /> : <ChevronDown className="h-5 w-5 text-muted-foreground" />}
                  </Card>
                </button>
                {isExpanded ? (
                  <div className="ml-4 mt-1 space-y-2 border-l-2 border-border pl-4">
                    <p className="text-xs font-semibold text-muted-foreground">{t("Courses")}</p>
                    {assignedCourses.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5">
                        {assignedCourses.map((course) => (
                          <span
                            key={course.id}
                            className="inline-flex items-center gap-1 rounded-full bg-primary-soft px-2.5 py-1 text-xs font-medium text-primary"
                          >
                            {course.name}
                            {canManage ? (
                              <button
                                onClick={() => unassignProgramCourse.mutate({ programId: program.id, courseId: course.id })}
                                className="ml-0.5 text-primary/60 hover:text-destructive"
                              >
                                ×
                              </button>
                            ) : null}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground">{t("No courses assigned")}</p>
                    )}
                    {canManage ? (
                      <SearchableSelect
                        value=""
                        onChange={(courseId) => { if (courseId) assignProgramCourse.mutate({ programId: program.id, courseId }); }}
                        options={availableCourses.map((c) => ({ value: c.id, label: c.name }))}
                        placeholder={t("Assign course...")}
                      />
                    ) : null}
                  </div>
                ) : null}
              </div>
            );
          })}
          {programs.data?.length === 0 ? <EmptyState title={t("Nothing here yet")} /> : null}
        </div>
      ) : null}

      {!loading && tab === "classes" ? (
        <ClassList
          classes={classes.data ?? []}
          programs={programs.data ?? []}
          expandedClassId={expandedClassId}
          onToggle={(id) => setExpandedClassId(expandedClassId === id ? null : id)}
          sections={sections.data ?? []}
          sectionName={sectionName}
          onSectionNameChange={setSectionName}
          canManage={canManage}
          createSection={(classId: string, name: string) => createSection.mutate({ classId, name })}
          createSectionPending={createSection.isPending}
          deleteSection={(classId: string, sectionId: string) => deleteSection.mutate({ classId, sectionId })}
          deleteSectionPending={deleteSection.isPending}
        />
      ) : null}

      {!loading && tab === "courses" ? (
        <Items
          empty={(courses.data ?? []).length === 0}
          rows={(courses.data ?? []).map((item) => ({
            id: item.id,
            icon: <BookOpen className="h-5 w-5" />,
            title: item.name,
            subtitle: "Course",
          }))}
        />
      ) : null}
    </AppShell>
  );
}

function Items({
  empty,
  rows,
}: {
  empty: boolean;
  rows: {
    id: string;
    icon: React.ReactNode;
    title: string;
    subtitle: string;
    pill?: string | undefined;
    action?: { label: string; onClick: () => void } | undefined;
  }[];
}) {
    const { t } = useTranslation();
  if (empty) return <EmptyState title={t("Nothing here yet")} />;
  return (
    <div className="space-y-2">
      {rows.map((row) => (
        <Card
          key={row.id}
          className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 p-3.5"
        >
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary">
            {row.icon}
          </span>
          <div className="min-w-0">
            <p className="truncate font-semibold">{row.title}</p>
            <p className="truncate text-xs text-muted-foreground">{row.subtitle}</p>
          </div>
          {row.pill ? (
            <Pill tone="success">{row.pill}</Pill>
          ) : row.action ? (
            <button
              onClick={row.action.onClick}
              className="rounded-xl bg-primary-soft px-3 py-1.5 text-xs font-bold text-primary"
            >
              {row.action.label}
            </button>
          ) : (
            <span />
          )}
        </Card>
      ))}
    </div>
  );
}

function ClassList({
  classes,
  programs,
  expandedClassId,
  onToggle,
  sections,
  sectionName,
  onSectionNameChange,
  canManage,
  createSection,
  createSectionPending,
  deleteSection,
  deleteSectionPending,
}: {
  classes: AcademicClass[];
  programs: { id: string; name: string }[];
  expandedClassId: string | null;
  onToggle: (id: string) => void;
  sections: Section[];
  sectionName: string;
  onSectionNameChange: (v: string) => void;
  canManage: boolean;
  createSection: (classId: string, name: string) => void;
  createSectionPending: boolean;
  deleteSection: (classId: string, sectionId: string) => void;
  deleteSectionPending: boolean;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  if (classes.length === 0) return <EmptyState title={t("Nothing here yet")} />;

  return (
    <div className="space-y-2">
      {classes.map((cls) => {
        const program = programs.find((p) => p.id === cls.program_id);
        const isExpanded = expandedClassId === cls.id;
        const classSections = sections.filter((s) => s.class_id === cls.id);

        return (
          <div key={cls.id}>
            <button
              onClick={() => onToggle(cls.id)}
              className="w-full"
            >
              <Card className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 p-3.5">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary">
                  <GraduationCap className="h-5 w-5" />
                </span>
                <div className="min-w-0 text-left">
                  <p className="truncate font-semibold">{cls.name}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {program?.name ?? "Class"} · {classSections.length} {t("sections")}
                  </p>
                </div>
                {isExpanded ? (
                  <ChevronUp className="h-5 w-5 text-muted-foreground" />
                ) : (
                  <ChevronDown className="h-5 w-5 text-muted-foreground" />
                )}
              </Card>
            </button>

            {isExpanded ? (
              <div className="ml-4 mt-1 space-y-2 border-l-2 border-border pl-4">
                {classSections.map((sec) => (
                  <div
                    key={sec.id}
                    className="group relative cursor-pointer rounded-2xl border border-border bg-card p-3 transition-colors hover:border-primary/30"
                    onClick={() =>
                      navigate({
                        to: "/people",
                        search: { tab: "students", section_id: sec.id },
                      })
                    }
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <span className="grid h-8 w-8 place-items-center rounded-lg bg-primary-soft text-primary">
                          <Users className="h-4 w-4" />
                        </span>
                        <div>
                          <p className="text-sm font-semibold">{sec.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {sec.student_count} {t("students")}
                          </p>
                        </div>
                      </div>
                      {canManage ? (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteSection(cls.id, sec.id);
                          }}
                          disabled={deleteSectionPending}
                          className="grid h-7 w-7 place-items-center rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      ) : null}
                    </div>
                  </div>
                ))}
                {classSections.length === 0 ? (
                  <p className="px-3 py-1.5 text-xs text-muted-foreground">
                    {t("No sections yet")}
                  </p>
                ) : null}
                {canManage ? (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (!sectionName.trim() || !cls.id) return;
                      createSection(cls.id, sectionName.trim());
                    }}
                    className="flex gap-2 px-3 py-1.5"
                  >
                    <TextInput
                      value={sectionName}
                      onChange={(e) => onSectionNameChange(e.target.value)}
                      placeholder={t("Section name...")}
                      className="flex-1 text-xs"
                    />
                    <button
                      type="submit"
                      disabled={
                        createSectionPending ||
                        !sectionName.trim()
                      }
                      className="gradient-emerald inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-bold text-primary-foreground disabled:opacity-50"
                    >
                      <Plus className="h-3 w-3" />
                      {t("Add")}
                    </button>
                  </form>
                ) : null}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
