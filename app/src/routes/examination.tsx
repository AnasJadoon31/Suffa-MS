import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { GraduationCap, Users } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/app/AppShell";
import { FilterBar } from "@/components/app/FilterBar";
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
import { api } from "@/lib/mms/api";
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

function ExaminationPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const canManage = user?.role === "principal" || user?.role === "super_admin" || user?.is_principal_delegate;
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
          <div className="flex items-center gap-2">
            <button onClick={() => setSelectedSchemeId(null)} className="text-xs text-primary">{t("← Back")}</button>
            <span className="text-xs font-bold text-muted-foreground">{scheme?.name}</span>
          </div>
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
          <div className="flex items-center gap-2">
            <button onClick={() => setSelectedSchemeId(null)} className="text-xs text-primary">{t("← Back")}</button>
            <span className="text-xs font-bold text-muted-foreground">{scheme?.name}</span>
          </div>
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

  return (
    <div className="space-y-3">
      <FilterBar activeCount={selectedClassId ? 1 : 0} onClear={() => { setSelectedClassId(""); setSelectedSectionId(""); setSelectedCourseId(""); setSelectedExamId(""); setStep("sections"); }}>
        <Field label={t("Class")}>
          <CustomDropdown value={selectedClassId} onChange={(e) => { setSelectedClassId(e.target.value); setSelectedSectionId(""); setSelectedCourseId(""); setStep("sections"); }}>
            <option value="">{t("Select class")}</option>
            {(teacherScoped ? teacherClassOptions : classes.data ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </CustomDropdown>
        </Field>
      </FilterBar>

      {step === "sections" && selectedClassId ? (
        <>
          <SectionTitle>{t("Sections")}</SectionTitle>
          <div className="space-y-2">
            {filteredSections.map((sec) => (
              <button key={sec.id} onClick={() => { setSelectedSectionId(sec.id); setStep("courses"); }} className="w-full">
                <Card className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 p-3.5">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary"><Users className="h-5 w-5" /></span>
                  <div className="min-w-0 text-left"><p className="truncate font-semibold">{sec.name}</p><p className="truncate text-xs text-muted-foreground">{sec.student_count} {t("students")}</p></div>
                </Card>
              </button>
            ))}
            {filteredSections.length === 0 ? <EmptyState title={t("No sections found")} /> : null}
          </div>
        </>
      ) : null}

      {step === "courses" && selectedSectionId ? (
        <>
          <div className="flex items-center gap-2">
            <button onClick={() => { setStep("sections"); setSelectedCourseId(""); }} className="text-xs text-primary">{t("← Back to sections")}</button>
            <span className="text-xs text-muted-foreground">{filteredSections.find((s) => s.id === selectedSectionId)?.name}</span>
          </div>
          <SectionTitle>{t("Courses")}</SectionTitle>
          <div className="space-y-2">
            {courseOptions.map((course: any) => (
              <button key={course.id} onClick={() => { setSelectedCourseId(course.id); setStep("exams"); }} className="w-full">
                <Card className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 p-3.5">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary"><GraduationCap className="h-5 w-5" /></span>
                  <div className="min-w-0 text-left"><p className="truncate font-semibold">{course.name}</p></div>
                </Card>
              </button>
            ))}
            {courseOptions.length === 0 ? <EmptyState title={t("No courses assigned")} /> : null}
          </div>
        </>
      ) : null}

      {step === "exams" && selectedCourseId && selectedSectionId ? (
        <>
          <div className="flex items-center gap-2">
            <button onClick={() => { setStep("courses"); setSelectedExamId(""); }} className="text-xs text-primary">{t("← Back to courses")}</button>
          </div>
          <SectionTitle>{t("Exams")}</SectionTitle>
          <div className="space-y-2">
            {parentExams.map((exam) => {
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
            {parentExams.length === 0 ? <EmptyState title={t("No exams assigned")} /> : null}
          </div>
        </>
      ) : null}

      {step === "subExams" && selectedExamId ? (
        <>
          <div className="flex items-center gap-2">
            <button onClick={() => { setStep("exams"); setSelectedExamId(""); }} className="text-xs text-primary">{t("← Back")}</button>
            <span className="text-xs font-bold text-muted-foreground">{parentExams.find((e) => e.id === selectedExamId)?.name}</span>
          </div>
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

  const examTypes = useQuery({ queryKey: ["exam-types"], queryFn: () => assessmentsApi.listExamTypes() });
  const exam = useMemo(() => (examTypes.data ?? []).find((e) => e.id === examId), [examTypes.data, examId]);

  const marks = useQuery({ queryKey: ["marks", examId, classId, sectionId], queryFn: () => assessmentsApi.listMarks({ exam_type_id: examId, class_id: classId, section_id: sectionId }), enabled: true });
  const roster = useQuery({ queryKey: ["roster", classId, sectionId], queryFn: () => peopleApi.listStudentsPage({ limit: 100, offset: 0, section_id: sectionId }), enabled: true });

  const enterMark = useMutation({
    mutationFn: (p: { exam_type_id: string; student_id: string; score: number }) => assessmentsMutations.enterMark(p),
    onSuccess: () => { toast.success(t("Saved")); client.invalidateQueries({ queryKey: ["marks"] }); },
  });

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <button onClick={onBack} className="text-xs text-primary">{t("← Back")}</button>
        <span className="text-xs font-bold text-muted-foreground">{exam?.name} ({exam?.weightage}%)</span>
      </div>
      {(roster.data?.items ?? []).map((student) => {
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
  const { user } = useAuth();
  const client = useQueryClient();
  const [classId, setClassId] = useState("");
  const [sectionId, setSectionId] = useState("");
  const classes = useQuery({ queryKey: ["classes"], queryFn: () => academicsApi.listClasses(), enabled: !teacherScoped });
  const myTimetable = useQuery({ queryKey: ["my-timetable"], queryFn: () => operationsApi.listMyTimetable(), enabled: teacherScoped });
  const sections = useQuery({ queryKey: ["sections", classId], queryFn: () => classId ? academicsExtraApi.listSections(classId) : Promise.resolve([]), enabled: !!classId });
  const matrix = useQuery({ queryKey: ["results-matrix", classId, sectionId], queryFn: () => assessmentsApi.resultsMatrix({ class_id: classId || undefined, section_id: sectionId || undefined }), enabled: !!classId });
  const teacherClassOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const slot of myTimetable.data ?? []) {
      if (slot.class_id) map.set(slot.class_id, slot.class_name ?? "—");
    }
    return Array.from(map, ([id, name]) => ({ id, name }));
  }, [myTimetable.data]);
  const teacherSectionOptions = useMemo(() => {
    if (!teacherScoped) return sections.data ?? [];
    const map = new Map<string, string>();
    for (const slot of myTimetable.data ?? []) {
      if (slot.class_id === classId && slot.section_id) map.set(slot.section_id, slot.section_name ?? "—");
    }
    return Array.from(map, ([id, name]) => ({ id, name }));
  }, [classId, myTimetable.data, sections.data, teacherScoped]);

  const publish = useMutation({
    mutationFn: async () => {
      const allStudentIds: string[] = [];
      for (const sec of (matrix.data?.sections ?? []))
        for (const s of sec.students) allStudentIds.push(s.student_id);
      if (!matrix.data?.session_id) throw new Error("No active session selected");
      return assessmentsMutations.publishResults(matrix.data.session_id, allStudentIds);
    },
    onSuccess: () => { toast.success(t("Results published")); void client.invalidateQueries({ queryKey: ["results-matrix"] }); },
  });

  return (
    <div className="space-y-2">
      <FilterBar activeCount={(classId ? 1 : 0) + (sectionId ? 1 : 0)} onClear={() => { setClassId(""); setSectionId(""); }}>
        <div className="grid grid-cols-2 gap-2">
          <Field label={t("Class")}><CustomDropdown value={classId} onChange={(e) => { setClassId(e.target.value); setSectionId(""); }}><option value="">{t("Select class")}</option>{(teacherScoped ? teacherClassOptions : classes.data ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</CustomDropdown></Field>
          <Field label={t("Section")}><CustomDropdown value={sectionId} onChange={(e) => setSectionId(e.target.value)}><option value="">{t("All sections")}</option>{teacherSectionOptions.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</CustomDropdown></Field>
        </div>
      </FilterBar>
      {canManage && matrix.data ? (
        <button onClick={() => publish.mutate()} className="gradient-emerald w-full rounded-xl py-2 text-xs font-bold text-primary-foreground">{t("Publish results")}</button>
      ) : null}
      {matrix.data?.sections.map((sec) => (
        <Card key={sec.section_id} className="p-3.5">
          <p className="font-semibold">{sec.class_name} · {sec.section_name}</p>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full text-xs">
              <thead><tr><th className="py-1 pr-2 text-left">{t("Student")}</th>{sec.courses.map((c) => <th key={c.course_id} className="px-1 text-right">{c.course_name}</th>)}<th className="pl-1 text-right">{t("Overall")}</th></tr></thead>
              <tbody>
                {sec.students.map((student) => (
                  <tr key={student.student_id} className="border-t border-border">
                    <td className="py-1 pr-2 font-medium">{student.name}</td>
                    {sec.courses.map((c) => { const cell = student.courses.find((sc) => sc.course_id === c.course_id); return <td key={c.course_id} className="px-1 text-right">{cell?.raw_score?.toFixed(1) ?? "—"}<br /><span className="text-[0.6rem] text-muted-foreground">{cell?.band ?? ""}</span></td>; })}
                    <td className="pl-1 text-right font-bold">{student.overall_score?.toFixed(1) ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ))}
    </div>
  );
}
