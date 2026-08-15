import { useQuery } from "@tanstack/react-query";
import { Link, Navigate, createFileRoute } from "@tanstack/react-router";
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
import { useMemo, useState } from "react";

import { cn } from "@/lib/utils";

import { AppShell } from "@/components/app/AppShell";
import { FilterBar } from "@/components/app/FilterBar";
import {
  Card,
  CustomDropdown,
  EmptyState,
  Field,
  Pill,
  SectionTitle,
  SkeletonList,
  StatCard,
  TextInput,
} from "@/components/app/Primitives";
import { useAuth } from "@/lib/mms/auth";
import { isTenantWorkspace } from "@/lib/mms/workspace";
import {
  academicsApi,
  attendanceApi,
  reportingApi,
  type ParentDashboard,
  type PrincipalDashboard,
  type StudentDashboard,
  type TeacherDashboard,
} from "@/lib/mms/endpoints";
import { financeApi, type DonorFinanceProfile } from "@/lib/mms/more-endpoints";
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
    enabled: Boolean(user) && (user?.role !== "super_admin" || isTenantWorkspace(user.role)),
  });

  const dashboard = useQuery({
    queryKey: ["dashboard"],
    queryFn: () => reportingApi.dashboard(),
    enabled: Boolean(user) && (user?.role !== "super_admin" || isTenantWorkspace(user.role)),
  });

  const donorProfile = useQuery({
    queryKey: ["donor-profile"],
    queryFn: () => financeApi.myDonorProfile(),
    enabled: Boolean(user) && user?.role === "donor",
    retry: false,
  });

  const data = dashboard.data;

  if (user?.role === "super_admin" && !isTenantWorkspace(user.role)) return <Navigate to="/platform" replace />;

  return (
    <AppShell
      title={`${t("Assalamu alaikum")}, ${data?.role === "donor" && donorProfile.data ? donorProfile.data.name : (user?.username ?? "")}`}
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
      {data?.role === "teacher" && user?.is_principal_delegate ? <PrincipalView data={data as unknown as PrincipalDashboard} /> : null}
      {data?.role === "student" ? <StudentView data={data as StudentDashboard} /> : null}
      {data?.role === "donor" ? <DonorView data={donorProfile.data} error={donorProfile.error} isLoading={donorProfile.isLoading} /> : null}
      {data?.role === "parent" ? <GuardianView data={data as ParentDashboard} /> : null}
    </AppShell>
  );
}

function GuardianView({ data }: { data: ParentDashboard }) {
  const { t } = useTranslation();
  const [activeChild, setActiveChild] = useState(0);
  const child = data.children[activeChild];

  if (!child) {
    return <EmptyState title={t("No linked students")} hint="No students are linked to your account yet." />;
  }

  const values = Object.values(child.my_attendance ?? {});
  const present = values.filter((s) => s === "present").length;
  const rate = values.length ? Math.round((present / values.length) * 100) : 0;

  return (
    <>
      {data.children.length > 1 ? (
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {data.children.map((c, i) => (
            <button
              key={c.id}
              onClick={() => setActiveChild(i)}
              className={cn(
                "shrink-0 rounded-full px-3 py-1.5 text-xs font-bold",
                i === activeChild ? "gradient-emerald text-primary-foreground" : "bg-muted text-muted-foreground",
              )}
            >
              {c.name}
            </button>
          ))}
        </div>
      ) : null}

      <Card className="gradient-emerald border-0 text-primary-foreground">
        <p className="text-[0.68rem] font-bold uppercase tracking-widest text-primary-foreground/70">
          {child.name} · {t("Attendance")}
        </p>
        <p className="mt-1 font-display text-4xl font-extrabold">{rate}%</p>
        <p className="mt-1 text-xs text-primary-foreground/70">
          {present} {t("present of")}{values.length} {t("recorded days")}
        </p>
      </Card>

      {child.current_class ? (
        <>
          <SectionTitle>{t("Class")}</SectionTitle>
          <Card className="flex items-center gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary">
              <GraduationCap className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <p className="truncate font-display text-base font-bold">{child.current_class.name}</p>
              {child.current_class.section_name ? (
                <p className="truncate text-xs text-muted-foreground">{child.current_class.section_name}</p>
              ) : null}
            </div>
          </Card>
        </>
      ) : null}

      <SectionTitle>{t("Today's periods")}</SectionTitle>
      <TimetableStrip entries={child.today_timetable ?? []} />

      <SectionTitle>{t("Due assignments")}</SectionTitle>
      {child.due_assignments?.length ? (
        <div className="space-y-2.5">
          {child.due_assignments.map((a) => (
            <Card key={a.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
              <div className="min-w-0">
                <p className="truncate font-semibold">{a.title}</p>
                <p className="text-xs text-muted-foreground">{t("Due")}{a.due_date?.slice(0, 10)}</p>
              </div>
              <Pill tone={a.submitted ? "success" : "warning"}>
                {a.submitted ? "Submitted" : "Pending"}
              </Pill>
            </Card>
          ))}
        </div>
      ) : (
        <EmptyState title={t("Nothing due right now")} />
      )}

      {child.fee_summary?.totals?.length ? (
        <>
          <SectionTitle>{t("Fee summary")}</SectionTitle>
          <div className="grid grid-cols-1 gap-2.5">
            {child.fee_summary.totals.map((total) => (
              <Card key={total.currency} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 p-3.5">
                <div className="min-w-0">
                  <p className="font-semibold">{total.currency}</p>
                  <p className="text-xs text-muted-foreground">{t("Total paid")}</p>
                </div>
                <span className="font-display text-lg font-extrabold text-primary">
                  {total.amount.toLocaleString("en-PK", { minimumFractionDigits: 2 })}
                </span>
              </Card>
            ))}
          </div>
        </>
      ) : null}
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

      <SectionTitle>{t("Profile completion")}</SectionTitle>
      <div className="grid grid-cols-2 gap-2.5">
        <Link to="/incomplete-profiles" search={{ type: "student" }}><StatCard label={t("Students incomplete")} value={data.incomplete_profiles.students} icon={GraduationCap} tone="gold" /></Link>
        <Link to="/incomplete-profiles" search={{ type: "guardian" }}><StatCard label={t("Guardians incomplete")} value={data.incomplete_profiles.guardians} icon={Users} tone="gold" /></Link>
      </div>
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

function DonorView({ data, error, isLoading }: { data?: DonorFinanceProfile; error?: unknown; isLoading?: boolean }) {
  const { t } = useTranslation();
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [categoryId, setCategoryId] = useState("");

  const categories = useMemo(() => {
    if (!data?.donations) return [];
    const map = new Map<string, string>();
    for (const d of data.donations) {
      if (d.category_id && !map.has(d.category_id)) {
        map.set(d.category_id, d.category_name ?? d.category_id);
      }
    }
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [data]);

  const filtered = useMemo(() => {
    if (!data?.donations) return [];
    return data.donations.filter((d) => {
      if (categoryId && d.category_id !== categoryId) return false;
      if (dateFrom && d.donation_date < dateFrom) return false;
      if (dateTo && d.donation_date > dateTo) return false;
      return true;
    });
  }, [data, dateFrom, dateTo, categoryId]);

  const total = filtered.reduce((sum: number, d: { amount?: number }) => sum + Number(d.amount ?? 0), 0);
  const activeCount = [dateFrom, dateTo, categoryId].filter(Boolean).length;

  if (isLoading) return <SkeletonList rows={3} />;
  if (error) return <EmptyState title={t("Couldn't load donor data")} hint={t("Please try again or contact support.")} />;
  if (!data) return <EmptyState title={t("No donor data")} hint={t("Your donation history will appear here.")} />;

  return (
    <>
      <StatCard
        icon={Wallet}
        label={t("Total donations")}
        value={total.toLocaleString("en-PK", { minimumFractionDigits: 2 })}
      />
      <FilterBar
        activeCount={activeCount}
        onClear={() => { setDateFrom(""); setDateTo(""); setCategoryId(""); }}
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label={t("From")}>
            <TextInput type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          </Field>
          <Field label={t("To")}>
            <TextInput type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          </Field>
          <Field label={t("Category")} className="sm:col-span-2">
            <CustomDropdown value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              <option value="">{t("All categories")}</option>
              {categories.map((c) => (<option key={c.id} value={c.id}>{c.name}</option>))}
            </CustomDropdown>
          </Field>
        </div>
      </FilterBar>
      <SectionTitle>{t("Donation history")}</SectionTitle>
      {filtered.length === 0 ? (
        <EmptyState title={t("No donations match filters")} hint={t("Try adjusting your date or category filter.")} />
      ) : (
        <div className="space-y-2.5">
          {filtered.map((d) => (
            <Card key={d.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 p-3.5">
              <div className="min-w-0">
                <p className="font-semibold">{d.category_name ?? d.category_id}</p>
                <p className="text-xs text-muted-foreground">{d.donation_date}</p>
              </div>
              <span className="font-display text-lg font-extrabold text-primary">
                {d.amount.toLocaleString("en-PK", { minimumFractionDigits: 2 })}
              </span>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
