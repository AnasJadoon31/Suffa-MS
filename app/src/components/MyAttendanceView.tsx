import { Button } from "./ui/Button";
import { Box } from "./ui/Mui";
import { Paper } from "./ui/Mui";
import { Typography } from "./ui/Mui";
import { Chip } from "./ui/Mui";
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
        <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", mb: 2 }}>
          <Button type="button" disabled={Boolean(today?.check_in)} onClick={() => check("in")}>{t("timeInLabel")}</Button>
          <Button type="button" disabled={!today?.check_in || Boolean(today.check_out)} onClick={() => check("out")}>{t("timeOutLabel")}</Button>
        </Box>
      )}
      {!loading && (
        <Box sx={{ mt: 2 }}>
          <Box sx={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 1, fontWeight: 700, borderBottom: 2, borderColor: "divider", pb: 1, mb: 1 }}>
            <span>{t("dateCol")}</span>
            <span>{t("statusCol")}</span>
            <span>{t("timeInLabel")}</span>
            <span>{t("timeOutLabel")}</span>
          </Box>
          {entries.length === 0 && <Typography sx={{ color: "text.secondary", fontStyle: "italic" }}>{t("noAttendanceHistory")}</Typography>}
          {entries.map((entry) => (
            <Box key={entry.id} sx={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 1, py: 1, borderBottom: 1, borderColor: "divider" }}>
              <span>{entry.attendance_date}</span>
              <span>{t(entry.status)}</span>
              <span>{entry.check_in?.slice(0, 5) ?? "—"}</span>
              <span>{entry.check_out?.slice(0, 5) ?? "—"}</span>
            </Box>
          ))}
        </Box>
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
          <Box sx={{ mt: 2 }}>
            <Box sx={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 1, fontWeight: 700, borderBottom: 2, borderColor: "divider", pb: 1, mb: 1 }}>
              <span>{t("dateCol")}</span>
              <span>{t("courseAndPeriodLabel")}</span>
              <span>{t("statusCol")}</span>
              <span>{t("markedByCol")}</span>
            </Box>
            {selectedDate && selectedEntries.length === 0 && <Typography sx={{ color: "text.secondary", fontStyle: "italic" }}>{t("noAttendanceHistory")}</Typography>}
            {selectedEntries.map((entry) => (
              <Box key={entry.id} sx={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 1, py: 1, borderBottom: 1, borderColor: "divider" }}>
                <span>{entry.attendance_date}</span>
                <span>{entry.legacy_general
                  ? t("legacyGeneralAttendance")
                  : `${entry.course?.name ?? "—"} · ${t("periodLabel", { period: entry.timetable_slot?.period })}`}</span>
                <span>
                  <Chip
                    label={t(entry.status)}
                    size="small"
                    color={entry.status === "present" ? "success" : entry.status === "absent" ? "error" : "default"}
                  />
                </span>
                <span>{entry.marked_by.display_name}</span>
              </Box>
            ))}
          </Box>
        </>
      )}
    </PageSection>
  );
}
