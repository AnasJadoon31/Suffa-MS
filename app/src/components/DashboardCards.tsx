import { styled } from "@mui/material/styles";
import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";
import useMediaQuery from "@mui/material/useMediaQuery";
import {
  AlertTriangle,
  CalendarDays,
  CircleDollarSign,
  ClipboardCheck,
  ExternalLink,
  FileDown,
  GraduationCap,
  LogIn,
  LogOut,
  TrendingDown,
  TrendingUp,
  UserRoundCog,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";

import { AttendanceCalendar, toDateKey, type StudentDayStatus } from "./AttendanceCalendar";
import { ErrorState, LoadingState } from "./ui/AsyncState";
import { useAuth } from "../lib/AuthContext";
import { PageSection, PageHeader } from "./ui/Layout";
import { QuickActions } from "./QuickActions";
import { ActivityFeed } from "./ActivityFeed";

import {
  type DashboardData,
  type ParentChildDashboard,
  type ParentDashboard,
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

export type DashboardCardsProps = Readonly<{ onNavigate?: (view: import("../data/mockData").ViewId) => void }>;

function formatTime(value: string | null | undefined): string {
  return value ? value.slice(0, 5) : "—";
}

// ─── Styled Components ────────────────────────────────────────────────

const DashboardContainer = styled(Box)(({ theme }) => ({
  display: "flex",
  flexDirection: "column",
  gap: theme.spacing(2),
  padding: theme.spacing(2),
  [theme.breakpoints.up(768)]: {
    padding: theme.spacing(3),
    gap: theme.spacing(3),
  },
}));

const MetricGridContainer = styled(Box)(({ theme }) => ({
  display: "flex",
  gap: theme.spacing(1.5),
  overflowX: "auto",
  WebkitOverflowScrolling: "touch",
  scrollbarWidth: "none",
  paddingBottom: 4,
  "&::-webkit-scrollbar": {
    display: "none",
  },
  [theme.breakpoints.up(768)]: {
    display: "grid",
    gridTemplateColumns: "repeat(4, 1fr)",
    gap: theme.spacing(2),
    overflowX: "visible",
    paddingBottom: 0,
  },
}));

const MetricCardPaper = styled(Paper)(({ theme }) => ({
  minWidth: 160,
  flex: "0 0 auto",
  padding: theme.spacing(2),
  borderRadius: 16,
  display: "flex",
  flexDirection: "column",
  gap: theme.spacing(0.5),
  position: "relative",
  overflow: "hidden",
  border: `1px solid ${theme.palette.divider}`,
  [theme.breakpoints.up(768)]: {
    minWidth: 0,
  },
}));

const MetricIconWrapper = styled("div")<{ color: string }>(({ color }) => ({
  position: "absolute",
  top: 12,
  right: 12,
  width: 36,
  height: 36,
  borderRadius: 10,
  backgroundColor: `${color}14`,
  color: color,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
}));

const TrendRow = styled("div")({
  display: "flex",
  alignItems: "center",
  gap: 4,
  marginTop: 4,
});

// ─── Metric Card ──────────────────────────────────────────────────────

type MetricCardProps = Readonly<{
  label: string;
  value: React.ReactNode;
  icon: LucideIcon;
  iconColor: string;
  trend?: React.ReactNode;
  trendDirection?: "up" | "down" | "neutral";
}>;

function MetricCard({ label, value, icon: Icon, iconColor, trend, trendDirection }: MetricCardProps) {
  return (
    <MetricCardPaper>
      <MetricIconWrapper color={iconColor}>
        <Icon size={18} />
      </MetricIconWrapper>
      <Typography
        variant="caption"
        sx={{
          fontSize: "0.8rem",
          fontWeight: 500,
          color: "text.secondary",
          textTransform: "uppercase",
          letterSpacing: "0.04em",
        }}
      >
        {label}
      </Typography>
      <Typography
        variant="h4"
        sx={{
          fontSize: "1.75rem",
          fontWeight: 700,
          lineHeight: 1.2,
          color: "text.primary",
        }}
      >
        {value}
      </Typography>
      {trend && (
        <TrendRow>
          {trendDirection === "up" && <TrendingUp size={14} color="#3f7f4c" />}
          {trendDirection === "down" && <TrendingDown size={14} color="#b94a48" />}
          <Typography variant="caption" color="text.secondary">
            {trend}
          </Typography>
        </TrendRow>
      )}
    </MetricCardPaper>
  );
}

// ─── Main Component ───────────────────────────────────────────────────

export function DashboardCards({ onNavigate }: DashboardCardsProps) {
  const { t } = useTranslation();
  const readOnly = useSessionReadOnly();
  const [data, setData] = useState<DashboardData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const isDesktop = useMediaQuery("@media (min-width:768px)");

  useEffect(() => {
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
    <DashboardContainer>
      <QuickActions onNavigate={onNavigate} />
      {data.role === "teacher" ? (
        <TeacherDashboardCards data={data} onNavigate={onNavigate} readOnly={readOnly} isDesktop={isDesktop} />
      ) : data.role === "student" ? (
        <StudentDashboardCards data={data} readOnly={readOnly} isDesktop={isDesktop} />
      ) : data.role === "parent" ? (
        <ParentDashboardCards data={data} isDesktop={isDesktop} />
      ) : (
        <PrincipalDashboardCards data={data} isDesktop={isDesktop} />
      )}
      <ActivityFeed />
    </DashboardContainer>
  );
}

// ─── Parent Dashboard ─────────────────────────────────────────────────

function ParentDashboardCards({ data, isDesktop }: Readonly<{ data: ParentDashboard; isDesktop: boolean }>) {
  const { t } = useTranslation();
  const [selectedChildId, setSelectedChildId] = useState(data.children[0]?.id ?? "");
  const child = data.children.find((candidate) => candidate.id === selectedChildId) ?? data.children[0];

  if (!child) {
    return (
      <PageSection>
        <PageHeader title={t("myChildrenHeading")} />
        <p>{t("noLinkedChildren")}</p>
      </PageSection>
    );
  }

  const statuses = child.my_attendance as StudentDayStatus;
  const attendanceCounts = Object.values(statuses).reduce(
    (counts, status) => ({ ...counts, [status]: (counts[status] ?? 0) + 1 }),
    {} as Record<string, number>,
  );
  const paymentTotals = child.fee_summary.totals
    .map((total) => `${total.amount.toLocaleString()} ${total.currency}`)
    .join(" · ") || "—";

  return (
    <>
      <PageSection>
        <PageHeader title={t("myChildrenHeading")} notice={t("guardianDashboardHint")} />
        <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }} role="tablist" aria-label={t("childSwitcherLabel")}>
          {data.children.map((candidate) => (
            <Box
              key={candidate.id}
              role="tab"
              aria-selected={candidate.id === child.id}
              onClick={() => setSelectedChildId(candidate.id)}
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 1,
                padding: "8px 14px",
                borderRadius: 999,
                cursor: "pointer",
                backgroundColor: candidate.id === child.id ? "primary.main" : "background.paper",
                color: candidate.id === child.id ? "primary.contrastText" : "text.primary",
                border: 1,
                borderColor: candidate.id === child.id ? "primary.main" : "divider",
                fontWeight: 600,
                fontSize: "0.85rem",
                "&:hover": { backgroundColor: candidate.id === child.id ? "primary.dark" : "action.hover" },
              }}
            >
              <GraduationCap size={16} />
              <span>
                <strong>{candidate.name}</strong>
              </span>
            </Box>
          ))}
        </Box>
      </PageSection>

      <MetricGridContainer>
        <MetricCard
          label={t("classLabel")}
          value={child.current_class ?? "—"}
          icon={GraduationCap}
          iconColor="#0f766e"
          trend={`${t("admissionNumberCol")}: ${child.admission_number}`}
        />
        <MetricCard
          label={t("attendance")}
          value={`${attendanceCounts.present ?? 0} / ${Object.keys(statuses).length || "—"}`}
          icon={ClipboardCheck}
          iconColor="#3f7f4c"
          trend={t("attendanceSummaryLine", { absent: attendanceCounts.absent ?? 0, leave: attendanceCounts.leave ?? 0 })}
        />
        <MetricCard
          label={t("overallScoreLabel")}
          value={child.latest_result?.overall_score ?? "—"}
          icon={TrendingUp}
          iconColor="#c77d1a"
          trend={child.latest_result ? t("publishedLabel") : t("notPublishedLabel")}
        />
        <MetricCard
          label={t("feesPaidLabel")}
          value={paymentTotals}
          icon={CircleDollarSign}
          iconColor="#c77d1a"
          trend={t("paymentCount", { count: child.payments.length })}
        />
      </MetricGridContainer>

      <Box sx={{ display: isDesktop ? "grid" : "flex", gridTemplateColumns: "1fr 1fr", gap: 2, flexDirection: "column" }}>
        <StudentAttendancePanel
          title={t("attendanceForStudentLabel", { name: child.name })}
          statuses={statuses}
          periods={child.my_attendance_periods}
        />

        <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <ParentResults child={child} />

          <PageSection>
            <PageHeader title={t("feeHistoryHeading")} />
            {child.payments.length === 0 && <p>{t("noPaymentsYet")}</p>}
            <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
              {child.payments.map((payment) => (
                <Box key={payment.id} sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: 1, borderColor: "divider" }}>
                  <span><strong>{payment.category}</strong><br /><small>{payment.note}</small></span>
                  <span>{payment.payment_date}</span>
                  <span><strong>{payment.amount.toLocaleString()} {payment.currency}</strong></span>
                </Box>
              ))}
            </Box>
          </PageSection>

          <PageSection>
            <PageHeader title={t("todaysTimetableHeading")} />
            {child.today_timetable.length === 0 && <p>{t("noPeriodsToday")}</p>}
            <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
              {child.today_timetable.map((slot, index) => (
                <Box key={`${slot.course_id}-${slot.period}-${index}`} sx={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: 1, borderColor: "divider" }}>
                  <span><strong>{t("periodLabel", { period: slot.period })}</strong></span>
                  <span>{slot.start_time} – {slot.end_time}</span>
                </Box>
              ))}
            </Box>
          </PageSection>

          <PageSection>
            <PageHeader title={t("dueAssignmentsHeading")} />
            {child.due_assignments.length === 0 && <p>{t("nothingDue")}</p>}
            <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
              {child.due_assignments.map((assignment) => (
                <Box key={assignment.id} sx={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: 1, borderColor: "divider" }}>
                  <span><strong>{assignment.title}</strong></span>
                  <span>{assignment.due_date.slice(0, 10)}</span>
                </Box>
              ))}
            </Box>
          </PageSection>

          <PageSection>
            <PageHeader title={t("announcements")} />
            {child.announcements.length === 0 && <p>{t("noAnnouncementsYet")}</p>}
            <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
              {child.announcements.map((announcement) => (
                <Box key={announcement.id} sx={{ padding: "8px 0", borderBottom: 1, borderColor: "divider" }}>
                  <span><strong>{announcement.title}</strong><br /><small>{announcement.body}</small></span>
                </Box>
              ))}
            </Box>
          </PageSection>

          <PageSection>
            <PageHeader title={t("forms")} notice={t("wardFormsHint", { name: child.name })} />
            {child.forms.length === 0 && <p>{t("noFormsYet")}</p>}
            <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
              {child.forms.map((form) => (
                <Box key={form.id} sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: 1, borderColor: "divider" }}>
                  <span>
                    <strong>{form.title}</strong>
                    <br />
                    <small>{form.description || form.category || t("forms")}</small>
                  </span>
                  <span>{form.open_until ? form.open_until.slice(0, 10) : t("openBtn")}</span>
                  <Link to="/forms">{t("openBtn")}</Link>
                </Box>
              ))}
            </Box>
          </PageSection>

          <PageSection>
            <PageHeader title={t("resources")} />
            {child.resources.length === 0 && <p>{t("noResourcesShared")}</p>}
            <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
              {child.resources.map((resource) => (
                <Box key={resource.id} sx={{ padding: "8px 0", borderBottom: 1, borderColor: "divider" }}>
                  <span><strong>{resource.title}</strong></span>
                </Box>
              ))}
            </Box>
          </PageSection>
        </Box>
      </Box>
    </>
  );
}

function ParentResults({ child }: Readonly<{ child: ParentChildDashboard }>) {
  const { t } = useTranslation();
  const results = child.latest_result?.course_results ?? [];
  return (
    <PageSection>
      <PageHeader title={t("latestResultsHeading")} />
      {results.length === 0 && <p>{t("noPublishedResults")}</p>}
      <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
        {results.map((result) => (
          <Box key={result.course_id} sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: 1, borderColor: "divider" }}>
            <span><strong>{result.course_name ?? t("courseLabel")}</strong></span>
            <span>{result.raw_score == null ? "—" : `${result.raw_score}%`}</span>
            <span>{result.band ?? "—"}</span>
          </Box>
        ))}
      </Box>
    </PageSection>
  );
}

function StudentAttendancePanel({
  title,
  statuses,
  periods,
}: Readonly<{
  title: string;
  statuses: StudentDayStatus;
  periods: StudentDashboard["my_attendance_periods"];
}>) {
  const { t } = useTranslation();
  const [month, setMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<string | null>(toDateKey(new Date()));
  const selectedPeriods = periods.filter((entry) => entry.date === selectedDate);
  return (
    <PageSection>
      <PageHeader title={title} />
      <AttendanceCalendar
        month={month}
        onMonthChange={setMonth}
        selectedDate={selectedDate}
        onSelectDate={setSelectedDate}
        mode="student"
        studentDayStatus={statuses}
      />
      {selectedDate && (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 1, marginTop: 2 }}>
          {selectedPeriods.length === 0 && <p>{t("noAttendanceHistory")}</p>}
          {selectedPeriods.map((entry, index) => (
            <Box key={entry.timetable_slot_id ?? `${entry.date}-legacy-${index}`} sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: 1, borderColor: "divider" }}>
              <span><strong>{entry.legacy_general ? t("legacyGeneralAttendance") : entry.course_name}</strong></span>
              <span>{entry.legacy_general ? "—" : t("periodLabel", { period: entry.period })}</span>
              <span>{t(entry.status)}</span>
            </Box>
          ))}
        </Box>
      )}
    </PageSection>
  );
}

// ─── Principal Dashboard ──────────────────────────────────────────────

function PrincipalDashboardCards({ data, isDesktop }: Readonly<{ data: PrincipalDashboard; isDesktop: boolean }>) {
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
      color: "#0f766e",
      trendDirection: "up" as const,
    },
    {
      label: t("teachers"),
      value: String(teacherCount),
      detail: t("activeTeacherProfiles"),
      icon: UserRoundCog,
      color: "#3f7f4c",
      trendDirection: "neutral" as const,
    },
    {
      label: t("todayAttendance"),
      value: `${data.attendance.present} / ${attendanceRosterTotal || "—"}`,
      detail: attendanceDetail,
      icon: ClipboardCheck,
      color: "#0f766e",
      trendDirection: "up" as const,
    },
    {
      label: t("missingSync"),
      value: String(data.attendance.missing_sync_teachers),
      detail: t("teachersWithoutTodayMark"),
      icon: AlertTriangle,
      color: "#c77d1a",
      trendDirection: data.attendance.missing_sync_teachers > 0 ? ("down" as const) : ("neutral" as const),
    },
    {
      label: t("monthlyIncome"),
      value: `${data.finance.month_total.toLocaleString()} ${data.finance.currency}`,
      detail: t("contributionsAndDonations"),
      icon: CircleDollarSign,
      color: "#c77d1a",
      trendDirection: "up" as const,
    },
  ];

  return (
    <>
      <MetricGridContainer>
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <MetricCard
              key={card.label}
              label={card.label}
              value={card.value}
              icon={Icon}
              iconColor={card.color}
              trend={card.detail}
              trendDirection={card.trendDirection}
            />
          );
        })}
      </MetricGridContainer>
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

// ─── Teacher Dashboard ────────────────────────────────────────────────

function TeacherDashboardCards({ data, onNavigate, readOnly, isDesktop }: Readonly<{ data: TeacherDashboard; onNavigate?: (view: import("../data/mockData").ViewId) => void; readOnly: boolean; isDesktop: boolean }>) {
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
      <MetricGridContainer>
        <MetricCard
          label={t("myClassesHeading")}
          value={data.my_classes.length}
          icon={GraduationCap}
          iconColor="#0f766e"
          trend={data.my_classes.map((c) => `${c.class_name} · ${c.course_name}`).join(", ") || t("noAssignmentsYet")}
        />
        <MetricCard
          label={t("pendingSubmissionsHeading")}
          value={data.pending_submissions}
          icon={ClipboardCheck}
          iconColor="#c77d1a"
          trend={t("ungradedAcrossClasses")}
          trendDirection={data.pending_submissions > 0 ? "down" : "neutral"}
        />
        <MetricCard
          label={t("todayAttendance")}
          value={attendance?.check_in ? formatTime(attendance.check_in) : t("notCheckedIn")}
          icon={LogIn}
          iconColor="#3f7f4c"
          trend={t("checkedOutAt", { time: formatTime(attendance?.check_out) })}
        />
      </MetricGridContainer>
      <PageSection>
        <PageHeader title={t("myClassesHeading")} />
        {data.my_classes.length === 0 && <p>{t("noCoursesAssigned")}</p>}
        <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
          {data.my_classes.map((entry, index) => (
            <Box key={index} sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: 1, borderColor: "divider", flexWrap: "wrap", gap: 1 }}>
              <span>{entry.class_name}{entry.section_name ? ` / ${entry.section_name}` : ""}</span>
              <span>{entry.course_name}</span>
              <Box sx={{ display: "flex", gap: 1 }}>
                <button
                  type="button"
                  onClick={() => {
                    setPendingClassNav({ classId: entry.class_id, sectionId: entry.section_id, courseId: entry.course_id });
                    onNavigate?.("attendance");
                  }}
                  style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "6px 12px", borderRadius: 999, border: "1px solid #e0e6df", background: "transparent", cursor: "pointer", fontSize: "0.8rem" }}
                >
                  <ExternalLink size={14} /> {t("openClassListBtn")}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPendingClassNav({ classId: entry.class_id, sectionId: entry.section_id, courseId: entry.course_id });
                    onNavigate?.("assessments");
                  }}
                  style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "6px 12px", borderRadius: 999, border: "1px solid #e0e6df", background: "transparent", cursor: "pointer", fontSize: "0.8rem" }}
                >
                  <ExternalLink size={14} /> {t("assessments")}
                </button>
              </Box>
            </Box>
          ))}
        </Box>
      </PageSection>
      <PageSection>
        <PageHeader title={t("timeInOutHeading")} />
        <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
          <button
            type="button"
            disabled={readOnly || !!attendance?.check_in}
            onClick={() => checkIn()}
            style={{
              display: "inline-flex", alignItems: "center", gap: 6, padding: "10px 20px", borderRadius: 999,
              border: "none", backgroundColor: readOnly || attendance?.check_in ? "#e0e6df" : "#0f766e",
              color: readOnly || attendance?.check_in ? "#9bb8b0" : "#fff", cursor: readOnly || attendance?.check_in ? "not-allowed" : "pointer",
              fontWeight: 600, fontSize: "0.875rem",
            }}
          >
            <LogIn size={16} /> {t("timeInLabel")}
          </button>
          <button
            type="button"
            disabled={readOnly || !attendance?.check_in || !!attendance?.check_out}
            onClick={() => checkOut()}
            style={{
              display: "inline-flex", alignItems: "center", gap: 6, padding: "10px 20px", borderRadius: 999,
              border: "1px solid #e0e6df", backgroundColor: readOnly || !attendance?.check_in || attendance?.check_out ? "transparent" : "#fff",
              color: readOnly || !attendance?.check_in || attendance?.check_out ? "#9bb8b0" : "#16211d",
              cursor: readOnly || !attendance?.check_in || attendance?.check_out ? "not-allowed" : "pointer",
              fontWeight: 600, fontSize: "0.875rem",
            }}
          >
            <LogOut size={16} /> {t("timeOutLabel")}
          </button>
        </Box>
        {error && <p style={{ color: "#b94a48" }}>{error}</p>}
      </PageSection>
      <PageSection>
        <PageHeader title={t("todaysTimetableHeading")} />
        {data.today_timetable.length === 0 && <p>{t("noPeriodsToday")}</p>}
        <ul>
          {data.today_timetable.map((slot, i) => (
            <li key={i}>{slot.start_time} – {slot.end_time} ({t("periodLabel", { period: slot.period })})</li>
          ))}
        </ul>
      </PageSection>
      <PageSection>
        <PageHeader title={t("myAttendanceLogHeading")} />
        <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
          <Box sx={{ display: "flex", justifyContent: "space-between", padding: "8px 0", fontWeight: 700, fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.08em", borderBottom: 2, borderColor: "divider" }}>
            <span>{t("dateCol")}</span>
            <span>{t("statusCol")}</span>
            <span>{t("timeInLabel")}</span>
            <span>{t("timeOutLabel")}</span>
          </Box>
          {logs.length === 0 && <p>{t("noTeacherAttendanceLogs")}</p>}
          {logs.slice(0, 10).map((entry) => (
            <Box key={entry.id} sx={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: 1, borderColor: "divider" }}>
              <span>{entry.attendance_date}</span>
              <span>{t(entry.status)}</span>
              <span>{formatTime(entry.check_in)}</span>
              <span>{formatTime(entry.check_out)}</span>
            </Box>
          ))}
        </Box>
      </PageSection>
    </>
  );
}

// ─── Student Dashboard ────────────────────────────────────────────────

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
    <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: 1, borderColor: "divider", flexWrap: "wrap", gap: 1 }}>
      <span style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <strong>{assignment.title}</strong>
        <span>Due {assignment.due_date.slice(0, 10)}</span>
        {assignment.feedback && (
          <span style={{ color: "#0f766e", marginTop: 4 }}>
            <strong>{t("remarksLabel", "Remarks")}:</strong> {assignment.feedback}
          </span>
        )}
      </span>
      <span style={{ display: "flex", gap: 8, alignItems: "center" }}>
        {submitted ? (
          <span style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-end" }}>
            <span>{t("submittedLabel")}</span>
            {assignment.mark !== undefined && assignment.mark !== null && assignment.max_marks && (
              <span>{assignment.mark} / {assignment.max_marks}</span>
            )}
            {submittedFileKey && (
              <button
                type="button"
                onClick={async () => {
                  const { url } = await filesApi.presignDownload(submittedFileKey);
                  window.open(url, "_blank", "noreferrer");
                }}
                style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "6px 12px", borderRadius: 999, border: "1px solid #e0e6df", background: "transparent", cursor: "pointer", fontSize: "0.8rem" }}
              >
                <FileDown size={14} /> {t("downloadBtn")}
              </button>
            )}
          </span>
        ) : (
          <>
            <Input type="file" disabled={readOnly} onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            <button
              type="button"
              disabled={readOnly || !file}
              onClick={() => submit()}
              style={{
                display: "inline-flex", alignItems: "center", gap: 6, padding: "10px 20px", borderRadius: 999,
                border: "none", backgroundColor: readOnly || !file ? "#e0e6df" : "#0f766e",
                color: readOnly || !file ? "#9bb8b0" : "#fff", cursor: readOnly || !file ? "not-allowed" : "pointer",
                fontWeight: 600, fontSize: "0.875rem",
              }}
            >
              {t("submitBtn")}
            </button>
          </>
        )}
      </span>
      {error && <span style={{ color: "#b94a48", width: "100%" }}>{error}</span>}
    </Box>
  );
}

function StudentDashboardCards({ data, readOnly, isDesktop }: Readonly<{ data: StudentDashboard; readOnly: boolean; isDesktop: boolean }>) {
  const { t } = useTranslation();

  const statuses = (data.my_attendance ?? {}) as StudentDayStatus;
  const counts = Object.values(statuses).reduce(
    (acc, status) => ({ ...acc, [status]: (acc[status] ?? 0) + 1 }),
    {} as Record<string, number>
  );

  return (
    <>
      <MetricGridContainer>
        <MetricCard
          label={t("overallScoreLabel")}
          value={data.latest_result?.overall_score ?? "—"}
          icon={TrendingUp}
          iconColor="#c77d1a"
          trend={data.latest_result?.published ? t("publishedLabel") : t("notPublishedLabel")}
        />
        <MetricCard
          label={t("dueAssignmentsHeading")}
          value={data.due_assignments.length}
          icon={ClipboardCheck}
          iconColor="#0f766e"
          trend={t("notSubmittedLabel")}
          trendDirection={data.due_assignments.length > 0 ? "down" : "neutral"}
        />
        <MetricCard
          label={t("attendance")}
          value={`${counts.present ?? 0} / ${Object.keys(statuses).length || "—"}`}
          icon={CalendarDays}
          iconColor="#3f7f4c"
          trend={t("attendanceSummaryLine", { absent: counts.absent ?? 0, leave: counts.leave ?? 0 })}
        />
      </MetricGridContainer>

      <Box sx={{ display: isDesktop ? "grid" : "flex", gridTemplateColumns: "1fr 1fr", gap: 2, flexDirection: "column" }}>
        <StudentAttendancePanel
          title={t("myAttendanceHeading")}
          statuses={statuses}
          periods={data.my_attendance_periods ?? []}
        />

        <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <PageSection>
            <PageHeader title={t("todaysTimetableHeading")} />
            {data.today_timetable.length === 0 && <p>{t("noPeriodsToday")}</p>}
            <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
              {data.today_timetable.map((slot, i) => (
                <Box key={i} sx={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: 1, borderColor: "divider" }}>
                  <span><strong>{t("periodLabel", { period: slot.period })}</strong></span>
                  <span>{slot.start_time} – {slot.end_time}</span>
                </Box>
              ))}
            </Box>
          </PageSection>

          <PageSection>
            <PageHeader title={t("dueAssignmentsHeading")} />
            {data.due_assignments.length === 0 && <p>{t("nothingDue")}</p>}
            <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
              {data.due_assignments.map((a) => (
                <DueAssignmentRow key={a.id} assignment={a} readOnly={readOnly} onSubmitted={() => { /* refreshes next load */ }} />
              ))}
            </Box>
          </PageSection>

          <PageSection>
            <PageHeader title={t("announcements")} />
            {data.announcements.length === 0 && <p>{t("noAnnouncementsYet")}</p>}
            <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
              {data.announcements.map((a) => (
                <Box key={a.id} sx={{ padding: "8px 0", borderBottom: 1, borderColor: "divider" }}>
                  <span>{a.title}</span>
                </Box>
              ))}
            </Box>
          </PageSection>

          <PageSection>
            <PageHeader title={t("resources")} />
            {data.resources.length === 0 && <p>{t("noResourcesShared")}</p>}
            <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
              {data.resources.map((r) => (
                <Box key={r.id} sx={{ padding: "8px 0", borderBottom: 1, borderColor: "divider" }}>
                  <span>{r.title}</span>
                </Box>
              ))}
            </Box>
          </PageSection>
        </Box>
      </Box>
    </>
  );
}
