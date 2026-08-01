import { useEffect, useState } from "react";
import { Box } from "./ui/Mui";
import { Paper } from "./ui/Mui";
import { Typography } from "./ui/Mui";
import { useTranslation } from "react-i18next";

import { operationsApi, type TimetableSlot } from "../lib/endpoints";
import { PageSection, PageHeader } from "./ui/Layout";
import { ErrorState, LoadingState } from "./ui/AsyncState";
import { Select } from "./ui/Field";

const DAY_KEYS = ["dayMon", "dayTue", "dayWed", "dayThu", "dayFri", "daySat", "daySun"] as const;

export function MyTimetableView() {
  const { t } = useTranslation();
  const [slots, setSlots] = useState<TimetableSlot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedClassId, setSelectedClassId] = useState("");

  useEffect(() => {
    void operationsApi.listMyTimetable()
      .then((rows) => {
        setSlots(rows);
        setSelectedClassId((current) => current || rows[0]?.class_id || "");
      })
      .catch((err: any) => setError(err.response?.data?.detail ?? t("failedLoadTimetable")))
      .finally(() => setLoading(false));
  }, [t]);

  const classOptions = [...new Map(slots.map((slot) => [slot.class_id, slot.class_name ?? "—"])).entries()];
  const visibleSlots = selectedClassId ? slots.filter((slot) => slot.class_id === selectedClassId) : slots;
  const selectedClassName = classOptions.find(([id]) => id === selectedClassId)?.[1];

  return (
    <PageSection>
      <PageHeader title={t("myTimetable")} notice={t("descMyTimetable")} />
      {classOptions.length > 1 && (
        <Box component="label" sx={{ display: "flex", alignItems: "center", gap: 8, mb: 2 }}>
          {t("classLabel")}
          <Select value={selectedClassId} onChange={(event) => setSelectedClassId(event.target.value)}>
            {classOptions.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </Select>
        </Box>
      )}
      {selectedClassName && <Typography variant="h6" sx={{ fontWeight: 600, mb: 1 }}>{selectedClassName}</Typography>}
      {loading && <LoadingState />}
      {!loading && error && <ErrorState message={error} />}
      {!loading && !error && slots.length === 0 && <Typography sx={{ color: "text.secondary", fontStyle: "italic" }}>{t("noSlotsYet")}</Typography>}
      {!loading && !error && DAY_KEYS.map((dayKey, day) => {
        const daySlots = visibleSlots.filter((slot) => slot.day_of_week === day);
        if (daySlots.length === 0) return null;
        return (
          <PageSection key={dayKey} sx={{ marginTop: 12 }}>
            <Typography variant="h6" sx={{ fontWeight: 600 }}>{t(dayKey)}</Typography>
            <Box>
              <Box sx={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 1, fontWeight: 700, borderBottom: 2, borderColor: "divider", pb: 1, mb: 1 }}>
                <span>{t("timeCol")}</span>
                <span>{t("courseCol")}</span>
                <span>{t("sectionPeriodCol")}</span>
                <span>{t("teacherLocationCol")}</span>
              </Box>
              {daySlots.map((slot) => (
                <Box key={slot.id} sx={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 1, py: 1, borderBottom: 1, borderColor: "divider" }}>
                  <span>{slot.start_time} – {slot.end_time}</span>
                  <span>{slot.course_name ?? "—"}</span>
                  <span>{slot.section_name ?? "—"} · {t("periodLabel", { period: slot.period })}</span>
                  <span>{slot.teacher_name ?? "—"}</span>
                </Box>
              ))}
            </Box>
          </PageSection>
        );
      })}
    </PageSection>
  );
}
