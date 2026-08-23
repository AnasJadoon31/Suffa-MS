import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { BookOpen, ChevronRight, ClipboardList, GraduationCap, Send, Users } from "lucide-react";
import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/app/AppShell";
import {
  Card,
  EmptyState,
  Field,
  CustomDropdown,
  Pill,
  SectionTitle,
  SkeletonList,
  TextInput,
} from "@/components/app/Primitives";
import { cn } from "@/lib/utils";
import { api, apiErrorMessage } from "@/lib/mms/api";
import { useAuth } from "@/lib/mms/auth";
import { academicsApi, operationsApi, peopleApi } from "@/lib/mms/endpoints";
import { academicsExtraApi, assessmentsApi, assessmentsMutations, timetableApi } from "@/lib/mms/more-endpoints";
import { useTranslation } from "react-i18next";

export const Route = createFileRoute("/examination")({
  head: () => ({
    meta: [
      { title: "Examination — Suffa MS" },
      { name: "description", content: "Grading schemes, exams, marking and results." },
    ],
  }),
  component: ExaminationPage,
});

type Tab = "schemes" | "exams" | "assign" | "marking" | "results";

export function DrillBackButton({
  onClick,
  label,
}: {
  onClick: () => void;
  label?: string;
}) {
  const { t } = useTranslation();

  return (
    <button onClick={onClick} className="rounded-xl border border-border px-3 py-2 text-xs font-bold text-primary">
      {label ?? t("Back")}
    </button>
  );
}

export function DrillHeader({
  onBack,
  children,
}: {
  onBack: () => void;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-border bg-card p-3">
      <DrillBackButton onClick={onBack} />
      {children}
    </div>
  );
}

export function DrillSearchInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <TextInput
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      className="mb-2"
    />
  );
}

function ExaminationPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const canManage = Boolean(user?.role === "principal" || user?.role === "super_admin" || user?.is_principal_delegate);
  const [tab, setTab] = useState<Tab>("schemes");

  return (
    <AppShell title={t("Examination")} subtitle={t("Grading, exams and results")}>
      <div className="mb-3 grid grid-cols-5 gap-1.5 rounded-2xl bg-muted p-1">
        {(["schemes", "exams", "assign", "marking", "results"] as Tab[]).map((key) => (
          <button key={key} onClick={() => setTab(key)} className={cn("rounded-xl py-2 text-[0.6rem] font-bold uppercase tracking-wide", tab === key ? "bg-card text-primary shadow-sm" : "text-muted-foreground")}>
            {key === "schemes" ? t("Schemes") : key === "exams" ? t("Exams") : key === "assign" ? t("Assign") : key === "marking" ? t("Marking") : t("Results")}
          </button>
        ))}
      </div>
      {tab === "schemes" ? <SchemesView canManage={canManage} /> : null}
      {tab === "exams" ? <ExamsView canManage={canManage} /> : null}
      {tab === "assign" ? <AssignView canManage={canManage} /> : null}
      {tab === "marking" ? <MarkingView canManage={canManage} /> : null}
      {tab === "results" ? <ResultsView canManage={canManage} /> : null}
    </AppShell>
  );
}

/* ================================================ Schemes ===== */

function SchemesView({ canManage }: { canManage: boolean }) {
  const { t } = useTranslation();
  const client = useQueryClient();
  const schemes = useQuery({ queryKey: ["grading-schemes"], queryFn: () => assessmentsApi.listGradingSchemes() });
  const [name, setName] = useState("");
  const [bands, setBands] = useState<{ label: string; min_score: number; max_score: number }[]>([]);
  const [bandLabel, setBandLabel] = useState("");
  const [bandMin, setBandMin] = useState("0");
  const [bandMax, setBandMax] = useState("100");

  const create = useMutation({
    mutationFn: () => assessmentsMutations.createGradingScheme({ name: name.trim(), bands }),
    onSuccess: () => { toast.success(t("Scheme created")); setName(""); setBands([]); setBandLabel(""); void client.invalidateQueries({ queryKey: ["grading-schemes"] }); },
  });

  return (
    <div className="space-y-2">
      {canManage ? (
        <Card className="space-y-2 p-3.5">
          <Field label={t("Scheme name *")}><TextInput required value={name} onChange={(e) => setName(e.target.value)} maxLength={120} /></Field>
          <div>
            <p className="mb-1 text-xs font-semibold text-muted-foreground">{t("Bands")}</p>
            {bands.map((b, i) => (<div key={i} className="mb-1 flex items-center gap-1 text-xs"><span className="font-medium">{b.label}: {b.min_score}–{b.max_score}</span><button onClick={() => setBands((p) => p.filter((_, j) => j !== i))} className="ml-auto text-destructive">×</button></div>))}
            <div className="mt-1 flex gap-1">
              <TextInput placeholder={t("Label")} value={bandLabel} onChange={(e) => setBandLabel(e.target.value)} className="flex-1" />
              <TextInput type="number" value={bandMin} onChange={(e) => setBandMin(e.target.value)} className="w-16" />
              <TextInput type="number" value={bandMax} onChange={(e) => setBandMax(e.target.value)} className="w-16" />
              <button onClick={() => { if (bandLabel) { setBands((p) => [...p, { label: bandLabel, min_score: Number(bandMin), max_score: Number(bandMax) }]); setBandLabel(""); } }} className="rounded-lg bg-primary-soft px-2 text-xs font-bold text-primary">+</button>
            </div>
          </div>
          <button onClick={() => create.mutate()} disabled={!name.trim() || bands.length === 0} className="gradient-emerald w-full rounded-xl py-2 text-xs font-bold text-primary-foreground disabled:opacity-50">{t("Save scheme")}</button>
        </Card>
      ) : null}
      {schemes.data?.map((s) => (
        <Card key={s.id} className="p-3.5">
          <p className="font-semibold">{s.name}</p>
          <div className="mt-1 flex flex-wrap gap-1">{s.bands.map((b, i) => (<span key={i} className="rounded-full bg-muted px-2 py-0.5 text-[0.6rem] font-medium">{b.label}: {b.min_score}–{b.max_score}</span>))}</div>
          {canManage ? (<button onClick={() => { assessmentsMutations.deleteGradingScheme(s.id).then(() => { toast.success(t("Deleted")); void client.invalidateQueries({ queryKey: ["grading-schemes"] }); }); }} className="mt-2 text-xs text-destructive">{t("Delete")}</button>) : null}
        </Card>
      ))}
    </div>
  );
}

/* ================================================ Exams ===== */

function ExamsView({ canManage }: { canManage: boolean }) {
  const { t } = useTranslation();
  const client = useQueryClient();
  const schemes = useQuery({ queryKey: ["grading-schemes"], queryFn: () => assessmentsApi.listGradingSchemes() });
  const examTypes = useQuery({ queryKey: ["exam-types"], queryFn: () => assessmentsApi.listExamTypes() });
  const [selectedSchemeId, setSelectedSchemeId] = useState<string | null>(null);

  const scheme = schemes.data?.find((s) => s.id === selectedSchemeId);
  const schemeExams = useMemo(() => {
    if (!selectedSchemeId) return [];
    return (examTypes.data ?? []).filter((e) => e.grading_scheme_id === selectedSchemeId);
  }, [examTypes.data, selectedSchemeId]);

  const [name, setName] = useState("");
  const [weightage, setWeightage] = useState("");
  const [units, setUnits] = useState("0");

  const totalWeightage = useMemo(() => {
    return schemeExams
      .filter((e) => !e.parent_exam_type_id)
      .reduce((sum, e) => sum + (e.children?.length ? 0 : (e.weightage || 0)), 0);
  }, [schemeExams]);

  const weightageExceeds = useMemo(() => {
    const newW = Number(weightage) || 0;
    return totalWeightage + newW > 100;
  }, [totalWeightage, weightage]);

  const create = useMutation({
    mutationFn: () => assessmentsMutations.createExamType({
      name: name.trim(), weightage: Number(weightage), course_id: undefined,
      grading_scheme_id: selectedSchemeId!, units: Number(units) || 0,
    } as any),
    onSuccess: () => { toast.success(t("Exam added")); setName(""); setWeightage(""); setUnits("0"); void client.invalidateQueries({ queryKey: ["exam-types"] }); },
  });

  return (
    <div className="space-y-3">
      {!selectedSchemeId ? (
        <>
          <SectionTitle>{t("Schemes")}</SectionTitle>
          <div className="space-y-2">
            {(schemes.data ?? []).map((s) => (
              <button key={s.id} onClick={() => setSelectedSchemeId(s.id)} className="w-full">
                <Card className="p-3.5 text-left">
                  <p className="font-semibold">{s.name}</p>
                  <div className="mt-1 flex flex-wrap gap-1">{s.bands.map((b, i) => (<span key={i} className="rounded-full bg-muted px-2 py-0.5 text-[0.6rem] font-medium">{b.label}: {b.min_score}–{b.max_score}</span>))}</div>
                </Card>
              </button>
            ))}
          </div>
        </>
      ) : (
        <>
          <DrillHeader onBack={() => setSelectedSchemeId(null)}>
            <span className="text-xs font-bold text-muted-foreground">{scheme?.name}</span>
          </DrillHeader>
          {canManage ? (
            <Card className="space-y-2 p-3.5">
              <p className="text-xs font-bold text-muted-foreground">{t("Add exam")}{totalWeightage > 0 ? ` — ${t("total")} ${totalWeightage}%` : ""}</p>
              <div className="grid grid-cols-2 gap-2">
                <Field label={t("Name *")}><TextInput required value={name} onChange={(e) => setName(e.target.value)} /></Field>
                <Field label={t("Weightage (%) *")}><TextInput type="number" required value={weightage} onChange={(e) => setWeightage(e.target.value)} /></Field>
              </div>
              <Field label={t("Units (optional)")}>
                <TextInput type="number" value={units} onChange={(e) => setUnits(e.target.value)} placeholder="0" />
              </Field>
              {Number(units) > 0 ? (
                <p className="text-xs text-muted-foreground">{t("Creates N sub-exams each with equal weightage")}</p>
              ) : null}
              {weightageExceeds ? (
                <p className="text-xs text-destructive">{t("Total weightage cannot exceed 100%")}</p>
              ) : null}
              <button onClick={() => create.mutate()} disabled={!name.trim() || !weightage.trim() || weightageExceeds} className="gradient-emerald w-full rounded-xl py-2 text-xs font-bold text-primary-foreground disabled:opacity-50">{t("Add exam")}</button>
            </Card>
          ) : null}
          <SectionTitle>{t("Exams")}</SectionTitle>
          {schemeExams.filter((e) => !e.parent_exam_type_id).map((exam) => (
            <div key={exam.id}>
              <Card className="flex items-center justify-between p-3">
                <div>
                  <p className="font-semibold">{exam.name}</p>
                  <p className="text-xs text-muted-foreground">{exam.weightage}%{exam.children?.length ? ` · ${exam.children.length} units` : ""}</p>
                </div>
                {canManage ? (<button onClick={() => { assessmentsMutations.deleteExamType(exam.id).then(() => { toast.success(t("Deleted")); void client.invalidateQueries({ queryKey: ["exam-types"] }); }); }} className="text-xs text-destructive">{t("Delete")}</button>) : null}
              </Card>
              {exam.children?.length > 0 ? (
                <div className="ml-4 mt-1 border-l-2 border-border pl-4 space-y-1">
                  {exam.children.map((child) => (
                    <Card key={child.id} className="flex items-center justify-between p-2.5">
                      <div>
                        <p className="text-sm">{child.name}</p>
                        <p className="text-xs text-muted-foreground">{child.weightage}%</p>
                      </div>
                      {canManage ? (<button onClick={() => { assessmentsMutations.deleteExamType(child.id).then(() => { toast.success(t("Deleted")); void client.invalidateQueries({ queryKey: ["exam-types"] }); }); }} className="text-xs text-destructive">{t("Delete")}</button>) : null}
                    </Card>
                  ))}
                </div>
              ) : null}
            </div>
          ))}
        </>
      )}
    </div>
  );
}

/* ================================================ Assign ===== */

function AssignView({ canManage }: { canManage: boolean }) {
  const { t } = useTranslation();
  const client = useQueryClient();
  const schemes = useQuery({ queryKey: ["grading-schemes"], queryFn: () => assessmentsApi.listGradingSchemes() });
  const classes = useQuery({ queryKey: ["classes"], queryFn: () => academicsApi.listClasses() });
  const examTypes = useQuery({ queryKey: ["exam-types"], queryFn: () => assessmentsApi.listExamTypes() });
  const [selectedSchemeId, setSelectedSchemeId] = useState<string | null>(null);
  const [assigning, setAssigning] = useState<Set<string>>(new Set());

  const scheme = schemes.data?.find((s) => s.id === selectedSchemeId);

  const assignedClassNames = useMemo(() => {
    const classMap = new Map((classes.data ?? []).map((c) => [c.id, c.name]));
    const map = new Map<string, Set<string>>();
    for (const et of examTypes.data ?? []) {
      if (et.grading_scheme_id && et.class_id) {
        if (!map.has(et.grading_scheme_id)) map.set(et.grading_scheme_id, new Set());
        map.get(et.grading_scheme_id)!.add(classMap.get(et.class_id) ?? et.class_id);
      }
    }
    return map;
  }, [examTypes.data, classes.data]);

  async function assignToClass(classId: string) {
    if (!scheme || !canManage) return;
    setAssigning((p) => new Set(p).add(classId));
    try {
      const classCourses = await timetableApi.listClassCourses(classId);
      const oldExams = (examTypes.data ?? []).filter((e) => e.grading_scheme_id === scheme.id && e.class_id === classId);
      for (const e of oldExams) {
        try { await assessmentsMutations.deleteExamType(e.id); } catch {}
      }
      for (const course of classCourses) {
        const schemeExams = (examTypes.data ?? []).filter((e) => e.grading_scheme_id === scheme.id && !e.class_id && !e.course_id && !e.parent_exam_type_id);
        for (const exam of schemeExams) {
          const created = await assessmentsMutations.createExamType({
            name: exam.name, weightage: exam.weightage,
            course_id: course.id, class_id: classId,
            grading_scheme_id: scheme.id,
          });
          const children = (examTypes.data ?? []).filter((e) => e.parent_exam_type_id === exam.id);
          for (const child of children) {
            await assessmentsMutations.createExamType({
              name: child.name, weightage: child.weightage,
              course_id: course.id, class_id: classId,
              grading_scheme_id: scheme.id,
              parent_exam_type_id: created.id,
            });
          }
        }
      }
      toast.success(t("Scheme assigned"));
      void client.invalidateQueries({ queryKey: ["exam-types"] });
    } catch { toast.error(t("Assignment failed")); }
    finally { setAssigning((p) => { const next = new Set(p); next.delete(classId); return next; }); }
  }

  return (
    <div className="space-y-3">
      {!selectedSchemeId ? (
        <>
          <SectionTitle>{t("Schemes")}</SectionTitle>
          <div className="space-y-2">
            {schemes.data?.map((s) => {
              const classes = assignedClassNames.get(s.id);
              return (
                <button key={s.id} onClick={() => setSelectedSchemeId(s.id)} className="w-full">
                  <Card className="p-3.5 text-left">
                    <p className="font-semibold">{s.name}</p>
                    <div className="mt-1 flex flex-wrap gap-1">{s.bands.map((b, i) => (<span key={i} className="rounded-full bg-muted px-2 py-0.5 text-[0.6rem] font-medium">{b.label}: {b.min_score}–{b.max_score}</span>))}</div>
                    {classes && classes.size > 0 ? (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {Array.from(classes).map((c) => (
                          <span key={c} className="rounded-full bg-primary-soft px-2 py-0.5 text-[0.6rem] font-medium text-primary">{c}</span>
                        ))}
                      </div>
                    ) : (
                      <p className="mt-1 text-xs text-muted-foreground">{t("No classes assigned")}</p>
                    )}
                  </Card>
                </button>
              );
            })}
          </div>
        </>
      ) : (
        <>
          <DrillHeader onBack={() => setSelectedSchemeId(null)}>
            <span className="text-xs font-bold text-muted-foreground">{scheme?.name}</span>
          </DrillHeader>
          <SectionTitle>{t("Classes")}</SectionTitle>
          <div className="space-y-2">
            {(classes.data ?? []).map((cls) => {
              const busy = assigning.has(cls.id);
              return (
                <Card key={cls.id} className="flex items-center justify-between p-3.5">
                  <div>
                    <p className="font-semibold">{cls.name}</p>
                  </div>
                  <button
                    disabled={busy}
                    onClick={() => assignToClass(cls.id)}
                    className="rounded-xl bg-primary-soft px-3 py-1.5 text-xs font-bold text-primary disabled:opacity-50"
                  >{busy ? "…" : t("Assign")}</button>
                </Card>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

/* ================================================ Marking ===== */

export function MarkingView({
  canManage,
  teacherScoped = false,
}: {
  canManage: boolean;
  teacherScoped?: boolean;
}) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const isAdmin = !teacherScoped && (
    user?.role === "principal" || user?.role === "super_admin" || user?.is_principal_delegate
  );
  const [selectedClassId, setSelectedClassId] = useState("");
  const [selectedSectionId, setSelectedSectionId] = useState("");
  const [selectedCourseId, setSelectedCourseId] = useState("");
  const [selectedExamId, setSelectedExamId] = useState("");
  const [step, setStep] = useState<"sections" | "courses" | "exams" | "subExams" | "students">("sections");
  const [classSearch, setClassSearch] = useState("");
  const [courseSearch, setCourseSearch] = useState("");
  const [examSearch, setExamSearch] = useState("");

  const classes = useQuery({ queryKey: ["classes"], queryFn: () => academicsApi.listClasses(), enabled: !teacherScoped });
  const sections = useQuery({ queryKey: ["sections", selectedClassId], queryFn: () => selectedClassId ? academicsExtraApi.listSections(selectedClassId) : Promise.resolve([]), enabled: !!selectedClassId });
  const myTimetable = useQuery({ queryKey: ["my-timetable"], queryFn: () => operationsApi.listMyTimetable(), enabled: teacherScoped || !isAdmin });
  const classCourses = useQuery({ queryKey: ["class-courses", selectedClassId], queryFn: () => selectedClassId ? api.get(`/api/v1/academics/classes/${selectedClassId}/courses`).then((r) => r.data) : Promise.resolve([]), enabled: !!selectedClassId && (step === "courses" || step === "exams" || step === "subExams") });
  const allExamTypes = useQuery({ queryKey: ["exam-types"], queryFn: () => assessmentsApi.listExamTypes() });
  const teacherClassOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const slot of myTimetable.data ?? []) {
      if (slot.class_id) map.set(slot.class_id, slot.class_name ?? "—");
    }
    return Array.from(map, ([id, name]) => ({ id, name }));
  }, [myTimetable.data]);
  const classOptions = teacherScoped ? teacherClassOptions : classes.data ?? [];
  const searchedClassOptions = useMemo(() => {
    const term = classSearch.trim().toLowerCase();
    if (!term) return classOptions;
    return classOptions.filter((item) => item.name.toLowerCase().includes(term));
  }, [classOptions, classSearch]);
  const selectedClassName = classOptions.find((item) => item.id === selectedClassId)?.name;
  const selectMarkingClass = (id: string) => {
    setSelectedClassId((current) => current === id && step === "sections" ? "" : id);
    setSelectedSectionId("");
    setSelectedCourseId("");
    setSelectedExamId("");
    setStep("sections");
  };
  const courseExams = useMemo(() => {
    if (!selectedCourseId || !selectedClassId) return [];
    return (allExamTypes.data ?? []).filter((e) =>
      e.course_id === selectedCourseId &&
      (!e.class_id || e.class_id === selectedClassId),
    );
  }, [allExamTypes.data, selectedCourseId, selectedClassId]);

  const parentExams = useMemo(() => {
    return courseExams.filter((e) => !e.parent_exam_type_id);
  }, [courseExams]);

  function getChildren(parentId: string) {
    return courseExams.filter((e) => e.parent_exam_type_id === parentId);
  }

  const teacherSectionIds = useMemo(() => {
    if (isAdmin) return null;
    return new Set((myTimetable.data ?? []).map((s) => s.section_id ?? "").filter(Boolean));
  }, [isAdmin, myTimetable.data]);

  const filteredSections = useMemo(() => {
    if (isAdmin || !teacherSectionIds) return sections.data ?? [];
    return (sections.data ?? []).filter((s) => teacherSectionIds.has(s.id));
  }, [sections.data, teacherSectionIds, isAdmin]);
  const courseOptions = useMemo(() => {
    if (!teacherScoped) return (classCourses.data ?? []) as any[];
    const map = new Map<string, { id: string; name: string }>();
    for (const slot of myTimetable.data ?? []) {
      if (
        slot.class_id === selectedClassId &&
        (!selectedSectionId || slot.section_id === selectedSectionId) &&
        slot.course_id
      ) {
        map.set(slot.course_id, { id: slot.course_id, name: slot.course_name ?? "—" });
      }
    }
    return Array.from(map.values());
  }, [classCourses.data, myTimetable.data, selectedClassId, selectedSectionId, teacherScoped]);
  const searchedCourseOptions = useMemo(() => {
    const term = courseSearch.trim().toLowerCase();
    if (!term) return courseOptions;
    return courseOptions.filter((course: any) => String(course.name ?? "").toLowerCase().includes(term));
  }, [courseOptions, courseSearch]);
  const searchedParentExams = useMemo(() => {
    const term = examSearch.trim().toLowerCase();
    if (!term) return parentExams;
    return parentExams.filter((exam) => exam.name.toLowerCase().includes(term));
  }, [examSearch, parentExams]);

  return (
    <div className="space-y-3">
      {step === "sections" ? (
        <>
          <SectionTitle>{t("Class")}</SectionTitle>
          {classOptions.length > 4 ? (
            <DrillSearchInput value={classSearch} onChange={setClassSearch} placeholder={t("Search classes...")} />
          ) : null}
          <div className="space-y-2">
            {searchedClassOptions.map((item) => (
              <Card key={item.id} className="space-y-2 p-3.5">
                <button onClick={() => selectMarkingClass(item.id)} className="grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary">
                    <GraduationCap className="h-5 w-5" />
                  </span>
                  <div className="min-w-0 text-left">
                    <p className="truncate font-semibold">{item.name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {selectedClassId === item.id ? t("Select section") : t("View sections")}
                    </p>
                  </div>
                  <ChevronRight className={cn("h-4 w-4 text-muted-foreground transition-transform", selectedClassId === item.id ? "rotate-90" : "")} />
                </button>
                {selectedClassId === item.id ? (
                  <div className="space-y-2 border-t border-border pt-2">
                    {filteredSections.map((sec) => (
                      <button key={sec.id} onClick={() => { setSelectedSectionId(sec.id); setStep("courses"); }} className="w-full">
                        <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-xl bg-muted px-3 py-2.5">
                          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-primary-soft text-primary"><Users className="h-4 w-4" /></span>
                          <div className="min-w-0 text-left"><p className="truncate text-sm font-semibold">{sec.name}</p><p className="truncate text-xs text-muted-foreground">{sec.student_count} {t("students")}</p></div>
                          <ChevronRight className="h-4 w-4 text-muted-foreground" />
                        </div>
                      </button>
                    ))}
                    {filteredSections.length === 0 ? <EmptyState title={t("No sections found")} /> : null}
                  </div>
                ) : null}
              </Card>
            ))}
            {(teacherScoped ? myTimetable.isLoading : classes.isLoading) ? <SkeletonList rows={3} /> : null}
            {!(teacherScoped ? myTimetable.isLoading : classes.isLoading) && searchedClassOptions.length === 0 ? <EmptyState title={t("No classes found")} /> : null}
          </div>
        </>
      ) : null}

      {step === "courses" && selectedSectionId ? (
        <>
          <DrillHeader onBack={() => { setStep("sections"); setSelectedCourseId(""); }}>
            <span className="text-xs font-bold uppercase text-muted-foreground">{t("Class")}</span>
            <Pill tone="gold">{selectedClassName ?? t("Selected")}</Pill>
            <span className="text-xs text-muted-foreground">{filteredSections.find((s) => s.id === selectedSectionId)?.name}</span>
          </DrillHeader>
          <SectionTitle>{t("Courses")}</SectionTitle>
          {courseOptions.length > 4 ? (
            <DrillSearchInput value={courseSearch} onChange={setCourseSearch} placeholder={t("Search courses...")} />
          ) : null}
          <div className="space-y-2">
            {searchedCourseOptions.map((course: any) => (
              <button key={course.id} onClick={() => { setSelectedCourseId(course.id); setStep("exams"); }} className="w-full">
                <Card className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 p-3.5">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary"><GraduationCap className="h-5 w-5" /></span>
                  <div className="min-w-0 text-left"><p className="truncate font-semibold">{course.name}</p></div>
                </Card>
              </button>
            ))}
            {searchedCourseOptions.length === 0 ? <EmptyState title={t("No courses assigned")} /> : null}
          </div>
        </>
      ) : null}

      {step === "exams" && selectedCourseId && selectedSectionId ? (
        <>
          <DrillHeader onBack={() => { setStep("courses"); setSelectedExamId(""); }} />
          <SectionTitle>{t("Exams")}</SectionTitle>
          {parentExams.length > 4 ? (
            <DrillSearchInput value={examSearch} onChange={setExamSearch} placeholder={t("Search exams...")} />
          ) : null}
          <div className="space-y-2">
            {searchedParentExams.map((exam) => {
              const children = getChildren(exam.id);
              return (
                <button
                  key={exam.id}
                  onClick={() => {
                    if (children.length > 0) { setSelectedExamId(exam.id); setStep("subExams"); }
                    else { setSelectedExamId(exam.id); setStep("students"); }
                  }}
                  className="w-full"
                >
                  <Card className="p-3.5 text-left">
                    <p className="font-semibold">{exam.name}</p>
                    <p className="text-xs text-muted-foreground">{exam.weightage}%{children.length > 0 ? ` · ${children.length} units @ ${(exam.weightage / children.length).toFixed(1)}%` : ""}</p>
                  </Card>
                </button>
              );
            })}
            {searchedParentExams.length === 0 ? <EmptyState title={t("No exams assigned")} /> : null}
          </div>
        </>
      ) : null}

      {step === "subExams" && selectedExamId ? (
        <>
          <DrillHeader onBack={() => { setStep("exams"); setSelectedExamId(""); }}>
            <span className="text-xs font-bold text-muted-foreground">{parentExams.find((e) => e.id === selectedExamId)?.name}</span>
          </DrillHeader>
          <SectionTitle>{t("Units")}</SectionTitle>
          <div className="grid grid-cols-2 gap-2">
            {getChildren(selectedExamId).map((child) => (
              <button key={child.id} onClick={() => { setSelectedExamId(child.id); setStep("students"); }} className="w-full">
                <Card className="p-3 text-center">
                  <p className="text-lg font-bold">{child.name.split(" ").pop()}</p>
                  <p className="text-xs text-muted-foreground">{child.weightage}%</p>
                </Card>
              </button>
            ))}
          </div>
        </>
      ) : null}

      {step === "students" && selectedExamId && selectedSectionId && selectedClassId ? (
        <ExamMarkEntry examId={selectedExamId} classId={selectedClassId} sectionId={selectedSectionId} onBack={() => { setStep(getChildren(selectedExamId).length > 0 || parentExams.some((e) => e.id === selectedExamId && getChildren(e.id).length > 0) ? "exams" : "exams"); }} />
      ) : null}
    </div>
  );
}

function ExamMarkEntry({ examId, classId, sectionId, onBack }: { examId: string; classId: string; sectionId: string; onBack: () => void }) {
  const { t } = useTranslation();
  const client = useQueryClient();
  const [scores, setScores] = useState<Record<string, string>>({});
  const [studentSearch, setStudentSearch] = useState("");

  const examTypes = useQuery({ queryKey: ["exam-types"], queryFn: () => assessmentsApi.listExamTypes() });
  const exam = useMemo(() => (examTypes.data ?? []).find((e) => e.id === examId), [examTypes.data, examId]);

  const marks = useQuery({ queryKey: ["marks", examId, classId, sectionId], queryFn: () => assessmentsApi.listMarks({ exam_type_id: examId, class_id: classId, section_id: sectionId }), enabled: true });
  const roster = useQuery({ queryKey: ["roster", classId, sectionId], queryFn: () => peopleApi.listStudentsPage({ limit: 100, offset: 0, section_id: sectionId }), enabled: true });
  const rosterStudents = useMemo(() => {
    const students = roster.data?.items ?? [];
    const term = studentSearch.trim().toLowerCase();
    if (!term) return students;
    return students.filter((student) => `${student.name} ${student.admission_number ?? ""}`.toLowerCase().includes(term));
  }, [roster.data?.items, studentSearch]);

  const enterMark = useMutation({
    mutationFn: (p: { exam_type_id: string; student_id: string; score: number }) => assessmentsMutations.enterMark(p),
    onSuccess: () => { toast.success(t("Saved")); client.invalidateQueries({ queryKey: ["marks"] }); },
  });

  return (
    <div className="space-y-3">
      <DrillHeader onBack={onBack}>
        <span className="text-xs font-bold text-muted-foreground">{exam?.name} ({exam?.weightage}%)</span>
      </DrillHeader>
      {(roster.data?.items?.length ?? 0) > 8 ? (
        <DrillSearchInput value={studentSearch} onChange={setStudentSearch} placeholder={t("Search students...")} />
      ) : null}
      {rosterStudents.map((student) => {
        const existing = (marks.data ?? []).find((m) => m.student_id === student.id);
        const scoreKey = `${examId}_${student.id}`;
        const score = scores[scoreKey] ?? String(existing?.score ?? "");
        return (
          <Card key={student.id} className="flex items-center gap-2 p-2.5">
            <span className="flex-1 truncate text-xs font-medium">{student.name}</span>
            <TextInput type="number" value={score} onChange={(e) => setScores((p) => ({ ...p, [scoreKey]: e.target.value }))} className="w-16 text-xs" />
            <button onClick={() => enterMark.mutate({ exam_type_id: examId, student_id: student.id, score: Number(score) })} className="gradient-emerald rounded-lg px-2 py-1 text-[0.6rem] font-bold text-primary-foreground">{t("Save")}</button>
          </Card>
        );
      })}
      {!roster.isLoading && rosterStudents.length === 0 ? <EmptyState title={t("No students found")} /> : null}
    </div>
  );
}

/* ================================================ Results ===== */

export function ResultsView({
  canManage,
  teacherScoped = false,
}: {
  canManage: boolean;
  teacherScoped?: boolean;
}) {
  const { t } = useTranslation();
  const client = useQueryClient();
  type ResultStep = "classes" | "sections" | "courses" | "marks";
  type ClassCard = { id: string; name: string; sectionCount?: number; courseCount?: number };
  type SectionCard = { id: string; name: string; class_id: string; class_name: string; courseCount?: number; studentCount?: number };
  type CourseCard = { course_id: string; course_name: string; teacher_name: string | null; exam_types: { id: string; name: string; weightage: number }[] };
  const [step, setStep] = useState<ResultStep>("classes");
  const [classId, setClassId] = useState("");
  const [sectionId, setSectionId] = useState("");
  const [courseId, setCourseId] = useState("");
  const [classSearch, setClassSearch] = useState("");
  const [courseSearch, setCourseSearch] = useState("");
  const [markSearch, setMarkSearch] = useState("");
  const classes = useQuery({ queryKey: ["classes"], queryFn: () => academicsApi.listClasses(), enabled: !teacherScoped });
  const myTimetable = useQuery({ queryKey: ["my-timetable"], queryFn: () => operationsApi.listMyTimetable(), enabled: teacherScoped });
  const sections = useQuery({ queryKey: ["sections", classId], queryFn: () => classId ? academicsExtraApi.listSections(classId) : Promise.resolve([]), enabled: !!classId });
  const classMatrix = useQuery({ queryKey: ["results-matrix", "class", classId], queryFn: () => assessmentsApi.resultsMatrix({ class_id: classId }), enabled: canManage && !teacherScoped && !!classId });
  const sectionMatrix = useQuery({ queryKey: ["results-matrix", "section", classId, sectionId], queryFn: () => assessmentsApi.resultsMatrix({ class_id: classId || undefined, section_id: sectionId }), enabled: !!classId && !!sectionId });
  const teacherSections = useMemo(() => {
    const map = new Map<string, SectionCard & { courseIds: Set<string> }>();
    for (const slot of myTimetable.data ?? []) {
      if (!slot.class_id || !slot.section_id) continue;
      const key = `${slot.class_id}:${slot.section_id}`;
      const existing = map.get(key);
      if (existing) {
        existing.courseIds.add(slot.course_id);
      } else {
        map.set(key, {
          id: slot.section_id,
          name: slot.section_name ?? t("Section"),
          class_id: slot.class_id,
          class_name: slot.class_name ?? t("Class"),
          courseIds: new Set([slot.course_id]),
        });
      }
    }
    return Array.from(map.values()).map(({ courseIds, ...item }) => ({
      ...item,
      courseCount: courseIds.size,
    }));
  }, [myTimetable.data, t]);
  const classCards = useMemo<ClassCard[]>(() => {
    if (teacherScoped) {
      const map = new Map<string, { id: string; name: string; sectionIds: Set<string>; courseIds: Set<string> }>();
      for (const section of teacherSections) {
        const existing = map.get(section.class_id);
        if (existing) {
          existing.sectionIds.add(section.id);
          continue;
        }
        map.set(section.class_id, {
          id: section.class_id,
          name: section.class_name,
          sectionIds: new Set([section.id]),
          courseIds: new Set(),
        });
      }
      for (const slot of myTimetable.data ?? []) {
        if (!slot.class_id || !slot.course_id) continue;
        map.get(slot.class_id)?.courseIds.add(slot.course_id);
      }
      return Array.from(map.values()).map((item) => ({
        id: item.id,
        name: item.name,
        sectionCount: item.sectionIds.size,
        courseCount: item.courseIds.size,
      }));
    }
    return (classes.data ?? []).map((item) => ({ id: item.id, name: item.name }));
  }, [classes.data, myTimetable.data, teacherScoped, teacherSections]);
  const searchedClassCards = useMemo(() => {
    const term = classSearch.trim().toLowerCase();
    if (!term) return classCards;
    return classCards.filter((item) => item.name.toLowerCase().includes(term));
  }, [classCards, classSearch]);
  const sectionCards = useMemo<SectionCard[]>(() => {
    if (teacherScoped) return teacherSections.filter((section) => !classId || section.class_id === classId);
    const selectedClass = classCards.find((item) => item.id === classId);
    return (sections.data ?? []).map((item) => ({
      id: item.id,
      name: item.name,
      class_id: classId,
      class_name: selectedClass?.name ?? t("Class"),
    }));
  }, [classCards, classId, sections.data, t, teacherScoped, teacherSections]);
  const selectedSection = useMemo(() => {
    return sectionCards.find((item) => item.id === sectionId);
  }, [sectionCards, sectionId]);
  const activeSectionMatrix = useMemo(() => {
    return sectionMatrix.data?.sections.find((section) => section.section_id === sectionId) ?? sectionMatrix.data?.sections[0];
  }, [sectionId, sectionMatrix.data]);
  const courseCards = useMemo<CourseCard[]>(() => {
    const courses = activeSectionMatrix?.courses ?? [];
    if (!teacherScoped) return courses;
    const allowed = new Set(
      (myTimetable.data ?? [])
        .filter((slot) => slot.class_id === classId && slot.section_id === sectionId)
        .map((slot) => slot.course_id),
    );
    return courses.filter((course) => allowed.has(course.course_id));
  }, [activeSectionMatrix?.courses, classId, myTimetable.data, sectionId, teacherScoped]);
  const searchedCourseCards = useMemo(() => {
    const term = courseSearch.trim().toLowerCase();
    if (!term) return courseCards;
    return courseCards.filter((course) => `${course.course_name} ${course.teacher_name ?? ""}`.toLowerCase().includes(term));
  }, [courseCards, courseSearch]);
  const selectedCourse = useMemo(() => {
    return courseCards.find((course) => course.course_id === courseId);
  }, [courseCards, courseId]);
  const markRows = useMemo(() => {
    if (!activeSectionMatrix || !selectedCourse) return [];
    const rows = activeSectionMatrix.students.map((student) => ({
      ...student,
      course: student.courses.find((course) => course.course_id === selectedCourse.course_id),
    }));
    const term = markSearch.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter((student) => `${student.name} ${student.admission_number ?? ""}`.toLowerCase().includes(term));
  }, [activeSectionMatrix, markSearch, selectedCourse]);
  const classMissingMarkCount = useMemo(() => {
    let count = 0;
    for (const section of classMatrix.data?.sections ?? []) {
      for (const course of section.courses) {
        if (course.exam_types.length === 0) {
          count += 1;
          continue;
        }
        for (const student of section.students) {
          const cell = student.courses.find((item) => item.course_id === course.course_id);
          for (const examType of course.exam_types) {
            const mark = cell?.marks.find((item) => item.exam_type_id === examType.id);
            if (mark?.score == null) count += 1;
          }
        }
      }
    }
    return count;
  }, [classMatrix.data]);
  const canPublishClassResults = Boolean(
    canManage &&
    !teacherScoped &&
    classId &&
    classMatrix.data &&
    classMissingMarkCount === 0,
  );

  const goToClasses = () => {
    setStep(teacherScoped ? "sections" : "classes");
    setClassId("");
    setSectionId("");
    setCourseId("");
  };
  const selectClass = (id: string) => {
    setClassId((current) => current === id && step === "classes" ? "" : id);
    setSectionId("");
    setCourseId("");
    setStep("classes");
  };
  const selectSection = (section: SectionCard) => {
    setClassId(section.class_id);
    setSectionId(section.id);
    setCourseId("");
    setStep("courses");
  };
  const selectCourse = (id: string) => {
    setCourseId(id);
    setStep("marks");
  };

  const publish = useMutation({
    mutationFn: async () => {
      const allStudentIds = new Set<string>();
      for (const sec of (classMatrix.data?.sections ?? [])) {
        for (const student of sec.students) allStudentIds.add(student.student_id);
      }
      if (!classMatrix.data?.session_id) throw new Error("No active session selected");
      if (allStudentIds.size === 0) throw new Error("No students found for this class");
      return assessmentsMutations.publishResults(classMatrix.data.session_id, Array.from(allStudentIds));
    },
    onSuccess: () => { toast.success(t("Results published")); void client.invalidateQueries({ queryKey: ["results-matrix"] }); },
    onError: (error) => toast.error(apiErrorMessage(error, t("Could not publish results"))),
  });

  const submitReview = useMutation({
    mutationFn: async () => {
      if (!sectionMatrix.data?.session_id || !classId || !sectionId || !courseId) throw new Error("Select a course first");
      return assessmentsMutations.submitResultsForReview({
        session_id: sectionMatrix.data.session_id,
        class_id: classId,
        section_id: sectionId,
        course_id: courseId,
      });
    },
    onSuccess: () => toast.success(t("Result submitted to Principal")),
  });

  const headerTitle = teacherScoped
    ? t("My Results")
    : step === "classes"
      ? t("Classes")
      : step === "sections"
        ? classCards.find((item) => item.id === classId)?.name ?? t("Sections")
        : step === "courses"
          ? `${selectedSection?.class_name ?? ""} · ${selectedSection?.name ?? ""}`
          : selectedCourse?.course_name ?? t("Marks");

  const backFromResultsStep = () => {
    if (step === "marks") {
      setStep("courses");
      setCourseId("");
      return;
    }
    if (step === "courses") {
      setStep("classes");
      setSectionId("");
      setCourseId("");
      return;
    }
    goToClasses();
  };
  const renderDrillCard = (
    key: string,
    icon: ReactNode,
    title: string,
    meta: string,
    onClick: () => void,
  ) => (
    <button key={key} onClick={onClick} className="w-full rounded-2xl border border-border bg-card p-3.5 text-left shadow-sm transition active:scale-[0.99]">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">{icon}</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-bold text-foreground">{title}</span>
          <span className="mt-0.5 block text-xs font-medium text-muted-foreground">{meta}</span>
        </span>
        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
      </div>
    </button>
  );

  return (
    <div className="space-y-3">
      {step !== "classes" ? (
        <DrillHeader onBack={backFromResultsStep}>
          <div className="min-w-0">
            <SectionTitle>{headerTitle}</SectionTitle>
          </div>
        </DrillHeader>
      ) : (
        <div className="min-w-0">
          <SectionTitle>{headerTitle}</SectionTitle>
          {!teacherScoped ? (
            <p className="text-[0.65rem] font-medium text-muted-foreground">
              {t("Select class, section, then course")}
            </p>
          ) : null}
        </div>
      )}

      {step === "classes" ? (
        <div className="space-y-2">
          {classCards.length > 4 ? (
            <DrillSearchInput value={classSearch} onChange={setClassSearch} placeholder={t("Search classes...")} />
          ) : null}
          <div className="grid gap-2 sm:grid-cols-2">
            {searchedClassCards.map((item) => (
              <Card key={item.id} className="space-y-2 p-3.5">
                <button onClick={() => selectClass(item.id)} className="grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <GraduationCap className="h-5 w-5" />
                  </span>
                  <span className="min-w-0 text-left">
                    <span className="block truncate text-sm font-bold text-foreground">{item.name}</span>
                    <span className="mt-0.5 block text-xs font-medium text-muted-foreground">{t("View sections")}</span>
                  </span>
                  <ChevronRight className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", classId === item.id ? "rotate-90" : "")} />
                </button>
                {classId === item.id ? (
                  <div className="space-y-2 border-t border-border pt-2">
                    {!teacherScoped && canManage ? (
                      <div className="space-y-1">
                        {publishedCount === totalStudentCount && totalStudentCount > 0 ? (
                          <p className="rounded-xl bg-success-soft px-3 py-2 text-xs font-semibold text-success text-center">
                            {t("Results published")}
                          </p>
                        ) : (
                          <>
                            <button disabled={publish.isPending || classMatrix.isLoading || !canPublishClassResults} onClick={() => publish.mutate()} className="gradient-emerald w-full rounded-xl py-2 text-xs font-bold text-primary-foreground disabled:opacity-60">
                              {publishedCount > 0 ? t("Publish remaining results") : t("Publish class results")}
                            </button>
                            {!classMatrix.isLoading && classMissingMarkCount > 0 ? (
                              <p className="rounded-xl bg-destructive/10 px-3 py-2 text-xs font-semibold text-destructive">
                                {t("Complete all course marks before publishing")} ({classMissingMarkCount})
                              </p>
                            ) : null}
                          </>
                        )}
                      </div>
                    ) : null}
                    {sectionCards.map((section) => (
                      <button key={section.id} onClick={() => selectSection(section)} className="w-full rounded-xl bg-muted px-3 py-2.5 text-left">
                        <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3">
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary"><Users className="h-4 w-4" /></span>
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-semibold">{section.name}</span>
                            <span className="block truncate text-xs text-muted-foreground">{teacherScoped ? t("View taught courses") : t("View courses")}</span>
                          </span>
                          <ChevronRight className="h-4 w-4 text-muted-foreground" />
                        </div>
                      </button>
                    ))}
                    {((teacherScoped && !myTimetable.isLoading) || (!teacherScoped && !sections.isLoading)) && sectionCards.length === 0 ? <EmptyState title={t("No sections found")} /> : null}
                    {(teacherScoped ? myTimetable.isLoading : sections.isLoading) ? <SkeletonList rows={2} /> : null}
                  </div>
                ) : null}
              </Card>
            ))}
            {!classes.isLoading && !myTimetable.isLoading && searchedClassCards.length === 0 ? <EmptyState title={t("No classes found")} /> : null}
            {(!teacherScoped && classes.isLoading) || (teacherScoped && myTimetable.isLoading) ? <SkeletonList rows={3} /> : null}
          </div>
        </div>
      ) : null}

      {step === "courses" ? (
        <>
          {courseCards.length > 4 ? (
            <DrillSearchInput value={courseSearch} onChange={setCourseSearch} placeholder={t("Search courses...")} />
          ) : null}
          <div className="grid gap-2 sm:grid-cols-2">
            {searchedCourseCards.map((course) => renderDrillCard(
              course.course_id,
              <BookOpen className="h-5 w-5" />,
              course.course_name,
              `${course.exam_types.length} ${t("components")}${course.teacher_name ? ` · ${course.teacher_name}` : ""}`,
              () => selectCourse(course.course_id),
            ))}
            {!sectionMatrix.isLoading && searchedCourseCards.length === 0 ? <EmptyState title={t("No courses found")} /> : null}
            {sectionMatrix.isLoading ? <SkeletonList rows={3} /> : null}
          </div>
        </>
      ) : null}

      {step === "marks" && selectedCourse ? (
        <div className="space-y-2">
          {teacherScoped ? (
            <button disabled={submitReview.isPending} onClick={() => submitReview.mutate()} className="gradient-emerald flex w-full items-center justify-center gap-2 rounded-xl py-2 text-xs font-bold text-primary-foreground disabled:opacity-60">
              <Send className="h-4 w-4" /> {t("Submit result to Principal")}
            </button>
          ) : null}
          {(activeSectionMatrix?.students.length ?? 0) > 8 ? (
            <DrillSearchInput value={markSearch} onChange={setMarkSearch} placeholder={t("Search students...")} />
          ) : null}
          {markRows.map((student) => (
            <Card key={student.student_id} className="space-y-2 p-3.5">
              <div className="flex items-start gap-2">
                <ClipboardList className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold">{student.name}</p>
                  <p className="text-[0.65rem] font-medium text-muted-foreground">{student.admission_number}</p>
                </div>
                <Pill tone="gold">{student.course?.raw_score?.toFixed(1) ?? "—"} {student.course?.band ?? ""}</Pill>
              </div>
              <div className="grid gap-1.5 sm:grid-cols-2">
                {selectedCourse.exam_types.map((exam) => {
                  const mark = student.course?.marks.find((item) => item.exam_type_id === exam.id);
                  return (
                    <div key={exam.id} className="flex items-center justify-between rounded-xl bg-muted px-2.5 py-2 text-xs">
                      <span className="truncate pr-2 font-semibold">{exam.name}</span>
                      <span className="shrink-0 font-bold">{mark?.score?.toFixed(1) ?? "—"}</span>
                    </div>
                  );
                })}
              </div>
            </Card>
          ))}
          {!sectionMatrix.isLoading && markRows.length === 0 ? <EmptyState title={t("No marks found")} /> : null}
        </div>
      ) : null}
    </div>
  );
}
