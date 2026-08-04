import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import {
  BookOpen,
  CalendarClock,
  ClipboardList,
  GraduationCap,
  LogIn,
  LogOut,
  Users,
  Wallet,
} from "lucide-react";

import { AppShell } from "@/components/app/AppShell";
import {
  Card,
  EmptyState,
  Pill,
  SectionTitle,
  SkeletonList,
  StatCard,
} from "@/components/app/Primitives";
import { useAuth } from "@/lib/mms/auth";
import {
  academicsApi,
  attendanceApi,
  reportingApi,
  type PrincipalDashboard,
  type StudentDashboard,
  type TeacherDashboard,
} from "@/lib/mms/endpoints";
import { useTranslation } from "react-i18next";

export const Route = createFileRoute("/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — Suffa MS" },
      { name: "description", content: "Today's attendance, classes and timetable at a glance." },
      { property: "og:title", content: "Dashboard — Suffa MS" },
      {
        property: "og:description",
        content: "Today's attendance, classes and timetable at a glance.",
      },
    ],
  }),
  component: DashboardPage,
});

function DashboardPage() {
    const { t } = useTranslation();
  const { user, madrasa } = useAuth();

  const today = useQuery({
    queryKey: ["today"],
    queryFn: () => academicsApi.today(),
    enabled: Boolean(user),
  });

  const dashboard = useQuery({
    queryKey: ["dashboard"],
    queryFn: () => reportingApi.dashboard(),
    enabled: Boolean(user),
  });

  const data = dashboard.data;

  return (
    <AppShell
      title={`${t("Assalamu alaikum")}, ${user?.username ?? ""}`}
      subtitle={
        today.data ? `${today.data.hijri} · ${today.data.gregorian}` : (madrasa?.name ?? "Suffa MS")
      }
      right={
        <span className="rounded-full bg-primary-foreground/15 px-3 py-1 text-[0.68rem] font-bold uppercase tracking-wider">
          {t(user?.role?.replace("_", " ") ?? "")}
        </span>
      }
    >
      {dashboard.isLoading ? <SkeletonList rows={4} /> : null}
      {dashboard.isError ? (
        <EmptyState title={t("Couldn't load your dashboard")} hint="Pull down or retry in a moment." />
      ) : null}

      {data?.role === "principal" ? <PrincipalView data={data as PrincipalDashboard} /> : null}
      {data?.role === "teacher" && !user?.is_principal_delegate ? <TeacherView data={data as TeacherDashboard} /> : null}
      {data?.role === "teacher" && user?.is_principal_delegate ? <PrincipalView data={data as PrincipalDashboard} /> : null}
      {data?.role === "student" ? <StudentView data={data as StudentDashboard} /> : null}
      {data && !["principal", "teacher", "student"].includes(data.role) ? <FallbackView /> : null}
    </AppShell>
  );
}

function FallbackView() {
    const { t } = useTranslation();
  const shortcuts = [
    { to: "/attendance", label: "Attendance", hint: "Check daily records and history" },
    { to: "/forms", label: "Forms", hint: "Open active form workflows" },
    { to: "/announcements", label: "Announcements", hint: "See current notices" },
    { to: "/me", label: "My Profile", hint: "Manage your account and session" },
  ];

  return (
    <>
      <EmptyState
        title={t("Portal ready")}
        hint="Your role does not have a custom home card yet, but the core routes are available."
      />
      <SectionTitle>{t("Shortcuts")}</SectionTitle>
      <div className="space-y-2.5">
        {shortcuts.map((shortcut) => (
          <Card key={shortcut.to} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 p-3.5">
            <div className="min-w-0">
              <p className="font-semibold">{shortcut.label}</p>
              <p className="text-xs text-muted-foreground">{shortcut.hint}</p>
            </div>
            <Link
              to={shortcut.to}
              className="rounded-xl bg-primary-soft px-3 py-1.5 text-xs font-bold text-primary"
            >
              {t("Open")}</Link>
          </Card>
        ))}
      </div>
    </>
  );
}

function PrincipalView({ data }: { data: PrincipalDashboard }) {
    const { t } = useTranslation();
  const rate = data.attendance.total_students
    ? Math.round((data.attendance.present / data.attendance.total_students) * 100)
    : 0;

  return (
    <>
      <Card className="gradient-emerald border-0 text-primary-foreground">
        <p className="text-[0.68rem] font-bold uppercase tracking-widest text-primary-foreground/70">
          {t("Attendance today")}</p>
        <p className="mt-1 font-display text-4xl font-extrabold">{rate}%</p>
        <div className="mt-4 flex flex-wrap gap-2 text-[0.7rem] font-bold">
          <span className="rounded-full bg-primary-foreground/15 px-3 py-1">
            {data.attendance.present} {t("present")}</span>
          <span className="rounded-full bg-primary-foreground/15 px-3 py-1">
            {data.attendance.absent} {t("absent")}</span>
          <span className="rounded-full bg-primary-foreground/15 px-3 py-1">
            {data.attendance.leave} {t("on leave")}</span>
        </div>
      </Card>

      <SectionTitle>{t("Madrasa at a glance")}</SectionTitle>
      <div className="grid grid-cols-2 gap-2.5">
        <StatCard label={t("Students")} value={data.counts.students} icon={GraduationCap} />
        <StatCard label={t("Teachers")} value={data.counts.teachers} icon={Users} tone="gold" />
        <StatCard label={t("Classes")} value={data.counts.classes} icon={BookOpen} />
        <StatCard
          label={`This month (${data.finance.currency})`}
          value={data.finance.month_total?.toLocaleString?.() ?? data.finance.month_total}
          icon={Wallet}
          tone="gold"
        />
      </div>

      {data.attendance.missing_sync_teachers > 0 ? (
        <>
          <SectionTitle>{t("Needs attention")}</SectionTitle>
          <Card>
            <p className="text-sm font-semibold">
              {data.attendance.missing_sync_teachers} {t("teacher(s) haven't synced attendance")}</p>
            <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
              {data.attendance.missing_sync_teacher_list.slice(0, 5).map((teacher) => (
                <li key={teacher.id}>{teacher.name}</li>
              ))}
            </ul>
          </Card>
        </>
      ) : null}

      {data.activity?.length ? (
        <>
          <SectionTitle>{t("Recent activity")}</SectionTitle>
          <Card className="space-y-2.5">
            {data.activity.slice(0, 6).map((entry, index) => (
              <p
                key={index}
                className="border-b border-border pb-2.5 text-sm last:border-0 last:pb-0"
              >
                {entry}
              </p>
            ))}
          </Card>
        </>
      ) : null}
    </>
  );
}

function TeacherView({ data }: { data: TeacherDashboard }) {
    const { t } = useTranslation();
  const attendance = data.today_attendance;

  return (
    <>
      <CheckInCard
        status={attendance?.status ?? null}
        checkIn={attendance?.check_in ?? null}
        checkOut={attendance?.check_out ?? null}
      />

      <SectionTitle>{t("My classes")}</SectionTitle>
      {data.my_classes.length === 0 ? (
        <EmptyState title={t("No classes assigned yet")} />
      ) : (
        <div className="space-y-2.5">
          {data.my_classes.map((entry) => (
            <Card key={`${entry.class_id}-${entry.course_id}`} className="flex items-center gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary">
                <BookOpen className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <p className="truncate font-display text-base font-bold">{entry.course_name}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {entry.class_name}
                  {entry.section_name ? ` · ${entry.section_name}` : ""}
                </p>
              </div>
            </Card>
          ))}
        </div>
      )}

      <SectionTitle>{t("Today's periods")}</SectionTitle>
      <TimetableStrip entries={data.today_timetable} />

      <SectionTitle>{t("Grading")}</SectionTitle>
      <StatCard
        label={t("Pending submissions")}
        value={data.pending_submissions}
        icon={ClipboardList}
        tone="gold"
      />
    </>
  );
}

function StudentView({ data }: { data: StudentDashboard }) {
    const { t } = useTranslation();
  const values = Object.values(data.my_attendance ?? {});
  const present = values.filter((status) => status === "present").length;
  const rate = values.length ? Math.round((present / values.length) * 100) : 0;

  return (
    <>
      <Card className="gradient-emerald border-0 text-primary-foreground">
        <p className="text-[0.68rem] font-bold uppercase tracking-widest text-primary-foreground/70">
          {t("My attendance")}</p>
        <p className="mt-1 font-display text-4xl font-extrabold">{rate}%</p>
        <p className="mt-1 text-xs text-primary-foreground/70">
          {present} {t("present of")}{values.length} {t("recorded days")}</p>
      </Card>

      <SectionTitle>{t("Today's periods")}</SectionTitle>
      <TimetableStrip entries={data.today_timetable} />

      <SectionTitle>{t("Due assignments")}</SectionTitle>
      {data.due_assignments?.length ? (
        <div className="space-y-2.5">
          {data.due_assignments.map((assignment) => (
            <Card
              key={assignment.id}
              className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3"
            >
              <div className="min-w-0">
                <p className="truncate font-semibold">{assignment.title}</p>
                <p className="text-xs text-muted-foreground">
                  {t("Due")}{assignment.due_date?.slice(0, 10)}
                </p>
              </div>
              <Pill tone={assignment.submitted ? "success" : "warning"}>
                {assignment.submitted ? "Submitted" : "Pending"}
              </Pill>
            </Card>
          ))}
        </div>
      ) : (
        <EmptyState title={t("Nothing due right now")} />
      )}
    </>
  );
}

function TimetableStrip({
  entries,
}: {
  entries: { period: number; start_time: string; end_time: string }[];
}) {
    const { t } = useTranslation();
  if (!entries?.length) return <EmptyState title={t("No periods scheduled today")} />;

  return (
    <div className="-mx-4 flex snap-x gap-2.5 overflow-x-auto px-4 pb-1">
      {entries.map((entry) => (
        <div key={entry.period} className="card-surface w-32 shrink-0 snap-start p-3">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-accent-soft text-accent-foreground">
            <CalendarClock className="h-4 w-4" />
          </span>
          <p className="mt-2 font-display text-sm font-extrabold">{t("Period")}{entry.period}</p>
          <p className="text-xs text-muted-foreground">
            {entry.start_time?.slice(0, 5)}–{entry.end_time?.slice(0, 5)}
          </p>
        </div>
      ))}
    </div>
  );
}

function CheckInCard({
  status,
  checkIn,
  checkOut,
}: {
  status: string | null;
  checkIn: string | null;
  checkOut: string | null;
}) {
    const { t } = useTranslation();
  const query = useQuery({
    queryKey: ["teacher-attendance-today"],
    queryFn: () => attendanceApi.myTeacherAttendanceToday(),
  });

  const current = query.data ?? { status, check_in: checkIn, check_out: checkOut };

  const act = async (kind: "in" | "out") => {
    if (kind === "in") await attendanceApi.teacherCheckIn();
    else await attendanceApi.teacherCheckOut();
    await query.refetch();
  };

  return (
    <Card className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
      <div className="min-w-0">
        <p className="text-[0.68rem] font-bold uppercase tracking-widest text-muted-foreground">
          {t("My check-in")}</p>
        <p className="font-display text-lg font-extrabold">
          {current.check_in ? current.check_in.slice(11, 16) : "Not checked in"}
        </p>
        {current.check_out ? (
          <p className="text-xs text-muted-foreground">{t("Out at")}{current.check_out.slice(11, 16)}</p>
        ) : null}
      </div>
      <button
        onClick={() => act(current.check_in ? "out" : "in")}
        className="gradient-emerald flex shrink-0 items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold text-primary-foreground active:scale-95"
      >
        {current.check_in ? <LogOut className="h-4 w-4" /> : <LogIn className="h-4 w-4" />}
        {current.check_in ? "Check out" : "Check in"}
      </button>
    </Card>
  );
}
