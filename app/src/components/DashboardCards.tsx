import { AlertTriangle, CalendarDays, CircleDollarSign, ClipboardCheck, ExternalLink, GraduationCap, LogIn, LogOut, UserRoundCog } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { AttendanceCalendar, toDateKey, type StudentDayStatus } from "./AttendanceCalendar";
import { ErrorState, LoadingState } from "./ui/AsyncState";
import { isNavItemAccessible, navItems, type ViewId } from "../data/mockData";
import { useAuth } from "../lib/AuthContext";

import {
  type DashboardData,
  type PrincipalDashboard,
  type StudentDashboard,
  type TeacherDashboard,
  type TeacherAttendanceLogEntry,
  assessmentsApi,
  attendanceApi,
  filesApi,
  reportingApi,
} from "../lib/endpoints";
import { cachedFetch } from "../lib/offlineCache";
import { setPendingClassNav } from "../lib/pendingNav";
import { Input } from "./ui/Field";
import { useSessionReadOnly } from "./SessionSwitcher";


export type DashboardCardsProps = Readonly<{ onNavigate?: (view: ViewId) => void }>;

function formatTime(value: string | null | undefined): string {
  return value ? value.slice(0, 5) : "—";
}

function QuickLinks({ onNavigate }: Readonly<{ onNavigate?: (view: ViewId) => void }>) {
  const { t } = useTranslation();
  const { hasPermission, hasFeature, user } = useAuth();
  if (!onNavigate) return null;
  const visible = navItems.filter(
    (item) => item.id !== "dashboard" && isNavItemAccessible(item, user?.role, hasPermission, hasFeature),
  );
  return (
    <nav className="quickLinks" aria-label={t("quickLinksLabel")}>
      {visible.map((item) => {
        const Icon = item.icon;
        return (
          <button key={item.id} type="button" className="quickLink" onClick={() => onNavigate(item.id)}>
            <Icon size={18} />
            <span>{t(item.labelKey)}</span>
          </button>
        );
      })}
    </nav>
  );
}

export function DashboardCards({ onNavigate }: DashboardCardsProps) {
  const { t } = useTranslation();
  const readOnly = useSessionReadOnly();
  const [data, setData] = useState<DashboardData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    // Cached so today's timetable / dashboard stays viewable offline (FR-TT-02).
    void cachedFetch("dashboard", () => reportingApi.dashboard())
      .then(({ data: payload }) => setData(payload))
      .catch((err: any) => setError(err.response?.data?.detail ?? t("failedLoadDashboard")))
      .finally(() => setIsLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (isLoading) return <LoadingState />;
  if (error) return <ErrorState message={error} />;
  if (!data) return null;
  return (
    <>
      <QuickLinks onNavigate={onNavigate} />
      {data.role === "teacher" ? (
        <TeacherDashboardCards data={data} onNavigate={onNavigate} readOnly={readOnly} />
      ) : data.role === "student" ? (
        <StudentDashboardCards data={data} readOnly={readOnly} />
      ) : (
        <PrincipalDashboardCards data={data} />
      )}
    </>
  );
}

function PrincipalDashboardCards({ data }: Readonly<{ data: PrincipalDashboard }>) {
  const { t } = useTranslation();
  const studentCount = data.counts.students ?? 0;
  const teacherCount = data.counts.teachers ?? 0;
  const markedAttendanceTotal = data.attendance.present + data.attendance.absent + data.attendance.leave;
  const attendanceRosterTotal = data.attendance.total_students ?? markedAttendanceTotal;
  const attendanceDetail = attendanceRosterTotal
    ? `${Math.round((data.attendance.present / attendanceRosterTotal) * 100)}% present · ${markedAttendanceTotal}/${attendanceRosterTotal} marked`
    : "No active roster";
  const cards = [
    {
      label: t("students"),
      value: String(studentCount),
      detail: `${data.counts.classes} active classes`,
      icon: GraduationCap,
    },
    {
      label: t("teachers"),
      value: String(teacherCount),
      detail: "Active teacher profiles",
      icon: UserRoundCog,
    },
    {
      label: t("todayAttendance"),
      value: `${data.attendance.present} / ${attendanceRosterTotal || "—"}`,
      detail: attendanceDetail,
      icon: ClipboardCheck,
    },
    { label: t("missingSync"), value: String(data.attendance.missing_sync_teachers), detail: "Teachers without today's mark", icon: AlertTriangle },
    { label: t("monthlyIncome"), value: `${data.finance.month_total.toLocaleString()} ${data.finance.currency}`, detail: "Contributions + donations", icon: CircleDollarSign },
  ];

  return (
    <>
      <section className="metricGrid" aria-label="Dashboard summary">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <article className="metricCard" key={card.label}>
              <Icon size={20} />
              <span>{card.label}</span>
              <strong>{card.value}</strong>
              <small>{card.detail}</small>
            </article>
          );
        })}
      </section>
      {data.attendance.missing_sync_teacher_list.length > 0 && (
        <section className="modulePanel">
          <div className="moduleHeader"><h2>Missing attendance sync</h2></div>
          <ul>
            {data.attendance.missing_sync_teacher_list.map((teacher) => <li key={teacher.id}>{teacher.name}</li>)}
          </ul>
        </section>
      )}
      {data.activity.length > 0 && (
        <section className="modulePanel">
          <div className="moduleHeader"><h2>Recent activity</h2></div>
          <ul>
            {data.activity.map((line) => <li key={line}>{line}</li>)}
          </ul>
        </section>
      )}
    </>
  );
}

function TeacherDashboardCards({ data, onNavigate, readOnly }: Readonly<{ data: TeacherDashboard; onNavigate?: (view: ViewId) => void; readOnly: boolean }>) {
  const { t } = useTranslation();
  const [attendance, setAttendance] = useState(data.today_attendance);
  const [logs, setLogs] = useState<TeacherAttendanceLogEntry[]>([]);
  const [error, setError] = useState("");

  const loadLogs = async () => {
    try {
      setLogs(await attendanceApi.myTeacherHistory());
    } catch {
      setLogs([]);
    }
  };

  useEffect(() => {
    setAttendance(data.today_attendance);
    void loadLogs();
  }, [data.today_attendance]);

  const checkIn = async () => {
    setError("");
    try {
      setAttendance(await attendanceApi.teacherCheckIn());
      await loadLogs();
    } catch (err: any) {
      setError(err.response?.data?.detail ?? "Could not check in");
    }
  };

  const checkOut = async () => {
    setError("");
    try {
      setAttendance(await attendanceApi.teacherCheckOut());
      await loadLogs();
    } catch (err: any) {
      setError(err.response?.data?.detail ?? "Could not check out");
    }
  };

  return (
    <>
      <section className="metricGrid" aria-label="Dashboard summary">
        <article className="metricCard">
          <span>My classes</span>
          <strong>{data.my_classes.length}</strong>
          <small>{data.my_classes.map((c) => `${c.class_name} · ${c.course_name}`).join(", ") || "No assignments yet"}</small>
        </article>
        <article className="metricCard">
          <span>Pending submissions</span>
          <strong>{data.pending_submissions}</strong>
          <small>Ungraded across your classes</small>
        </article>
        <article className="metricCard">
          <span>Today attendance</span>
          <strong>{attendance?.check_in ? formatTime(attendance.check_in) : "Not in"}</strong>
          <small>Out: {formatTime(attendance?.check_out)}</small>
        </article>
      </section>
      <section className="modulePanel">
        <div className="moduleHeader"><h2>{t("myClassesHeading")}</h2></div>
        {data.my_classes.length === 0 && <p className="emptyState">{t("noCoursesAssigned")}</p>}
        <div className="dataTable">
          {data.my_classes.map((entry, index) => (
            <div className="dataRow" key={index}>
              <span>{entry.class_name}{entry.section_name ? ` / ${entry.section_name}` : ""}</span>
              <span>{entry.course_name}</span>
              <span>
                <button
                  className="tableAction"
                  type="button"
                  onClick={() => {
                    setPendingClassNav({ classId: entry.class_id, sectionId: entry.section_id, courseId: entry.course_id });
                    onNavigate?.("attendance");
                  }}
                >
                  <ExternalLink size={14} /> {t("openClassListBtn")}
                </button>
                <button
                  className="tableAction"
                  type="button"
                  onClick={() => {
                    setPendingClassNav({ classId: entry.class_id, sectionId: entry.section_id, courseId: entry.course_id });
                    onNavigate?.("assessments");
                  }}
                >
                  <ExternalLink size={14} /> {t("assessments")}
                </button>
              </span>
            </div>
          ))}
        </div>
      </section>
      <section className="modulePanel">
        <div className="moduleHeader"><h2>Time in / time out</h2></div>
        <div className="formActions">
          <button className="primaryAction" type="button" disabled={readOnly || !!attendance?.check_in} onClick={() => void checkIn()}>
            <LogIn size={16} /> Time in
          </button>
          <button className="secondaryAction" type="button" disabled={readOnly || !attendance?.check_in || !!attendance?.check_out} onClick={() => void checkOut()}>
            <LogOut size={16} /> Time out
          </button>
        </div>
        {error && <p className="notice" style={{ color: "var(--rose)" }}>{error}</p>}
      </section>
      <section className="modulePanel">
        <div className="moduleHeader"><h2>Today's timetable</h2></div>
        {data.today_timetable.length === 0 && <p className="emptyState">No periods today.</p>}
        <ul>
          {data.today_timetable.map((slot, i) => (
            <li key={i}>{slot.start_time} – {slot.end_time} (period {slot.period})</li>
          ))}
        </ul>
      </section>
      <section className="modulePanel">
        <div className="moduleHeader"><h2>My attendance log</h2></div>
        <div className="dataTable">
          <div className="dataRow header"><span>Date</span><span>Status</span><span>Time in</span><span>Time out</span></div>
          {logs.length === 0 && <p className="emptyState">No teacher attendance logs yet.</p>}
          {logs.slice(0, 10).map((entry) => (
            <div className="dataRow" key={entry.id}>
              <span>{entry.attendance_date}</span>
              <span>{entry.status}</span>
              <span>{formatTime(entry.check_in)}</span>
              <span>{formatTime(entry.check_out)}</span>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}

function DueAssignmentRow({ assignment, onSubmitted, readOnly }: Readonly<{ assignment: StudentDashboard["due_assignments"][number]; onSubmitted: () => void; readOnly: boolean }>) {
  const { t } = useTranslation();
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const submit = async () => {
    if (!file) return;
    setError("");
    try {
      const { object_key, upload_url } = await filesApi.presignUpload({
        category: "submissions", filename: file.name, content_type: file.type || "application/octet-stream",
      });
      await fetch(upload_url, { method: "PUT", body: file, headers: { "Content-Type": file.type || "application/octet-stream" } });
      await assessmentsApi.submitAssignment(assignment.id, object_key);
      setSubmitted(true);
      onSubmitted();
    } catch (err: any) {
      setError(err.response?.data?.detail ?? t("failedSubmitAssignment"));
    }
  };

  return (
    <li>
      {assignment.title} — due {assignment.due_date.slice(0, 10)}
      {submitted ? (
        <span> — {t("submittedLabel")}</span>
      ) : (
        <>
          <Input type="file" disabled={readOnly} onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          <button className="tableAction" type="button" disabled={readOnly || !file} onClick={() => void submit()}>
            {t("submitBtn")}
          </button>
        </>
      )}
      {error && <span className="notice" style={{ color: "var(--rose)" }}>{error}</span>}
    </li>
  );
}

function StudentDashboardCards({ data, readOnly }: Readonly<{ data: StudentDashboard; readOnly: boolean }>) {
  const { t } = useTranslation();
  const [month, setMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<string | null>(toDateKey(new Date()));

  const statuses = (data.my_attendance ?? {}) as StudentDayStatus;
  const counts = Object.values(statuses).reduce(
    (acc, status) => ({ ...acc, [status]: (acc[status] ?? 0) + 1 }),
    {} as Record<string, number>
  );

  return (
    <>
      <section className="metricGrid" aria-label="Dashboard summary">
        <article className="metricCard">
          <span>{t("overallScoreLabel")}</span>
          <strong>{data.latest_result?.overall_score ?? "—"}</strong>
          <small>{data.latest_result?.published ? t("publishedLabel") : t("notPublishedLabel")}</small>
          {data.latest_result?.published && (
            <button
              className="secondaryAction"
              type="button"
              onClick={() => void assessmentsApi.downloadMyResultCard(data.latest_result!.session_id)}
            >
              {t("downloadResultCardBtn")}
            </button>
          )}
        </article>
        <article className="metricCard">
          <span>{t("dueAssignmentsHeading")}</span>
          <strong>{data.due_assignments.length}</strong>
          <small>{t("notSubmittedLabel")}</small>
        </article>
        <article className="metricCard">
          <CalendarDays size={20} />
          <span>{t("attendance")}</span>
          <strong>{counts.present ?? 0} / {Object.keys(statuses).length || "—"}</strong>
          <small>{t("attendanceSummaryLine", { absent: counts.absent ?? 0, leave: counts.leave ?? 0 })}</small>
        </article>
      </section>

      <div className="dashboardColumns">
        <section className="modulePanel">
          <div className="moduleHeader"><h2>{t("myAttendanceHeading")}</h2></div>
          <AttendanceCalendar
            month={month}
            onMonthChange={setMonth}
            selectedDate={selectedDate}
            onSelectDate={setSelectedDate}
            mode="student"
            studentDayStatus={statuses}
          />
        </section>

        <div>
          <section className="modulePanel">
            <div className="moduleHeader"><h2>{t("todaysTimetableHeading")}</h2></div>
            {data.today_timetable.length === 0 && <p className="emptyState">{t("noPeriodsToday")}</p>}
            <ul>
              {data.today_timetable.map((slot, i) => (
                <li key={i}>{slot.start_time} – {slot.end_time} ({t("periodLabel", { period: slot.period })})</li>
              ))}
            </ul>
          </section>

          <section className="modulePanel">
            <div className="moduleHeader"><h2>{t("dueAssignmentsHeading")}</h2></div>
            {data.due_assignments.length === 0 && <p className="emptyState">{t("nothingDue")}</p>}
            <ul>
              {data.due_assignments.map((a) => (
                <DueAssignmentRow key={a.id} assignment={a} readOnly={readOnly} onSubmitted={() => { /* refreshes next load */ }} />
              ))}
            </ul>
          </section>

          <section className="modulePanel">
            <div className="moduleHeader"><h2>{t("announcements")}</h2></div>
            {data.announcements.length === 0 && <p className="emptyState">{t("noAnnouncementsYet")}</p>}
            <ul>
              {data.announcements.map((a) => <li key={a.id}>{a.title}</li>)}
            </ul>
          </section>

          <section className="modulePanel">
            <div className="moduleHeader"><h2>{t("resources")}</h2></div>
            {data.resources.length === 0 && <p className="emptyState">{t("noResourcesShared")}</p>}
            <ul>
              {data.resources.map((r) => <li key={r.id}>{r.title}</li>)}
            </ul>
          </section>
        </div>
      </div>
    </>
  );
}
