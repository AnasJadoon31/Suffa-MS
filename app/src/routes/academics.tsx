import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { BookOpen, CalendarRange, ChevronDown, ChevronUp, GraduationCap, Layers, ListChecks, Plus, Trash2, Users } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
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
import { useAuth } from "@/lib/mms/auth";
import { academicsApi, type AcademicClass, type AcademicSession } from "@/lib/mms/endpoints";
import { academicsExtraApi, academicsMutations, dailyReportApi, type Section } from "@/lib/mms/more-endpoints";
import { useTranslation } from "react-i18next";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

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

function DailyReportFieldRow({
  field,
  onChange,
  onRemove,
}: {
  field: { id: string; key: string; label: string; type: string; required: boolean; options: string[]; enabled: boolean };
  onChange: (field: { id: string; key: string; label: string; type: string; required: boolean; options: string[]; enabled: boolean }) => void;
  onRemove: () => void;
}) {
  const { t } = useTranslation();
  const [optionsText, setOptionsText] = useState(field.options.join(", "));

  return (
    <Card className="space-y-2 p-3">
      <div className="grid grid-cols-[1fr_auto] gap-2">
        <TextInput
          value={field.label}
          onChange={(e) => onChange({ ...field, label: e.target.value, key: e.target.value.toLowerCase().replace(/\s+/g, "_").slice(0, 64) })}
          placeholder={t("Field label")}
        />
        <select
          className="rounded-xl border border-border bg-background px-2 py-1 text-xs"
          value={field.type}
          onChange={(e) => {
            const type = e.target.value;
            onChange({ ...field, type, options: ["radio", "checkbox_group", "dropdown"].includes(type) ? (field.options.length ? field.options : [""]) : [] });
            if (["radio", "checkbox_group", "dropdown"].includes(type) && field.options.length <= 1) {
              setOptionsText(field.options.join(", "));
            }
          }}
        >
          {["text", "textarea", "number", "boolean", "dropdown", "radio", "checkbox_group", "phone", "file", "image"].map((tp) => (
            <option key={tp} value={tp}>{tp}</option>
          ))}
        </select>
      </div>
      {["radio", "checkbox_group", "dropdown"].includes(field.type) ? (
        <Field label={t("Options (comma-separated)")}>
          <TextInput
            value={optionsText}
            onChange={(e) => {
              setOptionsText(e.target.value);
              onChange({ ...field, options: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) });
            }}
            onBlur={() => setOptionsText(field.options.join(", "))}
            placeholder={t("Option 1, Option 2, ...")}
          />
        </Field>
      ) : null}
      <div className="flex items-center justify-between">
        <label className="flex items-center gap-1.5 text-xs">
          <input type="checkbox" checked={field.required} onChange={(e) => onChange({ ...field, required: e.target.checked })} className="h-3.5 w-3.5 rounded" />
          {t("Required")}
        </label>
        <button className="text-xs text-destructive" onClick={onRemove}>
          {t("Remove")}
        </button>
      </div>
    </Card>
  );
}

function DailyReportConfigDialog({
  classId,
  className,
  open,
  onOpenChange,
  onSave,
}: {
  classId: string;
  className: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (config: { enabled: boolean; fields_definition: { key: string; label: string; type: string; required: boolean; options: string[]; enabled: boolean }[] }) => Promise<void>;
}) {
  const { t } = useTranslation();
  const [enabled, setEnabled] = useState(false);
  const [fields, setFields] = useState<{ id: string; key: string; label: string; type: string; required: boolean; options: string[]; enabled: boolean }[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!open || !classId) return;
    void (async () => {
      try {
        const config = await dailyReportApi.getConfig(classId);
        setEnabled(config.enabled);
        setFields(config.fields_definition.map((f) => ({ ...f, id: f.id ?? crypto.randomUUID(), options: f.options ?? [], enabled: f.enabled ?? true })));
      } catch {
        setEnabled(false);
        setFields([]);
      }
      setLoaded(true);
    })();
  }, [open, classId]);

  const handleSave = async () => {
    await onSave({
      enabled,
      fields_definition: fields.map((f) => ({ key: f.key, label: f.label, type: f.type, required: f.required, options: f.options, enabled: f.enabled })),
    });
  };

  return (
    <AlertDialog open={open} onOpenChange={(o) => !o && onOpenChange(false)}>
      <AlertDialogContent className="max-h-[85vh] overflow-y-auto">
        <AlertDialogHeader>
          <AlertDialogTitle>{t("Daily Reports")} — {className}</AlertDialogTitle>
          <AlertDialogDescription>
            {t("Configure daily report fields for this class.")}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {!loaded ? (
          <div className="py-8 text-center text-sm text-muted-foreground">{t("Loading…")}</div>
        ) : (
          <div className="space-y-3">
            <label className="flex items-center gap-2 rounded-xl bg-muted px-3 py-2.5 text-sm">
              <input
                type="checkbox"
                checked={enabled}
                onChange={(event) => setEnabled(event.target.checked)}
                className="h-4 w-4 shrink-0"
              />
              <span className="min-w-0">
                <span className="block font-semibold">{t("Enable daily reports")}</span>
                <span className="block text-xs text-muted-foreground">
                  {t("When enabled, teachers can mark daily reports for students in this class.")}
                </span>
              </span>
            </label>
            {enabled ? (
              <div className="space-y-3">
                <p className="text-xs font-semibold text-muted-foreground">{t("Report fields")}</p>
                {fields.map((field) => (
                  <DailyReportFieldRow
                    key={field.id}
                    field={field}
                    onChange={(updated) => setFields(fields.map((f) => (f.id === updated.id ? updated : f)))}
                    onRemove={() => setFields(fields.filter((f) => f.id !== field.id))}
                  />
                ))}
                <button
                  className="flex items-center gap-1.5 self-start rounded-xl border border-dashed border-border px-3 py-2 text-xs font-semibold text-muted-foreground"
                  onClick={() => setFields([...fields, { id: crypto.randomUUID(), key: "", label: "", type: "text", required: false, options: [], enabled: true }])}
                >
                  <Plus className="h-3.5 w-3.5" />
                  {t("Add field")}
                </button>
              </div>
            ) : null}
          </div>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel>{t("Cancel")}</AlertDialogCancel>
          <AlertDialogAction onClick={() => handleSave()}>
            {t("Save changes")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function AcademicsPage() {
    const { t } = useTranslation();
  const { user, refresh } = useAuth();
  const client = useQueryClient();
  const canManage = Boolean(user?.role === "principal" || user?.role === "super_admin" || user?.is_principal_delegate);
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
  const [sectionName, setSectionName] = useState("");
  const [programSearch, setProgramSearch] = useState("");
  const [classSearch, setClassSearch] = useState("");
  const [courseSearch, setCourseSearch] = useState("");
  const [sessionCreateMode, setSessionCreateMode] = useState<"rollover" | "blank">("rollover");
  const [rolloverSourceSessionId, setRolloverSourceSessionId] = useState("");
  const [promotionTargets, setPromotionTargets] = useState<Record<string, string>>({});
  const [copyTimetable, setCopyTimetable] = useState(true);
  const [copyHolidays, setCopyHolidays] = useState(true);
  const [editingSession, setEditingSession] = useState<AcademicSession | null>(null);
  const [editName, setEditName] = useState("");
  const [editStart, setEditStart] = useState("");
  const [editEnd, setEditEnd] = useState("");
  const [deleteSessionId, setDeleteSessionId] = useState<string | null>(null);
  const [editingCourse, setEditingCourse] = useState<{ id: string; name: string } | null>(null);
  const [courseName, setCourseName] = useState("");
  const [deleteCourseId, setDeleteCourseId] = useState<string | null>(null);
  const [editingProgram, setEditingProgram] = useState<{ id: string; name: string; default_portal_enabled: boolean } | null>(null);
  const [editProgramName, setEditProgramName] = useState("");
  const [editProgramPortal, setEditProgramPortal] = useState(true);
  const [deleteProgramId, setDeleteProgramId] = useState<string | null>(null);
  const [editingClassDr, setEditingClassDr] = useState<{ id: string; name: string } | null>(null);

  useEffect(() => {
    if (!editingSession) return;
    setEditName(editingSession.name);
    setEditStart(editingSession.start_date ?? "");
    setEditEnd(editingSession.end_date ?? "");
  }, [editingSession]);

  useEffect(() => {
    if (editingCourse) setCourseName(editingCourse.name);
  }, [editingCourse]);

  useEffect(() => {
    if (editingProgram) {
      setEditProgramName(editingProgram.name);
      setEditProgramPortal(editingProgram.default_portal_enabled);
    }
  }, [editingProgram]);

  const filteredPrograms = useMemo(() => {
    const term = programSearch.trim().toLowerCase();
    const list = programs.data ?? [];
    if (!term) return list;
    return list.filter((program) => program.name.toLowerCase().includes(term));
  }, [programSearch, programs.data]);

  const filteredClasses = useMemo(() => {
    const term = classSearch.trim().toLowerCase();
    const list = classes.data ?? [];
    if (!term) return list;
    return list.filter((academicClass) => {
      const program = (programs.data ?? []).find((item) => item.id === academicClass.program_id);
      return `${academicClass.name} ${program?.name ?? ""}`.toLowerCase().includes(term);
    });
  }, [classSearch, classes.data, programs.data]);

  const filteredCourses = useMemo(() => {
    const term = courseSearch.trim().toLowerCase();
    const list = courses.data ?? [];
    if (!term) return list;
    return list.filter((course) => course.name.toLowerCase().includes(term));
  }, [courseSearch, courses.data]);

  const activeSession = useMemo(
    () => (sessions.data ?? []).find((session) => session.is_active) ?? null,
    [sessions.data],
  );

  const promotionClasses = useMemo(
    () => [...(classes.data ?? [])].sort((a, b) => a.name.localeCompare(b.name)),
    [classes.data],
  );

  const rolloverSourceId = rolloverSourceSessionId || activeSession?.id || "";

  const defaultPromotionTarget = (index: number) => promotionClasses[index + 1]?.id ?? "__graduate__";
  const promotionValue = (classId: string, index: number) =>
    promotionTargets[classId] ?? defaultPromotionTarget(index);

  const sections = useQuery({
    queryKey: ["sections", expandedClassId],
    queryFn: () => (expandedClassId ? academicsExtraApi.listSections(expandedClassId) : Promise.resolve([])),
    enabled: Boolean(expandedClassId),
  });
  const classSectionQueries = useQueries({
    queries: (classes.data ?? []).map((academicClass) => ({
      queryKey: ["sections", academicClass.id],
      queryFn: () => academicsExtraApi.listSections(academicClass.id),
      enabled: tab === "classes",
    })),
  });
  const allClassSections = useMemo(() => {
    return classSectionQueries.flatMap((query) => query.data ?? []);
  }, [classSectionQueries]);
  const classSectionCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const section of allClassSections) {
      counts.set(section.class_id, (counts.get(section.class_id) ?? 0) + 1);
    }
    return counts;
  }, [allClassSections]);

  const classCourseQueries = useQueries({
    queries: (classes.data ?? []).map((academicClass) => ({
      queryKey: ["class-courses", academicClass.id],
      queryFn: () => academicsExtraApi.listClassCourses(academicClass.id),
      enabled: tab === "classes",
    })),
  });
  const classCourses = useMemo(() => {
    const coursesByClass = new Map<string, { id: string; name: string }[]>();
    for (const [index, academicClass] of (classes.data ?? []).entries()) {
      coursesByClass.set(academicClass.id, classCourseQueries[index]?.data ?? []);
    }
    return coursesByClass;
  }, [classCourseQueries, classes.data]);

  const createSection = useMutation({
    mutationFn: ({ classId, name }: { classId: string; name: string }) =>
      academicsMutations.createSection(classId, name),
    onSuccess: (_data, { classId }) => {
      toast.success("Section added");
      setSectionName("");
      void client.invalidateQueries({ queryKey: ["sections", classId] });
      void client.invalidateQueries({ queryKey: ["classes"] });
    },
  });

  const deleteSection = useMutation({
    mutationFn: ({ classId, sectionId }: { classId: string; sectionId: string }) =>
      academicsMutations.deleteSection(classId, sectionId),
    onSuccess: (_data, { classId }) => {
      toast.success("Section removed");
      void client.invalidateQueries({ queryKey: ["sections", classId] });
      void client.invalidateQueries({ queryKey: ["classes"] });
    },
  });

  const assignClassCourse = useMutation({
    mutationFn: ({ classId, courseId }: { classId: string; courseId: string }) =>
      academicsMutations.assignCourse(classId, courseId),
    onSuccess: (_data, { classId }) => {
      toast.success("Course assigned");
      void client.invalidateQueries({ queryKey: ["class-courses", classId] });
    },
  });

  const unassignClassCourse = useMutation({
    mutationFn: ({ classId, courseId }: { classId: string; courseId: string }) =>
      academicsMutations.unassignCourse(classId, courseId),
    onSuccess: (_data, { classId }) => {
      toast.success("Course removed");
      void client.invalidateQueries({ queryKey: ["class-courses", classId] });
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      if (tab === "sessions" && sessionCreateMode === "rollover") {
        if (!rolloverSourceId) throw new Error("Select the session to promote from");
        return academicsMutations.rolloverSession(rolloverSourceId, {
          name: name.trim(),
          start_date: start,
          end_date: end,
          class_mappings: promotionClasses.map((academicClass, index) => {
            const target = promotionValue(academicClass.id, index);
            return {
              current_class_id: academicClass.id,
              next_class_id: target === "__graduate__" ? null : target,
            };
          }),
          copy_timetable: copyTimetable,
          copy_holidays: copyHolidays,
          shift_holiday_dates: true,
        });
      }
      if (tab === "sessions")
        return academicsMutations.createSession({
          name: name.trim(),
          start_date: start,
          end_date: end,
        });
      if (tab === "programs") return academicsMutations.createProgram({ name: name.trim(), default_portal_enabled: true });
      if (tab === "classes")
        return academicsMutations.createClass({ program_id: programId, name: name.trim() });
      return academicsMutations.createCourse(name.trim());
    },
    onSuccess: async () => {
      toast.success("Created");
      setName("");
      setPromotionTargets({});
      if (tab === "sessions" && sessionCreateMode === "rollover") await refresh();
      await client.invalidateQueries();
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Could not create"),
  });

  const activate = useMutation({
    mutationFn: (id: string) => academicsMutations.activateSession(id),
    onSuccess: async () => {
      toast.success("Session activated");
      await refresh();
      await client.invalidateQueries();
    },
  });

  const updateSession = useMutation({
    mutationFn: () => {
      if (!editingSession) throw new Error("Select a session first");
      return academicsMutations.updateSession(editingSession.id, {
        name: editName.trim(),
        start_date: editStart,
        end_date: editEnd,
      });
    },
    onSuccess: async () => {
      toast.success("Session updated");
      setEditingSession(null);
      await client.invalidateQueries({ queryKey: ["sessions"] });
      await refresh();
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Could not update session"),
  });

  const deleteSession = useMutation({
    mutationFn: (id: string) => academicsMutations.deleteSession(id),
    onSuccess: async () => {
      toast.success("Session deleted");
      setDeleteSessionId(null);
      await client.invalidateQueries({ queryKey: ["sessions"] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Could not delete session"),
  });

  const updateCourse = useMutation({
    mutationFn: () => {
      if (!editingCourse) throw new Error("Select a course first");
      return academicsMutations.updateCourse(editingCourse.id, courseName.trim());
    },
    onSuccess: async () => {
      toast.success("Course updated");
      setEditingCourse(null);
      await client.invalidateQueries({ queryKey: ["courses"] });
      await client.invalidateQueries({ queryKey: ["class-courses"] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Could not update course"),
  });

  const updateProgram = useMutation({
    mutationFn: () => {
      if (!editingProgram) throw new Error("Select a program first");
      return academicsMutations.updateProgram(editingProgram.id, {
        name: editProgramName.trim(),
        default_portal_enabled: editProgramPortal,
      });
    },
    onSuccess: async () => {
      toast.success("Program updated");
      setEditingProgram(null);
      await client.invalidateQueries({ queryKey: ["programs"] });
      await client.invalidateQueries({ queryKey: ["classes"] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Could not update program"),
  });

  const deleteProgram = useMutation({
    mutationFn: (id: string) => academicsMutations.deleteProgram(id),
    onSuccess: async () => {
      toast.success("Program deleted");
      setDeleteProgramId(null);
      await client.invalidateQueries({ queryKey: ["programs"] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Could not delete program"),
  });

  const deleteCourse = useMutation({
    mutationFn: (id: string) => academicsMutations.deleteCourse(id),
    onSuccess: async () => {
      toast.success("Course deleted");
      setDeleteCourseId(null);
      await client.invalidateQueries({ queryKey: ["courses"] });
      await client.invalidateQueries({ queryKey: ["class-courses"] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Could not delete course"),
  });

  const saveDailyReportConfig = useMutation({
    mutationFn: ({ classId, config }: { classId: string; config: { enabled: boolean; fields_definition: { key: string; label: string; type: string; required: boolean; options: string[]; enabled: boolean }[] } }) =>
      dailyReportApi.updateConfig(classId, config),
    onSuccess: async () => {
      toast.success("Daily report config saved");
      setEditingClassDr(null);
      await client.invalidateQueries({ queryKey: ["daily-report-config"] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Could not save config"),
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
              <>
                <div className="grid grid-cols-2 gap-1.5 rounded-2xl bg-muted p-1">
                  {(["rollover", "blank"] as const).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => setSessionCreateMode(mode)}
                      className={cn(
                        "rounded-xl py-2 text-xs font-bold uppercase tracking-wide",
                        sessionCreateMode === mode
                          ? "bg-card text-primary shadow-[var(--shadow-soft)]"
                          : "text-muted-foreground",
                      )}
                    >
                      {mode === "rollover" ? t("Promote students") : t("Empty session")}
                    </button>
                  ))}
                </div>
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
                {sessionCreateMode === "rollover" ? (
                  <div className="space-y-3 rounded-2xl border border-border bg-muted/35 p-3">
                    <Field label={t("Promote from")}>
                      <CustomDropdown
                        required
                        value={rolloverSourceId}
                        onChange={(event) => setRolloverSourceSessionId(event.target.value)}
                      >
                        <option value="">{t("Select session")}</option>
                        {(sessions.data ?? []).map((session) => (
                          <option key={session.id} value={session.id}>
                            {session.name}
                            {session.is_active ? " (Active)" : ""}
                          </option>
                        ))}
                      </CustomDropdown>
                    </Field>
                    <div className="space-y-2">
                      <p className="text-xs font-extrabold uppercase tracking-widest text-muted-foreground">
                        {t("Promotion map")}
                      </p>
                      {promotionClasses.map((academicClass, index) => (
                        <label
                          key={academicClass.id}
                          className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-center gap-2 rounded-xl bg-card p-2.5"
                        >
                          <span className="truncate text-sm font-bold">{academicClass.name}</span>
                          <CustomDropdown
                            value={promotionValue(academicClass.id, index)}
                            onChange={(event) =>
                              setPromotionTargets((current) => ({
                                ...current,
                                [academicClass.id]: event.target.value,
                              }))
                            }
                          >
                            <option value="__graduate__">{t("Graduate / leave unenrolled")}</option>
                            {promotionClasses.map((targetClass) => (
                              <option key={targetClass.id} value={targetClass.id}>
                                {targetClass.name}
                              </option>
                            ))}
                          </CustomDropdown>
                        </label>
                      ))}
                    </div>
                    <label className="flex items-center gap-2 text-sm font-semibold">
                      <input
                        type="checkbox"
                        checked={copyTimetable}
                        onChange={(event) => setCopyTimetable(event.target.checked)}
                      />
                      {t("Copy timetable to new session")}
                    </label>
                    <label className="flex items-center gap-2 text-sm font-semibold">
                      <input
                        type="checkbox"
                        checked={copyHolidays}
                        onChange={(event) => setCopyHolidays(event.target.checked)}
                      />
                      {t("Copy holidays to new session")}
                    </label>
                    <p className="text-xs font-semibold text-muted-foreground">
                      {t("Sections are matched by name in the target class. If no matching section exists, the first section in that class is used.")}
                    </p>
                  </div>
                ) : null}
              </>
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
            actions: canManage
              ? [
                  { label: "Edit", onClick: () => setEditingSession(item), variant: "soft" as const },
                  ...(!item.is_active
                    ? [{ label: "Activate", onClick: () => activate.mutate(item.id), variant: "soft" as const }]
                    : []),
                  ...(!item.is_active
                    ? [{ label: "Delete", onClick: () => setDeleteSessionId(item.id), variant: "danger" as const }]
                    : []),
                ]
              : undefined,
          }))}
        />
      ) : null}

      <FormSheet
        title={t("Edit session")}
        submitLabel={t("Save changes")}
        open={Boolean(editingSession)}
        onOpenChange={(open) => {
          if (!open) setEditingSession(null);
        }}
        onSubmit={() => updateSession.mutateAsync()}
      >
        <Field label={t("Name")}>
          <TextInput required value={editName} onChange={(event) => setEditName(event.target.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t("Start")}>
            <TextInput type="date" required value={editStart} onChange={(event) => setEditStart(event.target.value)} />
          </Field>
          <Field label={t("End")}>
            <TextInput type="date" required value={editEnd} onChange={(event) => setEditEnd(event.target.value)} />
          </Field>
        </div>
        {editingSession?.is_active ? (
          <p className="text-xs font-semibold text-muted-foreground">{t("The active session remains active while its details are edited.")}</p>
        ) : null}
      </FormSheet>

      <AlertDialog open={Boolean(deleteSessionId)} onOpenChange={(open) => !open && setDeleteSessionId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("Delete session?")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("Only an inactive session with no enrolled students or session records can be deleted.")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("Cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteSessionId && deleteSession.mutate(deleteSessionId)}
            >
              {t("Delete session")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <FormSheet
        title={t("Edit course")}
        submitLabel={t("Save changes")}
        open={Boolean(editingCourse)}
        onOpenChange={(open) => {
          if (!open) setEditingCourse(null);
        }}
        onSubmit={() => updateCourse.mutateAsync()}
      >
        <Field label={t("Name")}>
          <TextInput required value={courseName} onChange={(event) => setCourseName(event.target.value)} />
        </Field>
      </FormSheet>

      <AlertDialog open={Boolean(deleteCourseId)} onOpenChange={(open) => !open && setDeleteCourseId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("Delete course?")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("A course can only be deleted when it is not assigned to any class.")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("Cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteCourseId && deleteCourse.mutate(deleteCourseId)}
            >
              {t("Delete course")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <FormSheet
        title={t("Edit program")}
        submitLabel={t("Save changes")}
        open={Boolean(editingProgram)}
        onOpenChange={(open) => {
          if (!open) setEditingProgram(null);
        }}
        onSubmit={() => updateProgram.mutateAsync()}
      >
        <Field label={t("Name")}>
          <TextInput required value={editProgramName} onChange={(event) => setEditProgramName(event.target.value)} />
        </Field>
        <label className="flex items-center gap-2 rounded-xl bg-muted px-3 py-2.5 text-sm">
          <input
            type="checkbox"
            checked={editProgramPortal}
            onChange={(event) => setEditProgramPortal(event.target.checked)}
            className="h-4 w-4 shrink-0"
          />
          <span className="min-w-0">
            <span className="block font-semibold">{t("Enable student portal")}</span>
            <span className="block text-xs text-muted-foreground">
              {t("When disabled, students in this program will not have portal access. Guardians will get login access instead.")}
            </span>
          </span>
        </label>
      </FormSheet>

      <AlertDialog open={Boolean(deleteProgramId)} onOpenChange={(open) => !open && setDeleteProgramId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("Delete program?")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("A program can only be deleted when it has no classes or enrollments.")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("Cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteProgramId && deleteProgram.mutate(deleteProgramId)}
            >
              {t("Delete program")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {editingClassDr ? (
        <DailyReportConfigDialog
          classId={editingClassDr.id}
          className={editingClassDr.name}
          open={Boolean(editingClassDr)}
          onOpenChange={(open) => !open && setEditingClassDr(null)}
          onSave={(config) => saveDailyReportConfig.mutateAsync({ classId: editingClassDr.id, config })}
        />
      ) : null}

      {!loading && tab === "programs" ? (
        <div className="space-y-2">
          <TextInput
            value={programSearch}
            onChange={(event) => setProgramSearch(event.target.value)}
            placeholder={t("Search programs...")}
          />
          <Items
            empty={filteredPrograms.length === 0}
            rows={filteredPrograms.map((program) => ({
              id: program.id,
              icon: <Layers className="h-5 w-5" />,
              title: program.name,
              subtitle: "Program",
              pill: program.default_portal_enabled === false ? t("Portal disabled") : undefined,
              actions: canManage
                ? [
                    { label: t("Edit"), onClick: () => setEditingProgram({ id: program.id, name: program.name, default_portal_enabled: program.default_portal_enabled ?? true }), variant: "soft" as const },
                    { label: t("Delete"), onClick: () => setDeleteProgramId(program.id), variant: "danger" as const },
                  ]
                : undefined,
            }))}
          />
          {filteredPrograms.length === 0 ? <EmptyState title={t("Nothing here yet")} /> : null}
        </div>
      ) : null}

      {!loading && tab === "classes" ? (
        <div className="space-y-2">
          <TextInput
            value={classSearch}
            onChange={(event) => setClassSearch(event.target.value)}
            placeholder={t("Search classes...")}
          />
          <ClassList
            classes={filteredClasses}
            programs={programs.data ?? []}
            expandedClassId={expandedClassId}
            onToggle={(id) => setExpandedClassId(expandedClassId === id ? null : id)}
            sections={allClassSections.length > 0 ? allClassSections : sections.data ?? []}
            courses={classCourses}
            availableCourses={courses.data ?? []}
            sectionCounts={classSectionCounts}
            sectionName={sectionName}
            onSectionNameChange={setSectionName}
            canManage={canManage}
            createSection={(classId: string, name: string) => createSection.mutate({ classId, name })}
            createSectionPending={createSection.isPending}
            deleteSection={(classId: string, sectionId: string) => deleteSection.mutate({ classId, sectionId })}
            deleteSectionPending={deleteSection.isPending}
            assignCourse={(classId: string, courseId: string) => assignClassCourse.mutate({ classId, courseId })}
            assignCoursePending={assignClassCourse.isPending}
            unassignCourse={(classId: string, courseId: string) => unassignClassCourse.mutate({ classId, courseId })}
            unassignCoursePending={unassignClassCourse.isPending}
            onEditDailyReports={(id, name) => setEditingClassDr({ id, name })}
          />
        </div>
      ) : null}

      {!loading && tab === "courses" ? (
        <div className="space-y-2">
          <TextInput
            value={courseSearch}
            onChange={(event) => setCourseSearch(event.target.value)}
            placeholder={t("Search courses...")}
          />
          <Items
            empty={filteredCourses.length === 0}
            rows={filteredCourses.map((item) => ({
              id: item.id,
              icon: <BookOpen className="h-5 w-5" />,
              title: item.name,
              subtitle: "Course",
              actions: canManage
                ? [
                    { label: "Edit", onClick: () => setEditingCourse({ id: item.id, name: item.name }), variant: "soft" as const },
                    { label: "Delete", onClick: () => setDeleteCourseId(item.id), variant: "danger" as const },
                  ]
                : undefined,
            }))}
          />
        </div>
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
    actions?: { label: string; onClick: () => void; variant?: "soft" | "danger" }[];
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
          {row.actions ? (
            <div className="flex flex-wrap justify-end gap-1.5">
              {row.pill ? <Pill tone="success">{row.pill}</Pill> : null}
              {row.actions.map((action) => (
                <button
                  key={action.label}
                  onClick={action.onClick}
                  className={cn(
                    "rounded-xl px-2.5 py-1.5 text-[0.68rem] font-bold",
                    action.variant === "danger" ? "bg-destructive/10 text-destructive" : "bg-primary-soft text-primary",
                  )}
                >
                  {action.label}
                </button>
              ))}
            </div>
          ) : row.pill ? (
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
  courses,
  availableCourses,
  sectionCounts,
  sectionName,
  onSectionNameChange,
  canManage,
  createSection,
  createSectionPending,
  deleteSection,
  deleteSectionPending,
  assignCourse,
  assignCoursePending,
  unassignCourse,
  unassignCoursePending,
  onEditDailyReports,
}: {
  classes: AcademicClass[];
  programs: { id: string; name: string }[];
  expandedClassId: string | null;
  onToggle: (id: string) => void;
  sections: Section[];
  courses: Map<string, { id: string; name: string }[]>;
  availableCourses: { id: string; name: string }[];
  sectionCounts: Map<string, number>;
  sectionName: string;
  onSectionNameChange: (v: string) => void;
  canManage: boolean;
  createSection: (classId: string, name: string) => void;
  createSectionPending: boolean;
  deleteSection: (classId: string, sectionId: string) => void;
  deleteSectionPending: boolean;
  assignCourse: (classId: string, courseId: string) => void;
  assignCoursePending: boolean;
  unassignCourse: (classId: string, courseId: string) => void;
  unassignCoursePending: boolean;
  onEditDailyReports: (classId: string, name: string) => void;
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
        const classCourses = courses.get(cls.id) ?? [];
        const assignableCourses = availableCourses.filter(
          (course) => !classCourses.some((assigned) => assigned.id === course.id),
        );
        const sectionCount = sectionCounts.get(cls.id) ?? cls.section_count ?? classSections.length;

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
                    {program?.name ?? "Class"} · {sectionCount} {t("sections")}
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
                <div className="space-y-2 px-3 py-1.5">
                  <p className="text-xs font-semibold text-muted-foreground">{t("Courses")}</p>
                  {classCourses.length ? (
                    <div className="flex flex-wrap gap-1.5">
                      {classCourses.map((course) => (
                        <span key={course.id} className="inline-flex items-center gap-1 rounded-full bg-primary-soft px-2.5 py-1 text-xs font-medium text-primary">
                          {course.name}
                          {canManage ? (
                            <button
                              type="button"
                              aria-label={`${t("Remove")} ${course.name}`}
                              disabled={unassignCoursePending}
                              onClick={() => unassignCourse(cls.id, course.id)}
                              className="ml-0.5 text-primary/60 hover:text-destructive disabled:opacity-50"
                            >
                              ×
                            </button>
                          ) : null}
                        </span>
                      ))}
                    </div>
                  ) : <p className="text-xs text-muted-foreground">{t("No courses assigned")}</p>}
                  {canManage ? (
                    <SearchableSelect
                      value=""
                      onChange={(courseId) => { if (courseId) assignCourse(cls.id, courseId); }}
                      options={assignableCourses.map((course) => ({ value: course.id, label: course.name }))}
                      placeholder={t("Assign course...")}
                      className={assignCoursePending ? "pointer-events-none opacity-50" : undefined}
                    />
                  ) : null}
                </div>
                {canManage ? (
                  <div className="px-3 py-1.5">
                    <button
                      className="inline-flex items-center gap-1.5 rounded-xl bg-primary-soft px-2.5 py-1.5 text-xs font-bold text-primary"
                      onClick={() => onEditDailyReports(cls.id, cls.name)}
                    >
                      <ListChecks className="h-3.5 w-3.5" />
                      {t("Daily Reports")}
                    </button>
                  </div>
                ) : null}
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
