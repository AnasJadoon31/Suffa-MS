import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, GraduationCap } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { AppShell } from "@/components/app/AppShell";
import { Card, EmptyState, SectionTitle, SkeletonList } from "@/components/app/Primitives";
import { operationsApi, type TimetableSlot } from "@/lib/mms/endpoints";
import { apiErrorMessage } from "@/lib/mms/api";

const DAY_KEYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

export const Route = createFileRoute("/my-timetable")({
  head: () => ({
    meta: [
      { title: "My Timetable — Suffa MS" },
      { name: "description", content: "Your weekly class timetable" },
    ],
  }),
  component: MyTimetablePage,
});

function MyTimetablePage() {
  const { t } = useTranslation();
  const [selectedClassId, setSelectedClassId] = useState("");

  const slots = useQuery({
    queryKey: ["my-timetable"],
    queryFn: () => operationsApi.listMyTimetable(),
  });

  const classOptions = useMemo(() => [...new Map(
    (slots.data ?? []).map((slot) => [slot.class_id, slot.class_name ?? "—"]),
  ).entries()], [slots.data]);

  const visibleSlots = selectedClassId
    ? (slots.data ?? []).filter((slot) => slot.class_id === selectedClassId)
    : slots.data ?? [];

  const selectedClassName = classOptions.find(([id]) => id === selectedClassId)?.[1];

  return (
    <AppShell title={t("My timetable")} subtitle={t("Your weekly class schedule")}>
      {slots.isLoading ? <SkeletonList rows={4} /> : null}
      {slots.isError ? (
        <EmptyState title={t(apiErrorMessage(slots.error, "Could not load timetable"))} />
      ) : null}

      {!selectedClassId && classOptions.length > 0 ? (
        <div className="space-y-2">
          <SectionTitle>{t("Class")}</SectionTitle>
          {classOptions.map(([id, name]) => (
            <button key={id} onClick={() => setSelectedClassId(id)} className="w-full">
              <Card className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 p-3.5">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary"><GraduationCap className="h-5 w-5" /></span>
                <div className="min-w-0 text-left">
                  <p className="truncate font-semibold">{name}</p>
                  <p className="truncate text-xs text-muted-foreground">{t("View timetable")}</p>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </Card>
            </button>
          ))}
        </div>
      ) : null}

      {selectedClassName ? (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-2xl border border-border bg-card p-3">
          <button onClick={() => setSelectedClassId("")} className="rounded-xl border border-border px-3 py-2 text-xs font-bold text-primary">{t("Back")}</button>
          <span className="text-xs font-bold uppercase text-muted-foreground">{t("Class")}</span>
          <span className="rounded-full bg-primary-soft px-3 py-1 text-xs font-bold text-primary">{selectedClassName}</span>
        </div>
      ) : null}

      {slots.data?.length === 0 ? (
        <EmptyState title={t("No timetable entries")} />
      ) : selectedClassId ? (
        DAY_KEYS.map((day, dayIndex) => {
          const daySlots = visibleSlots.filter((slot) => slot.day_of_week === dayIndex);
          if (daySlots.length === 0) return null;
          return (
            <div key={day} className="mt-4">
              <SectionTitle>{t(day)}</SectionTitle>
              <div>
                <div className="grid grid-cols-4 gap-1 border-b-2 border-border pb-1 text-xs font-bold">
                  <span>{t("Time")}</span>
                  <span>{t("Course")}</span>
                  <span>{t("Section")}</span>
                  <span>{t("Teacher")}</span>
                </div>
                {[...daySlots]
                  .sort((a, b) => (a.start_time ?? "").localeCompare(b.start_time ?? "") || (a.period ?? 0) - (b.period ?? 0))
                  .map((slot) => (
                    <div key={slot.id} className="grid grid-cols-4 gap-1 border-b border-border py-1.5 text-xs">
                      <span>{slot.start_time?.slice(0, 5)}–{slot.end_time?.slice(0, 5)}</span>
                      <span>{slot.course_name ?? "—"}</span>
                      <span>{slot.section_name ?? "—"} P{slot.period}</span>
                      <span>{slot.teacher_name ?? "—"}</span>
                    </div>
                  ))}
              </div>
            </div>
          );
        })
      ) : null}
    </AppShell>
  );
}
