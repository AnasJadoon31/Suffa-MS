import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

import { AppShell } from "@/components/app/AppShell";
import {
  Card,
  EmptyState,
  Pill,
  SectionTitle,
  SkeletonList,
  StatCard,
} from "@/components/app/Primitives";
import { cn } from "@/lib/utils";
import { academicsApi } from "@/lib/mms/endpoints";
import { assessmentsApi, academicsExtraApi } from "@/lib/mms/more-endpoints";

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

  const courseName = (id: string) => courses.data?.find((c) => c.id === id)?.name ?? "Course";
  const data = result.data;

  return (
    <AppShell title="Results" subtitle="Your session performance">
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
          title="Results unavailable"
          hint="Results are visible once published for your account."
        />
      ) : null}

      {data ? (
        <>
          <div className="grid grid-cols-2 gap-2.5">
            <StatCard label="Overall" value={data.overall_score ?? "—"} />
            <StatCard label="Courses" value={data.course_results.length} />
          </div>

          <SectionTitle
            action={
              <Pill tone={data.published ? "success" : "muted"}>
                {data.published ? "Published" : "Draft"}
              </Pill>
            }
          >
            Course breakdown
          </SectionTitle>

          <div className="space-y-2">
            {data.course_results.length === 0 ? <EmptyState title="No course results yet" /> : null}
            {data.course_results.map((course) => (
              <Card
                key={course.course_id}
                className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-3 p-3.5"
              >
                <div className="min-w-0">
                  <p className="truncate font-semibold">{courseName(course.course_id)}</p>
                  <p className="text-xs text-muted-foreground">{course.exam_count} exams</p>
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
