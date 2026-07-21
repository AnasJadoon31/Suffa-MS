import { Button } from "./ui/Button";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { attendanceApi, type StudentAttendanceHistory, type TeacherAttendanceLogEntry, type TeacherAttendanceToday } from "../lib/endpoints";
import { useAuth } from "../lib/AuthContext";
import { AttendanceCalendar, monthRange, toDateKey, type StudentDayStatus } from "./AttendanceCalendar";
import { PageSection, PageHeader } from "./ui/Layout";
import { useSessionReadOnly } from "./SessionSwitcher";
import { ErrorState, LoadingState } from "./ui/AsyncState";

export function MyAttendanceView() {
  const { user } = useAuth();
  return user?.role === "teacher" ? <MyTeacherAttendance /> : <MyStudentAttendance />;
}

function MyTeacherAttendance() {
  const { t } = useTranslation();
  const readOnly = useSessionReadOnly();
  const [today, setToday] = useState<TeacherAttendanceToday | null>(null);
  const [entries, setEntries] = useState<TeacherAttendanceLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const [history, current] = await Promise.all([
        attendanceApi.myTeacherHistory(),
        readOnly ? Promise.resolve(null) : attendanceApi.myTeacherAttendanceToday(),
      ]);
      setEntries(history);
      setToday(current);
    } catch (err: any) {
      setError(err.response?.data?.detail ?? t("failedLoadAttendanceHistory"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const check = async (action: "in" | "out") => {
    setError("");
    try {
      setToday(action === "in" ? await attendanceApi.teacherCheckIn() : await attendanceApi.teacherCheckOut());
      setEntries(await attendanceApi.myTeacherHistory());
    } catch (err: any) {
      setError(err.response?.data?.detail ?? t("failedLoadAttendanceHistory"));
    }
  };

  return (
    <PageSection>
      <PageHeader title={t("myAttendance")} notice={t("descMyAttendance")} />
      {loading && <LoadingState />}
      {!loading && error && <ErrorState message={error} />}
      {!loading && !readOnly && (
        <div className="formActions">
          <Button className="primaryAction" type="button" disabled={Boolean(today?.check_in)} onClick={() => check("in")}>{t("timeInLabel")}</Button>
          <Button className="secondaryAction" type="button" disabled={!today?.check_in || Boolean(today.check_out)} onClick={() => check("out")}>{t("timeOutLabel")}</Button>
        </div>
      )}
      {!loading && (
        <div className="dataTable" style={{ marginTop: 16 }}>
          <div className="dataRow header"><span>{t("dateCol")}</span><span>{t("statusCol")}</span><span>{t("timeInLabel")}</span><span>{t("timeOutLabel")}</span></div>
          {entries.length === 0 && <p className="emptyState">{t("noAttendanceHistory")}</p>}
          {entries.map((entry) => (
            <div className="dataRow" key={entry.id}>
              <span>{entry.attendance_date}</span><span>{t(entry.status)}</span>
              <span>{entry.check_in?.slice(0, 5) ?? "—"}</span><span>{entry.check_out?.slice(0, 5) ?? "—"}</span>
            </div>
          ))}
        </div>
      )}
    </PageSection>
  );
}

function MyStudentAttendance() {
  const { t } = useTranslation();
  const [month, setMonth] = useState(() => new Date());
  const [selectedDate, setSelectedDate] = useState<string | null>(() => toDateKey(new Date()));
  const [history, setHistory] = useState<StudentAttendanceHistory | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    setError("");
    void attendanceApi.myStudentHistory(monthRange(month))
      .then(setHistory)
      .catch((err: any) => setError(err.response?.data?.detail ?? t("failedLoadAttendanceHistory")))
      .finally(() => setLoading(false));
  }, [month, t]);

  const statuses = useMemo<StudentDayStatus>(() => Object.fromEntries(
    (history?.entries ?? []).map((entry) => [entry.attendance_date, entry.status]),
  ), [history]);
  const selectedEntries = (history?.entries ?? []).filter((entry) => entry.attendance_date === selectedDate);

  return (
    <PageSection>
      <PageHeader
        title={t("myAttendance")}
        notice={history ? `${history.student.name} · ${history.class_name}${history.student.section_name ? ` / ${history.student.section_name}` : ""} · ${history.session_name}` : t("descMyAttendance")}
      />
      {loading && <LoadingState />}
      {!loading && error && <ErrorState message={error} />}
      {!loading && !error && history && (
        <>
          <AttendanceCalendar
            month={month}
            onMonthChange={setMonth}
            selectedDate={selectedDate}
            onSelectDate={setSelectedDate}
            mode="student"
            studentDayStatus={statuses}
          />
          <div className="dataTable" style={{ marginTop: 16 }}>
            <div className="dataRow header"><span>{t("dateCol")}</span><span>{t("statusCol")}</span><span>{t("markedByCol")}</span></div>
            {selectedDate && selectedEntries.length === 0 && <p className="emptyState">{t("noAttendanceHistory")}</p>}
            {selectedEntries.map((entry) => (
              <div className="dataRow" key={entry.id}>
                <span>{entry.attendance_date}</span>
                <span className={`statusPill ${entry.status}`}>{t(entry.status)}</span>
                <span>{entry.marked_by.display_name}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </PageSection>
  );
}
