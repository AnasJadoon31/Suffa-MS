import { Button } from "./ui/Button";
import { AlertTriangle, CalendarDays, CircleDollarSign, ClipboardCheck, ExternalLink, FileDown, GraduationCap, LogIn, LogOut, UserRoundCog } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import { AttendanceCalendar, toDateKey, type StudentDayStatus } from "./AttendanceCalendar";
import { ErrorState, LoadingState } from "./ui/AsyncState";
import { isNavItemAccessible, navItems, type ViewId } from "../data/mockData";
import { useAuth } from "../lib/AuthContext";
import { PageSection, PageHeader } from "./ui/Layout";
import { MetricGrid, MetricCard } from "./ui/Card";

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
  const priorityViews: ViewId[] = ["attendance", "timetable", "announcements", "assessments", "people", "finance"];
  const visible = navItems.filter(
    (item) => item.id !== "dashboard" && isNavItemAccessible(item, user?.role, hasPermission, hasFeature, user?.has_teaching_assignment, user?.is_principal_delegate),
  ).sort((a, b) => priorityViews.indexOf(a.id) - priorityViews.indexOf(b.id))
    .filter((item) => priorityViews.includes(item.id));
  return (
    <nav className="quickLinks" aria-label={t("quickLinksLabel")}>
      {visible.map((item) => {
        const Icon = item.icon;
        return (
          <Button key={item.id} type="button" className="quickLink" onClick={() => onNavigate(item.id)}>
            <Icon size={18} />
            <span>{t(item.labelKey)}</span>
          </Button>
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
    ? t("presentMarkedSummary", {
        percent: Math.round((data.attendance.present / attendanceRosterTotal) * 100),
        marked: markedAttendanceTotal,
        total: attendanceRosterTotal,
      })
    : t("noActiveRoster");
  const cards = [
    {
      label: t("students"),
      value: String(studentCount),
      detail: t("activeClassesCount", { count: data.counts.classes }),
      icon: GraduationCap,
    },
    {
      label: t("teachers"),
      value: String(teacherCount),
      detail: t("activeTeacherProfiles"),
      icon: UserRoundCog,
    },
    {
      label: t("todayAttendance"),
      value: `${data.attendance.present} / ${attendanceRosterTotal || "—"}`,
      detail: attendanceDetail,
      icon: ClipboardCheck,
    },
    { label: t("missingSync"), value: String(data.attendance.missing_sync_teachers), detail: t("teachersWithoutTodayMark"), icon: AlertTriangle },
    { label: t("monthlyIncome"), value: `${data.finance.month_total.toLocaleString()} ${data.finance.currency}`, detail: t("contributionsAndDonations"), icon: CircleDollarSign },
  ];

  return (
    <>
      <MetricGrid aria-label={t("dashboardSummaryLabel")}>
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <MetricCard
              key={card.label}
              title={
                <>
                  <Icon size={20} /> {card.label}
                </>
              }
              value={card.value}
              trend={<small>{card.detail}</small>}
            />
          );
        })}
      </MetricGrid>
      {data.attendance.missing_sync_teacher_list.length > 0 && (
        <PageSection>
          <PageHeader title={t("missingAttendanceSyncHeading")} />
          <ul>
            {data.attendance.missing_sync_teacher_list.map((teacher) => <li key={teacher.id}>{teacher.name}</li>)}
          </ul>
        </PageSection>
      )}
      {data.activity.length > 0 && (
        <PageSection>
          <PageHeader title={t("recentActivityHeading")} />
          <ul>
            {data.activity.map((line) => <li key={line}>{line}</li>)}
          </ul>
        </PageSection>
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
      setError(err.response?.data?.detail ?? t("failedCheckIn"));
    }
  };

  const checkOut = async () => {
    setError("");
    try {
      setAttendance(await attendanceApi.teacherCheckOut());
      await loadLogs();
    } catch (err: any) {
      setError(err.response?.data?.detail ?? t("failedCheckOut"));
    }
  };

  return (
    <>
      <MetricGrid aria-label={t("dashboardSummaryLabel")}>
        <MetricCard
          title={t("myClassesHeading")}
          value={data.my_classes.length}
          trend={<small>{data.my_classes.map((c) => `${c.class_name} · ${c.course_name}`).join(", ") || t("noAssignmentsYet")}</small>}
        />
        <MetricCard
          title={t("pendingSubmissionsHeading")}
          value={data.pending_submissions}
          trend={<small>{t("ungradedAcrossClasses")}</small>}
        />
        <MetricCard
          title={t("todayAttendance")}
          value={attendance?.check_in ? formatTime(attendance.check_in) : t("notCheckedIn")}
          trend={<small>{t("checkedOutAt", { time: formatTime(attendance?.check_out) })}</small>}
        />
      </MetricGrid>
      <PageSection>
        <PageHeader title={t("myClassesHeading")} />
        {data.my_classes.length === 0 && <p className="emptyState">{t("noCoursesAssigned")}</p>}
        <div className="dataTable">
          {data.my_classes.map((entry, index) => (
            <div className="dataRow" key={index}>
              <span>{entry.class_name}{entry.section_name ? ` / ${entry.section_name}` : ""}</span>
              <span>{entry.course_name}</span>
              <span>
                <Button
                  className="tableAction"
                  type="button"
                  onClick={() => {
                    setPendingClassNav({ classId: entry.class_id, sectionId: entry.section_id, courseId: entry.course_id });
                    onNavigate?.("attendance");
                  }}
                >
                  <ExternalLink size={14} /> {t("openClassListBtn")}
                </Button>
                <Button
                  className="tableAction"
                  type="button"
                  onClick={() => {
                    setPendingClassNav({ classId: entry.class_id, sectionId: entry.section_id, courseId: entry.course_id });
                    onNavigate?.("assessments");
                  }}
                >
                  <ExternalLink size={14} /> {t("assessments")}
                </Button>
              </span>
            </div>
          ))}
        </div>
      </PageSection>
      <PageSection>
        <PageHeader title={t("timeInOutHeading")} />
        <div className="formActions">
          <Button className="primaryAction" type="button" disabled={readOnly || !!attendance?.check_in} onClick={() => checkIn()}>
            <LogIn size={16} /> {t("timeInLabel")}
          </Button>
          <Button className="secondaryAction" type="button" disabled={readOnly || !attendance?.check_in || !!attendance?.check_out} onClick={() => checkOut()}>
            <LogOut size={16} /> {t("timeOutLabel")}
          </Button>
        </div>
        {error && <p className="notice" style={{ color: "var(--rose)" }}>{error}</p>}
      </PageSection>
      <PageSection>
        <PageHeader title={t("todaysTimetableHeading")} />
        {data.today_timetable.length === 0 && <p className="emptyState">{t("noPeriodsToday")}</p>}
        <ul>
          {data.today_timetable.map((slot, i) => (
            <li key={i}>{slot.start_time} – {slot.end_time} ({t("periodLabel", { period: slot.period })})</li>
          ))}
        </ul>
      </PageSection>
      <PageSection>
        <PageHeader title={t("myAttendanceLogHeading")} />
        <div className="dataTable">
          <div className="dataRow header"><span>{t("dateCol")}</span><span>{t("statusCol")}</span><span>{t("timeInLabel")}</span><span>{t("timeOutLabel")}</span></div>
          {logs.length === 0 && <p className="emptyState">{t("noTeacherAttendanceLogs")}</p>}
          {logs.slice(0, 10).map((entry) => (
            <div className="dataRow" key={entry.id}>
              <span>{entry.attendance_date}</span>
              <span>{t(entry.status)}</span>
              <span>{formatTime(entry.check_in)}</span>
              <span>{formatTime(entry.check_out)}</span>
            </div>
          ))}
        </div>
      </PageSection>
    </>
  );
}

function DueAssignmentRow({ assignment, onSubmitted, readOnly }: Readonly<{ assignment: StudentDashboard["due_assignments"][number]; onSubmitted: () => void; readOnly: boolean }>) {
  const { t } = useTranslation();
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState("");
  const [submitted, setSubmitted] = useState(assignment.submitted ?? false);
  const [submittedFileKey, setSubmittedFileKey] = useState(assignment.file_key ?? null);

  const submit = async () => {
    if (!file) return;
    setError("");
    try {
      const { object_key, upload_url } = await filesApi.presignUpload({
        category: "submissions", filename: file.name, content_type: file.type || "application/octet-stream", size_bytes: file.size,
      });
      await fetch(upload_url, { method: "PUT", body: file, headers: { "Content-Type": file.type || "application/octet-stream" } });
      await assessmentsApi.submitAssignment(assignment.id, object_key);
      setSubmitted(true);
      setSubmittedFileKey(object_key);
      onSubmitted();
    } catch (err: any) {
      setError(err.response?.data?.detail ?? t("failedSubmitAssignment"));
    }
  };

  return (
    <div className="dataRow">
      <span style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <strong>{assignment.title}</strong>
        <span className="notice">Due {assignment.due_date.slice(0, 10)}</span>
        {assignment.feedback && (
          <span className="notice" style={{ color: "var(--primary)", marginTop: 4 }}>
            <strong>{t("remarksLabel", "Remarks")}:</strong> {assignment.feedback}
          </span>
        )}
      </span>
      <span style={{ display: "flex", gap: 8, alignItems: "center" }}>
        {submitted ? (
          <span style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-end" }}>
            <span className="notice">{t("submittedLabel")}</span>
            {assignment.mark !== undefined && assignment.mark !== null && assignment.max_marks && (
              <span className="badge success">{assignment.mark} / {assignment.max_marks}</span>
            )}
            {submittedFileKey && (
              <Button
                className="tableAction"
                type="button"
                onClick={async () => {
                  const { url } = await filesApi.presignDownload(submittedFileKey);
                  window.open(url, "_blank", "noreferrer");
                }}
              >
                <FileDown size={14} /> {t("downloadBtn")}
              </Button>
            )}
          </span>
        ) : (
          <>
            <Input type="file" disabled={readOnly} onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            <Button className="primaryAction" type="button" disabled={readOnly || !file} onClick={() => submit()}>
              {t("submitBtn")}
            </Button>
          </>
        )}
      </span>
      {error && <span className="notice" style={{ color: "var(--rose)", width: "100%" }}>{error}</span>}
    </div>
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
  const selectedPeriods = (data.my_attendance_periods ?? []).filter((entry) => entry.date === selectedDate);

  return (
    <>
      <MetricGrid aria-label={t("dashboardSummaryLabel")}>
        <MetricCard
          title={t("overallScoreLabel")}
          value={data.latest_result?.overall_score ?? "—"}
          trend={<small>{data.latest_result?.published ? t("publishedLabel") : t("notPublishedLabel")}</small>}
        >
          {data.latest_result?.published && (
            <Button
              className="secondaryAction"
              type="button"
              onClick={() => assessmentsApi.downloadMyResultCard(data.latest_result!.session_id)}
            >
              {t("downloadResultCardBtn")}
            </Button>
          )}
        </MetricCard>
        <MetricCard
          title={t("dueAssignmentsHeading")}
          value={data.due_assignments.length}
          trend={<small>{t("notSubmittedLabel")}</small>}
        />
        <MetricCard
          title={
            <>
              <CalendarDays size={20} /> {t("attendance")}
            </>
          }
          value={`${counts.present ?? 0} / ${Object.keys(statuses).length || "—"}`}
          trend={<small>{t("attendanceSummaryLine", { absent: counts.absent ?? 0, leave: counts.leave ?? 0 })}</small>}
        />
      </MetricGrid>

      <div className="dashboardColumns">
        <PageSection>
          <PageHeader title={t("myAttendanceHeading")} />
          <AttendanceCalendar
            month={month}
            onMonthChange={setMonth}
            selectedDate={selectedDate}
            onSelectDate={setSelectedDate}
            mode="student"
            studentDayStatus={statuses}
          />
          {selectedDate && (
            <div className="dataTable dashboardPeriodAttendance">
              {selectedPeriods.length === 0 && <p className="emptyState">{t("noAttendanceHistory")}</p>}
              {selectedPeriods.map((entry, index) => (
                <div className="dataRow" key={entry.timetable_slot_id ?? `${entry.date}-legacy-${index}`}>
                  <span><strong>{entry.legacy_general ? t("legacyGeneralAttendance") : entry.course_name}</strong></span>
                  <span>{entry.legacy_general ? "—" : t("periodLabel", { period: entry.period })}</span>
                  <span className={`statusPill ${entry.status}`}>{t(entry.status)}</span>
                </div>
              ))}
            </div>
          )}
        </PageSection>

        <div>
          <PageSection>
            <PageHeader title={t("todaysTimetableHeading")} />
            {data.today_timetable.length === 0 && <p className="emptyState">{t("noPeriodsToday")}</p>}
            <div className="dataTable">
              {data.today_timetable.map((slot, i) => (
                <div className="dataRow" key={i}>
                  <span><strong>{t("periodLabel", { period: slot.period })}</strong></span>
                  <span>{slot.start_time} – {slot.end_time}</span>
                </div>
              ))}
            </div>
          </PageSection>

          <PageSection>
            <PageHeader title={t("dueAssignmentsHeading")} />
            {data.due_assignments.length === 0 && <p className="emptyState">{t("nothingDue")}</p>}
            <div className="dataTable">
              {data.due_assignments.map((a) => (
                <DueAssignmentRow key={a.id} assignment={a} readOnly={readOnly} onSubmitted={() => { /* refreshes next load */ }} />
              ))}
            </div>
          </PageSection>

          <PageSection>
            <PageHeader title={t("announcements")} />
            {data.announcements.length === 0 && <p className="emptyState">{t("noAnnouncementsYet")}</p>}
            <div className="dataTable">
              {data.announcements.map((a) => (
                <div className="dataRow" key={a.id}>
                  <span>{a.title}</span>
                </div>
              ))}
            </div>
          </PageSection>

          <PageSection>
            <PageHeader title={t("resources")} />
            {data.resources.length === 0 && <p className="emptyState">{t("noResourcesShared")}</p>}
            <div className="dataTable">
              {data.resources.map((r) => (
                <div className="dataRow" key={r.id}>
                  <span>{r.title}</span>
                </div>
              ))}
            </div>
          </PageSection>
        </div>
      </div>
    </>
  );
}
