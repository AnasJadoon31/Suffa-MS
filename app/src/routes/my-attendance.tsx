import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { LogIn, LogOut } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { AppShell } from "@/components/app/AppShell";
import { Card, EmptyState, Pill, SectionTitle, SkeletonList } from "@/components/app/Primitives";
import { useAuth } from "@/lib/mms/auth";
import { attendanceApi } from "@/lib/mms/endpoints";
import { apiErrorMessage } from "@/lib/mms/api";
import { AttendanceCalendar, monthRange, toDateKey, type StudentDayStatus } from "@/components/app/AttendanceCalendar";

export const Route = createFileRoute("/my-attendance")({
  head: () => ({
    meta: [
      { title: "My Attendance — Suffa MS" },
      { name: "description", content: "Personal attendance calendar and history" },
    ],
  }),
  component: MyAttendancePage,
});

function MyAttendancePage() {
  const { user } = useAuth();
  if (user?.role === "student") return <StudentAttendance />;
  return <TeacherAttendance />;
}

function TeacherAttendance() {
  const { t } = useTranslation();
  const [error, setError] = useState("");

  const today = useQuery({
    queryKey: ["teacher-attendance-today"],
    queryFn: () => attendanceApi.myTeacherAttendanceToday(),
  });

  const history = useQuery({
    queryKey: ["teacher-attendance-history"],
    queryFn: () => attendanceApi.myTeacherHistory(),
  });

  const act = async (kind: "in" | "out") => {
    setError("");
    try {
      if (kind === "in") await attendanceApi.teacherCheckIn();
      else await attendanceApi.teacherCheckOut();
      await Promise.all([today.refetch(), history.refetch()]);
    } catch (err) {
      setError(apiErrorMessage(err));
    }
  };

  const readOnly = false;

  return (
    <AppShell title={t("My attendance")} subtitle={t("Check-in and attendance history")}>
      {error ? (
        <p className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error}</p>
      ) : null}

      <Card>
        <p className="text-[0.68rem] font-bold uppercase tracking-widest text-muted-foreground">
          {t("Today")}
        </p>
        <p className="font-display text-lg font-extrabold">
          {today.data?.check_in ? today.data.check_in.slice(0, 5) : t("Not checked in")}
        </p>
        {today.data?.check_out ? (
          <p className="text-xs text-muted-foreground">
            {t("Out at")} {today.data.check_out.slice(0, 5)}
          </p>
        ) : null}
        <div className="mt-3 flex gap-2">
          <button
            onClick={() => act("in")}
            disabled={Boolean(today.data?.check_in) || readOnly}
            className="gradient-emerald flex items-center gap-1 rounded-lg px-3 py-2 text-xs font-bold text-primary-foreground disabled:opacity-50"
          >
            <LogIn className="h-3 w-3" />
            {t("Check in")}
          </button>
          <button
            onClick={() => act("out")}
            disabled={!today.data?.check_in || Boolean(today.data?.check_out) || readOnly}
            className="flex items-center gap-1 rounded-lg border border-border px-3 py-2 text-xs font-bold disabled:opacity-50"
          >
            <LogOut className="h-3 w-3" />
            {t("Check out")}
          </button>
        </div>
      </Card>

      <SectionTitle>{t("History")}</SectionTitle>
      {history.isLoading ? <SkeletonList rows={3} /> : null}
      {history.data?.length === 0 ? (
        <EmptyState title={t("No attendance history")} />
      ) : (
        <div className="space-y-1">
          <div className="grid grid-cols-4 gap-1 border-b-2 border-border pb-1 text-xs font-bold">
            <span>{t("Date")}</span>
            <span>{t("Status")}</span>
            <span>{t("In")}</span>
            <span>{t("Out")}</span>
          </div>
          {history.data?.map((entry) => (
            <div key={entry.id} className="grid grid-cols-4 gap-1 border-b border-border py-1 text-xs">
              <span>{entry.attendance_date}</span>
              <Pill tone={entry.status === "present" ? "success" : "destructive"}>{t(entry.status)}</Pill>
              <span>{entry.check_in?.slice(0, 5) ?? "—"}</span>
              <span>{entry.check_out?.slice(0, 5) ?? "—"}</span>
            </div>
          ))}
        </div>
      )}
    </AppShell>
  );
}

function StudentAttendance() {
  const { t } = useTranslation();
  const [month, setMonth] = useState(() => new Date());
  const [selectedDate, setSelectedDate] = useState<string | null>(() => toDateKey(new Date()));

  const history = useQuery({
    queryKey: ["student-attendance-history", month.toISOString().slice(0, 7)],
    queryFn: () => attendanceApi.myStudentHistory(monthRange(month)),
  });

  const statuses: StudentDayStatus = Object.fromEntries(
    (history.data?.entries ?? []).map((entry) => [entry.attendance_date, entry.status]),
  );
  const selectedEntries = (history.data?.entries ?? []).filter(
    (entry) => entry.attendance_date === selectedDate,
  );

  return (
    <AppShell title={t("My attendance")} subtitle={t("Attendance calendar and history")}>
      {history.isLoading ? <SkeletonList rows={4} /> : null}
      {history.isError ? (
        <EmptyState title={apiErrorMessage(history.error, t("Could not load attendance"))} />
      ) : null}

      {history.data ? (
        <>
          <AttendanceCalendar
            month={month}
            onMonthChange={setMonth}
            selectedDate={selectedDate}
            onSelectDate={setSelectedDate}
            mode="student"
            studentDayStatus={statuses}
          />

          <SectionTitle>{selectedDate ? t("Entries for this date") : t("Select a date")}</SectionTitle>
          {selectedDate && selectedEntries.length === 0 ? (
            <EmptyState title={t("No entries for this date")} />
          ) : (
            <div className="space-y-2">
              {selectedEntries.map((entry) => (
                <Card key={entry.id} className="grid grid-cols-2 gap-1 text-sm">
                  <span className="font-semibold">{t("Date")}</span>
                  <span>{entry.attendance_date}</span>
                  <span className="font-semibold">{t("Status")}</span>
                  <Pill tone={entry.status === "present" ? "success" : "destructive"}>
                    {t(entry.status)}
                  </Pill>
                  {entry.marked_by?.display_name ? (
                    <>
                      <span className="font-semibold">{t("Marked by")}</span>
                      <span>{entry.marked_by.display_name}</span>
                    </>
                  ) : null}
                </Card>
              ))}
            </div>
          )}
        </>
      ) : null}
    </AppShell>
  );
}
