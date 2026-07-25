import { useEffect, useState } from "react";
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
        <label className="classSwitcher">{t("classLabel")}<Select value={selectedClassId} onChange={(event) => setSelectedClassId(event.target.value)}>{classOptions.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</Select></label>
      )}
      {selectedClassName && <h2 className="contextHeading">{selectedClassName}</h2>}
      {loading && <LoadingState />}
      {!loading && error && <ErrorState message={error} />}
      {!loading && !error && slots.length === 0 && <p className="emptyState">{t("noSlotsYet")}</p>}
      {!loading && !error && DAY_KEYS.map((dayKey, day) => {
        const daySlots = visibleSlots.filter((slot) => slot.day_of_week === day);
        if (daySlots.length === 0) return null;
        return (
          <PageSection key={dayKey} style={{ marginTop: 12 }}>
            <h3>{t(dayKey)}</h3>
            <div className="dataTable">
              <div className="dataRow header">
                <span>{t("timeCol")}</span>
                <span>{t("courseCol")}</span>
                <span>{t("sectionPeriodCol")}</span>
                <span>{t("teacherLocationCol")}</span>
              </div>
              {daySlots.map((slot) => (
                <div className="dataRow" key={slot.id}>
                  <span data-label={t("timeCol")}>{slot.start_time} – {slot.end_time}</span>
                  <span data-label={t("courseCol")}>{slot.course_name ?? "—"}</span>
                  <span data-label={t("sectionPeriodCol")}>{slot.section_name ?? "—"} · {t("periodLabel", { period: slot.period })}</span>
                  <span data-label={t("teacherLocationCol")}>{slot.teacher_name ?? "—"}</span>
                </div>
              ))}
            </div>
          </PageSection>
        );
      })}
    </PageSection>
  );
}
