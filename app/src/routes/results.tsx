import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { ChevronDown, ChevronRight, Download } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/app/AppShell";
import {
  ActionButton,
  Card,
  EmptyState,
  Field,
  Pill,
  SectionTitle,
  CustomDropdown,
  SkeletonList,
  StatCard,
  TextInput,
} from "@/components/app/Primitives";
import { academicsApi } from "@/lib/mms/endpoints";
import { useAuth } from "@/lib/mms/auth";
import { academicsExtraApi, assessmentsApi, assessmentsMutations, reportsApi } from "@/lib/mms/more-endpoints";
import type { ParentResultView } from "@/lib/mms/more-endpoints";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";

export const Route = createFileRoute("/results")({
  head: () => ({
    meta: [
      { title: "Results — Suffa MS" },
      { name: "description", content: "Session results, course scores and grade bands." },
      { property: "og:title", content: "Results — Suffa MS" },
      { property: "og:description", content: "Session results, course scores and grade bands." },
    ],
  }),
  component: ResultsPage,
});

function ResultsPage() {
    const { t } = useTranslation();
  const { user, hasPermission } = useAuth();
  const isStudent = user?.role === "student";
  const isGuardian = user?.role === "parent";
  if (isGuardian) return <GuardianResultsView />;
  return isStudent || !hasPermission("assessments.results.publish") ? (
    <StudentResultsView />
  ) : (
    <StaffResultsView />
  );
}

function StudentResultsView() {
    const { t } = useTranslation();
  const [sessionId, setSessionId] = useState<string>("");
  const [expandedCourseId, setExpandedCourseId] = useState("");

  const sessions = useQuery({ queryKey: ["sessions"], queryFn: () => academicsApi.listSessions() });
  const courses = useQuery({
    queryKey: ["courses"],
    queryFn: () => academicsExtraApi.listCourses(),
  });

  const activeSession = sessionId || sessions.data?.find((s) => s.is_active)?.id || "";

  const result = useQuery({
    queryKey: ["my-result", activeSession],
    queryFn: () => assessmentsApi.myResult(activeSession),
    enabled: Boolean(activeSession),
    retry: false,
  });

  const resultCard = useMutation({
    mutationFn: () => assessmentsMutations.downloadMyResultCard(activeSession),
    onSuccess: () => toast.success("Result card downloaded"),
  });

  const courseName = (id: string) => courses.data?.find((c) => c.id === id)?.name ?? "Course";
  const data = result.data;

  return (
    <AppShell title={t("Results")} subtitle={t("Your session performance")}>
      {sessions.data && sessions.data.length > 0 ? (
        <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
          {sessions.data.map((session) => (
            <button
              key={session.id}
              onClick={() => setSessionId(session.id)}
              className={cn(
                "shrink-0 rounded-full px-3.5 py-2 text-xs font-bold transition-colors",
                session.id === activeSession
                  ? "gradient-emerald text-primary-foreground shadow-[var(--shadow-raised)]"
                  : "bg-muted text-muted-foreground",
              )}
            >
              {session.name}
            </button>
          ))}
        </div>
      ) : null}

      {result.isLoading ? <SkeletonList rows={4} /> : null}

      {result.isError ? (
        <EmptyState
          title={t("Results unavailable")}
          hint="Results are visible once published for your account."
        />
      ) : null}

      {data ? (
        <>
          <div className="grid grid-cols-2 gap-2.5">
            <StatCard label={t("Overall")} value={data.overall_score ?? "—"} />
            <StatCard label={t("Courses")} value={data.course_results.length} />
          </div>

          <SectionTitle
            action={
              <div className="flex gap-2">
                <Pill tone={data.published ? "success" : "muted"}>
                  {data.published ? "Published" : "Draft"}
                </Pill>
                {data.published ? (
                  <ActionButton variant="soft" onClick={() => resultCard.mutate()}>
                    <Download className="h-4 w-4" />
                    {t("Card")}</ActionButton>
                ) : null}
              </div>
            }
          >
            {t("Course breakdown")}</SectionTitle>

          <div className="space-y-2">
            {data.course_results.length === 0 ? <EmptyState title={t("No course results yet")} /> : null}
            {data.course_results.map((course) => (
              <Card key={course.course_id} className="space-y-2 p-3.5">
                <button
                  onClick={() => setExpandedCourseId((current) => current === course.course_id ? "" : course.course_id)}
                  className="grid w-full grid-cols-[minmax(0,1fr)_auto_auto_auto] items-center gap-3 text-left"
                >
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{courseName(course.course_id)}</p>
                    <p className="text-xs text-muted-foreground">{course.exam_count} {t("exams")}</p>
                  </div>
                  <span className="font-display text-lg font-extrabold">
                    {course.raw_score ?? "—"}
                  </span>
                  {course.band ? <Pill tone="gold">{course.band}</Pill> : null}
                  <ChevronRight className={cn("h-4 w-4 text-muted-foreground transition-transform", expandedCourseId === course.course_id ? "rotate-90" : "")} />
                </button>
                {expandedCourseId === course.course_id ? (
                  <div className="space-y-1.5 border-t border-border pt-2">
                    {course.marks.length === 0 ? <EmptyState title={t("No exam marks found")} /> : null}
                    {course.marks.map((mark) => (
                      <div key={mark.exam_type_id} className="flex items-center justify-between gap-3 rounded-xl bg-muted px-3 py-2 text-xs">
                        <div className="min-w-0">
                          <p className="truncate font-semibold">{mark.name}</p>
                          <p className="text-muted-foreground">{mark.weightage}%</p>
                        </div>
                        <span className="font-bold">{mark.score ?? "—"}</span>
                      </div>
                    ))}
                  </div>
                ) : null}
              </Card>
            ))}
          </div>
        </>
      ) : null}
    </AppShell>
  );
}

function StaffResultsView() {
    const { t } = useTranslation();
  const sessions = useQuery({ queryKey: ["sessions"], queryFn: () => academicsApi.listSessions() });
  const classes = useQuery({ queryKey: ["classes"], queryFn: () => academicsApi.listClasses() });
  const [sessionId, setSessionId] = useState("");
  const [classId, setClassId] = useState("");
  const [expandedSubject, setExpandedSubject] = useState("");

  const matrix = useQuery({
    queryKey: ["results-matrix", sessionId, classId],
    queryFn: () => assessmentsApi.resultsMatrix({ class_id: classId, session_id: sessionId }),
    enabled: Boolean(sessionId && classId),
    retry: false,
  });

  const sectionRows = matrix.data?.sections ?? [];

  return (
    <AppShell title={t("Results")} subtitle={t("Published class results")}>
      <div className="space-y-4">
        <Card className="grid gap-3 p-3.5 md:grid-cols-2">
          <Field label={t("Session")}>
            <CustomDropdown value={sessionId} onChange={(event) => setSessionId(event.target.value)}>
              <option value="">{t("Select session")}</option>
              {(sessions.data ?? []).map((session) => (
                <option key={session.id} value={session.id}>
                  {session.name}
                </option>
              ))}
            </CustomDropdown>
          </Field>
          <Field label={t("Class")}>
            <CustomDropdown value={classId} onChange={(event) => setClassId(event.target.value)}>
              <option value="">{t("Select class")}</option>
              {(classes.data ?? []).map((academicClass) => (
                <option key={academicClass.id} value={academicClass.id}>
                  {academicClass.name}
                </option>
              ))}
            </CustomDropdown>
          </Field>
        </Card>

      {!sessionId || !classId ? (
        <EmptyState title={t("Pick a session and class")} hint="The results matrix loads after both." />
      ) : matrix.isLoading ? (
        <SkeletonList rows={4} />
      ) : matrix.isError ? (
        <EmptyState title={t("Results unavailable")} hint="Check class scope or publication permissions." />
      ) : sectionRows.length === 0 ? (
        <EmptyState title={t("No results found")} />
      ) : (
        <div className="space-y-5">
          {sectionRows.map((section) => (
            <div key={section.section_id} className="space-y-3">
              <SectionTitle
                action={
                  <ActionButton
                    variant="soft"
                    onClick={() => void reportsApi.results({ class_id: classId, session_id: sessionId }, "pdf")}
                  >
                    <Download className="h-4 w-4" />
                    {t("Export")}
                  </ActionButton>
                }
              >
                {section.class_name} · {section.section_name}
              </SectionTitle>
              <div className="space-y-2">
                {section.students.map((student) => (
                  <Card key={student.student_id} className="space-y-2 p-3.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="font-semibold">{student.name}</p>
                        <p className="text-xs text-muted-foreground">{student.admission_number}</p>
                      </div>
                      <Pill tone="gold">{student.overall_score ?? "—"}</Pill>
                    </div>
                    <div className="grid gap-2 md:grid-cols-2">
                      {student.courses.map((course) => {
                        const courseMeta = section.courses.find((entry) => entry.course_id === course.course_id);
                        const subjectKey = `${student.student_id}:${course.course_id}`;
                        return (
                          <div key={course.course_id} className="rounded-2xl bg-muted px-3 py-2">
                            <button
                              onClick={() => setExpandedSubject((current) => current === subjectKey ? "" : subjectKey)}
                              className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-2 text-left"
                            >
                              <span className="min-w-0">
                                <span className="block truncate text-sm font-semibold">{courseMeta?.course_name ?? "Course"}</span>
                                <span className="block text-xs text-muted-foreground">
                                  {course.raw_score ?? "—"}
                                  {course.band ? ` · ${course.band}` : ""}
                                </span>
                              </span>
                              <ChevronRight className={cn("h-4 w-4 text-muted-foreground transition-transform", expandedSubject === subjectKey ? "rotate-90" : "")} />
                            </button>
                            {expandedSubject === subjectKey ? (
                              <div className="mt-2 space-y-1.5 border-t border-border pt-2">
                                {(courseMeta?.exam_types ?? []).length === 0 ? <EmptyState title={t("No exam marks found")} /> : null}
                                {(courseMeta?.exam_types ?? []).map((exam) => {
                                  const mark = course.marks.find((item) => item.exam_type_id === exam.id);
                                  return (
                                    <div key={exam.id} className="flex items-center justify-between gap-3 rounded-xl bg-card px-3 py-2 text-xs">
                                      <div className="min-w-0">
                                        <p className="truncate font-semibold">{exam.name}</p>
                                        <p className="text-muted-foreground">{exam.weightage}%</p>
                                      </div>
                                      <span className="font-bold">{mark?.score ?? "—"}</span>
                                    </div>
                                  );
                                })}
                              </div>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
      </div>
    </AppShell>
  );
}

function ChildResultView({ child }: { child: ParentResultView }) {
  const { t } = useTranslation();
  const [sessionId, setSessionId] = useState("");
  const sessions = useQuery({ queryKey: ["sessions"], queryFn: () => academicsApi.listSessions() });
  const courses = useQuery({ queryKey: ["courses"], queryFn: () => academicsExtraApi.listCourses() });
  const [expandedCourseId, setExpandedCourseId] = useState("");

  const activeSession = sessionId || sessions.data?.find((s) => s.is_active)?.id || "";

  const result = useQuery({
    queryKey: ["child-result", child.id, activeSession],
    queryFn: () => assessmentsApi.parentResults(activeSession),
    enabled: Boolean(activeSession),
  });

  const childResult = result.data?.find((c) => c.id === child.id)?.result ?? null;
  const courseName = (id: string) => courses.data?.find((c) => c.id === id)?.name ?? "Course";

  if (!childResult) {
    return <EmptyState title={t("Results unavailable")} hint="Results are visible once published for this child." />;
  }

  return (
    <>
      {sessions.data && sessions.data.length > 0 ? (
        <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
          {sessions.data.map((session) => (
            <button
              key={session.id}
              onClick={() => setSessionId(session.id)}
              className={cn(
                "shrink-0 rounded-full px-3.5 py-2 text-xs font-bold transition-colors",
                session.id === activeSession
                  ? "gradient-emerald text-primary-foreground shadow-[var(--shadow-raised)]"
                  : "bg-muted text-muted-foreground",
              )}
            >
              {session.name}
            </button>
          ))}
        </div>
      ) : null}

      {result.isLoading ? <SkeletonList rows={4} /> : null}

      {childResult.published || childResult.course_results.length > 0 ? (
        <>
          <div className="grid grid-cols-2 gap-2.5">
            <StatCard label={t("Overall")} value={childResult.overall_score ?? "—"} />
            <StatCard label={t("Courses")} value={childResult.course_results.length} />
          </div>

          <SectionTitle
            action={<Pill tone={childResult.published ? "success" : "muted"}>
              {childResult.published ? "Published" : "Draft"}
            </Pill>}
          >
            {t("Course breakdown")}
          </SectionTitle>

          <div className="space-y-2">
            {childResult.course_results.length === 0 ? <EmptyState title={t("No course results yet")} /> : null}
            {childResult.course_results.map((course) => (
              <Card key={course.course_id} className="space-y-2 p-3.5">
                <button
                  onClick={() => setExpandedCourseId((current) => current === course.course_id ? "" : course.course_id)}
                  className="grid w-full grid-cols-[minmax(0,1fr)_auto_auto_auto] items-center gap-3 text-left"
                >
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{courseName(course.course_id)}</p>
                    <p className="text-xs text-muted-foreground">{course.exam_count} {t("exams")}</p>
                  </div>
                  <span className="font-display text-lg font-extrabold">
                    {course.raw_score ?? "—"}
                  </span>
                  {course.band ? <Pill tone="gold">{course.band}</Pill> : null}
                  <ChevronRight className={cn("h-4 w-4 text-muted-foreground transition-transform", expandedCourseId === course.course_id ? "rotate-90" : "")} />
                </button>
                {expandedCourseId === course.course_id ? (
                  <div className="space-y-1.5 border-t border-border pt-2">
                    {course.marks.length === 0 ? <EmptyState title={t("No exam marks found")} /> : null}
                    {course.marks.map((mark) => (
                      <div key={mark.exam_type_id} className="flex items-center justify-between gap-3 rounded-xl bg-muted px-3 py-2 text-xs">
                        <div className="min-w-0">
                          <p className="truncate font-semibold">{mark.name}</p>
                          <p className="text-muted-foreground">{mark.weightage}%</p>
                        </div>
                        <span className="font-bold">{mark.score ?? "—"}</span>
                      </div>
                    ))}
                  </div>
                ) : null}
              </Card>
            ))}
          </div>
        </>
      ) : (
        <EmptyState title={t("Results unavailable")} hint="Results are visible once published for this child." />
      )}
    </>
  );
}

function GuardianResultsView() {
  const { t } = useTranslation();
  const [search, setSearch] = useState("");
  const [expandedChild, setExpandedChild] = useState<string | null>(null);

  const children = useQuery({
    queryKey: ["results", "parent-view"],
    queryFn: () => assessmentsApi.parentResults(),
  });

  const data = children.data ?? [];

  const filtered = useMemo(() => {
    if (!search.trim()) return data;
    const q = search.trim().toLowerCase();
    return data.filter((child) => child.name.toLowerCase().includes(q));
  }, [data, search]);

  if (children.isLoading) {
    return <AppShell title={t("Results")} subtitle={t("Your children's performance")}><SkeletonList rows={5} /></AppShell>;
  }

  return (
    <AppShell title={t("Results")} subtitle={t("Your children's performance")}>
      {data.length === 0 ? (
        <EmptyState title={t("No results")} hint="Your children's results will appear once published." />
      ) : (
        <>
          <Field label={t("Search child")} className="mb-4">
            <TextInput
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("Type a name…")}
            />
          </Field>

          <div className="space-y-2.5">
            {filtered.map((child) => {
              const isOpen = expandedChild === child.id;
              return (
                <Card key={child.id} className="overflow-hidden p-0">
                  <button
                    onClick={() => setExpandedChild(isOpen ? null : child.id)}
                    className="flex w-full items-center justify-between gap-3 p-3.5 text-left"
                  >
                    <div className="min-w-0">
                      <p className="font-display text-sm font-extrabold">{child.name}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {[child.class_name, child.section_name].filter(Boolean).join(" · ")}
                      </p>
                    </div>
                    <ChevronDown
                      className={cn(
                        "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
                        isOpen && "rotate-180",
                      )}
                    />
                  </button>
                  {isOpen ? (
                    <div className="border-t border-border px-3.5 pb-3.5 pt-2">
                      <ChildResultView child={child} />
                    </div>
                  ) : null}
                </Card>
              );
            })}
          </div>
        </>
      )}
    </AppShell>
  );
}
