import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
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

  const classOptions = [...new Map(
    (slots.data ?? []).map((slot) => [slot.class_id, slot.class_name ?? "—"]),
  ).entries()];

  const visibleSlots = selectedClassId
    ? (slots.data ?? []).filter((slot) => slot.class_id === selectedClassId)
    : slots.data ?? [];

  const selectedClassName = classOptions.find(([id]) => id === selectedClassId)?.[1];

  return (
    <AppShell title={t("My timetable")} subtitle={t("Your weekly class schedule")}>
      {slots.isLoading ? <SkeletonList rows={4} /> : null}
      {slots.isError ? (
        <EmptyState title={apiErrorMessage(slots.error, t("Could not load timetable"))} />
      ) : null}

      {classOptions.length > 1 ? (
        <div className="mb-3">
          <label className="text-xs font-semibold text-muted-foreground">{t("Class")}</label>
          <select
            value={selectedClassId}
            onChange={(e) => setSelectedClassId(e.target.value)}
            className="mt-1 block w-full rounded-lg border border-border bg-card px-3 py-2 text-sm"
          >
            {classOptions.map(([id, name]) => (
              <option key={id} value={id}>{name}</option>
            ))}
          </select>
        </div>
      ) : null}

      {selectedClassName ? (
        <p className="mb-2 text-lg font-bold">{selectedClassName}</p>
      ) : null}

      {slots.data?.length === 0 ? (
        <EmptyState title={t("No timetable entries")} />
      ) : (
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
                {daySlots
                  .sort((a, b) => (a.period ?? 0) - (b.period ?? 0))
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
      )}
    </AppShell>
  );
}
