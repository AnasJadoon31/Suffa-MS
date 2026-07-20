import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { operationsApi, type TimetableSlot } from "../lib/endpoints";
import { PageSection, PageHeader } from "./ui/Layout";
import { ErrorState, LoadingState } from "./ui/AsyncState";

const DAY_KEYS = ["dayMon", "dayTue", "dayWed", "dayThu", "dayFri", "daySat", "daySun"] as const;

export function MyTimetableView() {
  const { t } = useTranslation();
  const [slots, setSlots] = useState<TimetableSlot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    void operationsApi.listMyTimetable()
      .then(setSlots)
      .catch((err: any) => setError(err.response?.data?.detail ?? t("failedLoadTimetable")))
      .finally(() => setLoading(false));
  }, [t]);

  return (
    <PageSection>
      <PageHeader title={t("myTimetable")} notice={t("descMyTimetable")} />
      {loading && <LoadingState />}
      {!loading && error && <ErrorState message={error} />}
      {!loading && !error && slots.length === 0 && <p className="emptyState">{t("noSlotsYet")}</p>}
      {!loading && !error && DAY_KEYS.map((dayKey, day) => {
        const daySlots = slots.filter((slot) => slot.day_of_week === day);
        if (daySlots.length === 0) return null;
        return (
          <PageSection key={dayKey} style={{ marginTop: 12 }}>
            <h3>{t(dayKey)}</h3>
            <div className="dataTable">
              {daySlots.map((slot) => (
                <div className="dataRow" key={slot.id}>
                  <span>{slot.start_time} – {slot.end_time}</span>
                  <span>{slot.course_name ?? "—"}</span>
                  <span>{slot.class_name ?? "—"}{slot.section_name ? ` / ${slot.section_name}` : ""}</span>
                  <span>{slot.teacher_name ?? "—"}</span>
                </div>
              ))}
            </div>
          </PageSection>
        );
      })}
    </PageSection>
  );
}
