import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Download, FileCheck2 } from "lucide-react";
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
} from "@/components/app/Primitives";
import { academicsApi } from "@/lib/mms/endpoints";
import { useAuth } from "@/lib/mms/auth";
import { academicsExtraApi, assessmentsApi, assessmentsMutations, reportsApi } from "@/lib/mms/more-endpoints";
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
  return isStudent || !hasPermission("assessments.results.publish") ? (
    <StudentResultsView />
  ) : (
    <StaffResultsView />
  );
}

function StudentResultsView() {
    const { t } = useTranslation();
  const [sessionId, setSessionId] = useState<string>("");

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
              <Card
                key={course.course_id}
                className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-3 p-3.5"
              >
                <div className="min-w-0">
                  <p className="truncate font-semibold">{courseName(course.course_id)}</p>
                  <p className="text-xs text-muted-foreground">{course.exam_count} {t("exams")}</p>
                </div>
                <span className="font-display text-lg font-extrabold">
                  {course.raw_score ?? "—"}
                </span>
                {course.band ? <Pill tone="gold">{course.band}</Pill> : null}
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
  const client = useQueryClient();
  const sessions = useQuery({ queryKey: ["sessions"], queryFn: () => academicsApi.listSessions() });
  const classes = useQuery({ queryKey: ["classes"], queryFn: () => academicsApi.listClasses() });
  const [sessionId, setSessionId] = useState("");
  const [classId, setClassId] = useState("");

  const matrix = useQuery({
    queryKey: ["results-matrix", sessionId, classId],
    queryFn: () => assessmentsApi.resultsMatrix({ class_id: classId, session_id: sessionId }),
    enabled: Boolean(sessionId && classId),
    retry: false,
  });

  const publish = useMutation({
    mutationFn: (studentIds: string[]) => assessmentsMutations.publishResults(sessionId, studentIds),
    onSuccess: async () => {
      toast.success("Results published");
      await client.invalidateQueries({ queryKey: ["results-matrix", sessionId, classId] });
    },
  });

  const sectionRows = matrix.data?.sections ?? [];

  return (
    <AppShell title={t("Results")} subtitle={t("Review and publish class results")}>
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
            <div key={section.section_id}>
              <SectionTitle
                action={
                  <div className="flex gap-2">
                    <ActionButton
                      variant="soft"
                      onClick={() => void reportsApi.results({ class_id: classId, session_id: sessionId }, "pdf")}
                    >
                      <Download className="h-4 w-4" />
                      {t("Export")}</ActionButton>
                    <ActionButton
                      onClick={() => publish.mutate(section.students.map((student) => student.student_id))}
                      disabled={publish.isPending}
                    >
                      <FileCheck2 className="h-4 w-4" />
                      {t("Publish section")}</ActionButton>
                  </div>
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
                        return (
                          <div key={course.course_id} className="rounded-2xl bg-muted px-3 py-2">
                            <p className="text-sm font-semibold">{courseMeta?.course_name ?? "Course"}</p>
                            <p className="text-xs text-muted-foreground">
                              {course.raw_score ?? "—"}
                              {course.band ? ` · ${course.band}` : ""}
                            </p>
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
    </AppShell>
  );
}
