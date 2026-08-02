import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import {
  ArrowLeft,
  BookOpen,
  Check,
  ChevronRight,
  CircleSlash,
  Loader2,
  LogIn,
  LogOut,
  Minus,
  Pencil,
  Search,
  UsersRound,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/app/AppShell";
import {
  AttendanceCalendar,
  monthRange,
  parseDateKey,
  toDateKey,
  type ClassDayStats,
  type HolidayMarkers,
  type StudentDayStatus,
} from "@/components/app/AttendanceCalendar";
import { Card, EmptyState, Pill, SectionTitle, SkeletonList } from "@/components/app/Primitives";
import { cn } from "@/lib/utils";
import { apiErrorMessage } from "@/lib/mms/api";
import { useAuth } from "@/lib/mms/auth";
import {
  attendanceApi,
  operationsApi,
  type AttendanceLogEntry,
  type AttendanceStatus,
  type AttendanceSyncEntry,
} from "@/lib/mms/endpoints";

export const Route = createFileRoute("/attendance")({
  head: () => ({
    meta: [
      { title: "Attendance — Suffa MS" },
      {
        name: "description",
        content:
          "Mark and review class attendance with a monthly calendar, class and period selection.",
      },
      { property: "og:title", content: "Attendance — Suffa MS" },
      {
        property: "og:description",
        content:
          "Mark and review class attendance with a monthly calendar, class and period selection.",
      },
    ],
  }),
  component: AttendancePage,
});

const STATUSES: { value: AttendanceStatus; label: string; icon: typeof Check }[] = [
  { value: "present", label: "P", icon: Check },
  { value: "absent", label: "A", icon: CircleSlash },
  { value: "leave", label: "L", icon: Minus },
];

function statusTone(status: AttendanceStatus) {
  return status === "present" ? "success" : status === "absent" ? "destructive" : "gold";
}

function formatTime(value: string | null | undefined) {
  return value ? value.slice(0, 5) : "—";
}

function AttendancePage() {
  const { user } = useAuth();
  if (user?.role === "student" || user?.role === "guardian") return <MyStudentAttendance />;
  return <AttendanceBoard />;
}

/* ------------------------------------------------------------------ Board */

function AttendanceBoard() {
  const { user, hasPermission } = useAuth();
  const queryClient = useQueryClient();
  const canManageTeachers = hasPermission("teachers.attendance.manage");

  const [mode, setMode] = useState<"students" | "teachers">("students");
  const [classId, setClassId] = useState<string | null>(null);
  const [sectionId, setSectionId] = useState<string | null>(null);
  const [courseId, setCourseId] = useState("");
  const [slotId, setSlotId] = useState("");
  const [tab, setTab] = useState<"calendar" | "history">("calendar");

  const [month, setMonth] = useState(() => new Date());
  const todayKey = toDateKey(new Date());
  const [selectedDate, setSelectedDate] = useState<string>(todayKey);
  const [editing, setEditing] = useState(false);
  const [marks, setMarks] = useState<Record<string, AttendanceStatus>>({});
  const [search, setSearch] = useState("");
  const [studentId, setStudentId] = useState("");

  const classes = useQuery({
    queryKey: ["attendance-classes"],
    queryFn: () => attendanceApi.listClasses(),
  });
  const holidays = useQuery({
    queryKey: ["holidays"],
    queryFn: () => operationsApi.listHolidays(),
    retry: false,
  });

  const selectedClass = classes.data?.find((item) => item.id === classId) ?? null;
  const selectedSection = selectedClass?.sections.find((item) => item.id === sectionId) ?? null;

  const slots = useQuery({
    queryKey: ["attendance-slots", classId, sectionId, user?.role],
    queryFn: async () => {
      const list =
        user?.role === "teacher"
          ? await operationsApi.listMyTimetable()
          : await operationsApi.listTimetable({
              ...(classId ? { class_id: classId } : {}),
              ...(sectionId ? { section_id: sectionId } : {}),
            });
      return list.filter((slot) => slot.class_id === classId && slot.section_id === sectionId);
    },
    enabled: Boolean(classId && sectionId),
    retry: false,
  });

  const courseOptions = useMemo(() => {
    if (!selectedClass) return [];
    if (!slots.data || slots.data.length === 0) return selectedClass.courses;
    const scheduled = new Set(slots.data.map((slot) => slot.course_id));
    const filtered = selectedClass.courses.filter((course) => scheduled.has(course.id));
    return filtered.length ? filtered : selectedClass.courses;
  }, [selectedClass, slots.data]);

  const todayDayOfWeek = (new Date().getDay() + 6) % 7;
  const todaysSlots = useMemo(
    () =>
      (slots.data ?? []).filter(
        (slot) => slot.course_id === courseId && slot.day_of_week === todayDayOfWeek,
      ),
    [courseId, slots.data, todayDayOfWeek],
  );

  // Auto-pick the only available course / period.
  useEffect(() => {
    if (!courseId && courseOptions.length === 1) setCourseId(courseOptions[0]!.id);
  }, [courseId, courseOptions]);
  useEffect(() => {
    if (todaysSlots.length === 1 && !slotId) setSlotId(todaysSlots[0]!.id);
    if (slotId && todaysSlots.length > 0 && !todaysSlots.some((slot) => slot.id === slotId))
      setSlotId("");
  }, [slotId, todaysSlots]);

  const roster = useQuery({
    queryKey: ["attendance-roster", classId, sectionId, courseId, slotId],
    queryFn: () => attendanceApi.classRoster(classId!, sectionId ?? "", courseId, slotId),
    enabled: Boolean(classId && sectionId && courseId),
    retry: false,
  });

  const history = useQuery({
    queryKey: [
      "attendance-class-history",
      classId,
      sectionId,
      courseId,
      month.getFullYear(),
      month.getMonth(),
    ],
    queryFn: () =>
      attendanceApi.classHistory(classId!, {
        ...monthRange(month),
        ...(sectionId ? { section_id: sectionId } : {}),
        ...(courseId ? { course_id: courseId } : {}),
      }),
    enabled: Boolean(classId && sectionId && courseId),
    retry: false,
  });

  const studentHistory = useQuery({
    queryKey: [
      "attendance-student-history",
      classId,
      studentId,
      month.getFullYear(),
      month.getMonth(),
    ],
    queryFn: () => attendanceApi.studentHistory(classId!, studentId, monthRange(month)),
    enabled: Boolean(classId && studentId && tab === "history"),
    retry: false,
  });

  const holidayMarkers = useMemo<HolidayMarkers>(() => {
    const markers: HolidayMarkers = {};
    for (const holiday of holidays.data ?? []) {
      const cursor = parseDateKey(holiday.start_date);
      const end = parseDateKey(holiday.end_date);
      while (cursor <= end) {
        markers[toDateKey(cursor)] = holiday.name;
        cursor.setDate(cursor.getDate() + 1);
      }
    }
    return markers;
  }, [holidays.data]);

  const dayStats = useMemo<ClassDayStats>(() => {
    const total = roster.data?.students.length ?? 0;
    const stats: ClassDayStats = {};
    for (const entry of history.data?.entries ?? []) {
      const current = stats[entry.attendance_date] ?? { present: 0, total };
      if (entry.status === "present") current.present += 1;
      stats[entry.attendance_date] = current;
    }
    return stats;
  }, [history.data, roster.data]);

  const dayEntries = useMemo(
    () => (history.data?.entries ?? []).filter((entry) => entry.attendance_date === selectedDate),
    [history.data, selectedDate],
  );
  const approvedLeaveIds = useMemo(
    () =>
      new Set(
        dayEntries.filter((entry) => entry.source === "approved_leave").map((e) => e.student_id),
      ),
    [dayEntries],
  );
  const isToday = selectedDate === todayKey;
  const hasRecords = dayEntries.some((entry) => entry.source !== "approved_leave");
  const canMark = isToday && Boolean(roster.data) && (!hasRecords || editing);

  // Default everyone to present when today has nothing recorded yet.
  useEffect(() => {
    if (!canMark || hasRecords) return;
    const students = roster.data?.students ?? [];
    if (!students.length) return;
    setMarks((current) => {
      if (Object.keys(current).length) return current;
      return Object.fromEntries(
        students
          .filter((s) => !approvedLeaveIds.has(s.id))
          .map((s) => [s.id, "present" as AttendanceStatus]),
      );
    });
  }, [approvedLeaveIds, canMark, hasRecords, roster.data]);

  const students = useMemo(() => {
    const list = roster.data?.students ?? [];
    const term = search.trim().toLowerCase();
    if (!term) return list;
    return list.filter(
      (student) =>
        student.name.toLowerCase().includes(term) ||
        student.admission_number.toLowerCase().includes(term),
    );
  }, [roster.data, search]);

  const effectiveSlotId = slotId || roster.data?.timetable_slot?.id || "";

  const save = useMutation({
    mutationFn: async () => {
      const data = roster.data;
      if (!data) throw new Error("Roster not loaded");
      if (!effectiveSlotId)
        throw new Error("This course is not scheduled today — pick a period first");
      const capturedAt = new Date().toISOString();
      const attendanceDate = capturedAt.slice(0, 10);
      const entries: AttendanceSyncEntry[] = Object.entries(marks).map(([subjectId, status]) => ({
        subject_type: "student",
        subject_id: subjectId,
        session_id: data.session_id,
        course_id: data.course?.id ?? courseId,
        timetable_slot_id: effectiveSlotId,
        attendance_date: attendanceDate,
        status,
        captured_at: capturedAt,
        idempotency_key: `${subjectId}:${data.session_id}:${attendanceDate}:${effectiveSlotId}`,
      }));
      if (!entries.length) throw new Error("Nothing to submit");
      return attendanceApi.sync(entries);
    },
    onSuccess: (result) => {
      const locked = result.locked?.length ?? 0;
      toast.success(
        locked ? `Saved — ${locked} entr${locked === 1 ? "y" : "ies"} locked` : "Attendance saved",
      );
      setEditing(false);
      setMarks({});
      void queryClient.invalidateQueries({ queryKey: ["attendance-class-history"] });
      void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (error) => toast.error(apiErrorMessage(error, "Couldn't save attendance")),
  });

  const resetSelection = () => {
    setClassId(null);
    setSectionId(null);
    setCourseId("");
    setSlotId("");
    setTab("calendar");
    setMarks({});
    setEditing(false);
    setStudentId("");
    setSelectedDate(todayKey);
  };

  if (mode === "teachers" && canManageTeachers) {
    return (
      <AppShell title="Attendance" subtitle="Teacher attendance log">
        <ModeToggle mode={mode} setMode={setMode} canManageTeachers={canManageTeachers} />
        <TeacherAttendancePanel />
      </AppShell>
    );
  }

  if (!classId || !sectionId) {
    return (
      <AppShell title="Attendance" subtitle="Choose a class to begin">
        <ModeToggle mode={mode} setMode={setMode} canManageTeachers={canManageTeachers} />
        {classes.isLoading ? <SkeletonList rows={5} /> : null}
        {!classes.isLoading && (classes.data ?? []).every((item) => item.sections.length === 0) ? (
          <EmptyState
            title="No classes assigned"
            hint="Ask your principal to assign classes to you."
          />
        ) : null}
        <div className="space-y-2.5">
          {(classes.data ?? []).flatMap((item) =>
            item.sections.map((section) => (
              <button
                key={section.id}
                onClick={() => {
                  setClassId(item.id);
                  setSectionId(section.id);
                  setCourseId("");
                  setSlotId("");
                  setMarks({});
                  setSelectedDate(todayKey);
                  setMonth(new Date());
                }}
                className="card-surface grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 p-3.5 text-left active:scale-[0.99]"
              >
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary">
                  <BookOpen className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <p className="truncate font-display font-extrabold">
                    {item.name} / {section.name}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {item.courses.map((course) => course.name).join(", ") || "No courses assigned"}
                  </p>
                  <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                    <UsersRound className="h-3.5 w-3.5" />
                    {section.student_count} students
                  </p>
                </div>
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
              </button>
            )),
          )}
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell
      title={`${selectedClass?.name ?? "Class"} / ${selectedSection?.name ?? ""}`}
      subtitle={roster.data ? `${roster.data.session_name}` : "Select course and period"}
    >
      <button
        onClick={resetSelection}
        className="mb-3 inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-muted-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Classes
      </button>

      <div className="space-y-2.5">
        <Select
          label="Course"
          value={courseId}
          onChange={(value) => {
            setCourseId(value);
            setSlotId("");
            setMarks({});
            setEditing(false);
          }}
          options={[
            { value: "", label: "Select course" },
            ...courseOptions.map((course) => ({ value: course.id, label: course.name })),
          ]}
        />
        {todaysSlots.length > 1 ? (
          <Select
            label="Period"
            value={slotId}
            onChange={(value) => {
              setSlotId(value);
              setMarks({});
            }}
            options={[
              { value: "", label: "Select period" },
              ...todaysSlots.map((slot) => ({
                value: slot.id,
                label: `Period ${slot.period} · ${formatTime(slot.start_time)}-${formatTime(slot.end_time)}`,
              })),
            ]}
          />
        ) : null}
      </div>

      {!courseId ? (
        <div className="mt-4">
          <EmptyState title="Pick a course" hint="Attendance is recorded per course and period." />
        </div>
      ) : null}

      {courseId ? (
        <>
          <div className="mt-4 grid grid-cols-2 gap-1.5 rounded-2xl bg-muted p-1">
            {(["calendar", "history"] as const).map((key) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={cn(
                  "rounded-xl py-2 text-xs font-bold uppercase tracking-wide transition-colors",
                  tab === key
                    ? "bg-card text-primary shadow-[var(--shadow-soft)]"
                    : "text-muted-foreground",
                )}
              >
                {key === "calendar" ? "Calendar" : "Student history"}
              </button>
            ))}
          </div>

          {tab === "calendar" ? (
            <>
              <SectionTitle>Month</SectionTitle>
              <AttendanceCalendar
                month={month}
                onMonthChange={setMonth}
                selectedDate={selectedDate}
                onSelectDate={(date) => {
                  setSelectedDate(date);
                  setEditing(false);
                  setMarks({});
                }}
                mode="class"
                classDayStats={dayStats}
                holidayMarkers={holidayMarkers}
              />

              <SectionTitle
                action={
                  isToday && hasRecords && !editing ? (
                    <button
                      onClick={() => {
                        const prefill: Record<string, AttendanceStatus> = {};
                        for (const entry of dayEntries) {
                          if (entry.source !== "approved_leave")
                            prefill[entry.student_id] = entry.status;
                        }
                        setMarks(prefill);
                        setEditing(true);
                      }}
                      className="inline-flex items-center gap-1 rounded-full bg-primary-soft px-3 py-1 text-[0.68rem] font-bold uppercase text-primary"
                    >
                      <Pencil className="h-3 w-3" />
                      Edit
                    </button>
                  ) : canMark ? (
                    <div className="flex gap-1.5">
                      <button
                        onClick={() =>
                          setMarks(
                            Object.fromEntries(
                              (roster.data?.students ?? [])
                                .filter((student) => !approvedLeaveIds.has(student.id))
                                .map((student) => [student.id, "present" as AttendanceStatus]),
                            ),
                          )
                        }
                        className="rounded-full bg-primary-soft px-3 py-1 text-[0.68rem] font-bold uppercase text-primary"
                      >
                        All present
                      </button>
                      <button
                        onClick={() => setMarks({})}
                        className="rounded-full bg-muted px-3 py-1 text-[0.68rem] font-bold uppercase text-muted-foreground"
                      >
                        Clear
                      </button>
                    </div>
                  ) : undefined
                }
              >
                {selectedDate}
              </SectionTitle>

              {roster.isLoading || history.isLoading ? <SkeletonList rows={5} /> : null}

              {!canMark ? (
                <DayEntries entries={dayEntries} />
              ) : (
                <>
                  <label className="card-surface mb-3 flex items-center gap-2 px-3.5 py-2.5">
                    <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <input
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                      placeholder="Search name or admission no."
                      className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                    />
                  </label>

                  {students.length === 0 && !roster.isLoading ? (
                    <EmptyState title="No students in this roster" />
                  ) : null}

                  <div className="space-y-2 pb-24">
                    {students.map((student) => {
                      const locked = approvedLeaveIds.has(student.id);
                      return (
                        <Card
                          key={student.id}
                          className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 p-3"
                        >
                          <div className="min-w-0">
                            <p className="truncate font-semibold">{student.name}</p>
                            <p className="truncate text-xs text-muted-foreground">
                              {student.admission_number}
                              {student.section_name ? ` · ${student.section_name}` : ""}
                              {locked ? " · approved leave" : ""}
                            </p>
                          </div>
                          <div className="flex shrink-0 gap-1">
                            {STATUSES.map(({ value, label, icon: Icon }) => {
                              const active = marks[student.id] === value;
                              return (
                                <button
                                  key={value}
                                  disabled={locked}
                                  aria-label={`${student.name} ${value}`}
                                  onClick={() =>
                                    setMarks((prev) => ({ ...prev, [student.id]: value }))
                                  }
                                  className={cn(
                                    "grid h-9 w-9 place-items-center rounded-xl border text-xs font-extrabold transition-colors disabled:opacity-40",
                                    active &&
                                      value === "present" &&
                                      "border-transparent bg-success text-success-foreground",
                                    active &&
                                      value === "absent" &&
                                      "border-transparent bg-destructive text-destructive-foreground",
                                    active &&
                                      value === "leave" &&
                                      "border-transparent bg-accent text-accent-foreground",
                                    !active && "border-border bg-muted text-muted-foreground",
                                  )}
                                >
                                  {active ? <Icon className="h-4 w-4" /> : label}
                                </button>
                              );
                            })}
                          </div>
                        </Card>
                      );
                    })}
                  </div>

                  {Object.keys(marks).length > 0 ? (
                    <div className="pb-safe fixed inset-x-0 bottom-[4.25rem] z-30 px-4 lg:bottom-4 lg:pl-[17rem]">
                      <button
                        onClick={() => save.mutate()}
                        disabled={save.isPending}
                        className="gradient-emerald mx-auto flex w-full max-w-lg items-center justify-center gap-2 rounded-2xl py-3.5 font-display font-extrabold text-primary-foreground shadow-[var(--shadow-raised)] active:scale-[0.99] disabled:opacity-60"
                      >
                        {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                        Save {Object.keys(marks).length} mark
                        {Object.keys(marks).length === 1 ? "" : "s"}
                      </button>
                    </div>
                  ) : null}
                </>
              )}
            </>
          ) : (
            <>
              <SectionTitle>Student</SectionTitle>
              <Select
                label="Student"
                value={studentId}
                onChange={setStudentId}
                options={[
                  { value: "", label: "Select student" },
                  ...(roster.data?.students ?? []).map((student) => ({
                    value: student.id,
                    label: `${student.name} · ${student.admission_number}`,
                  })),
                ]}
              />
              {studentId ? (
                <>
                  <div className="mt-3">
                    <AttendanceCalendar
                      month={month}
                      onMonthChange={setMonth}
                      selectedDate={selectedDate}
                      onSelectDate={setSelectedDate}
                      mode="student"
                      holidayMarkers={holidayMarkers}
                      studentDayStatus={Object.fromEntries(
                        (studentHistory.data?.entries ?? []).map((entry) => [
                          entry.attendance_date,
                          entry.status,
                        ]),
                      )}
                    />
                  </div>
                  <SectionTitle>{selectedDate}</SectionTitle>
                  <DayEntries
                    entries={(studentHistory.data?.entries ?? []).filter(
                      (entry) => entry.attendance_date === selectedDate,
                    )}
                  />
                </>
              ) : (
                <div className="mt-3">
                  <EmptyState title="Pick a student" hint="See their month at a glance." />
                </div>
              )}
            </>
          )}
        </>
      ) : null}
    </AppShell>
  );
}

function ModeToggle({
  mode,
  setMode,
  canManageTeachers,
}: {
  mode: "students" | "teachers";
  setMode: (mode: "students" | "teachers") => void;
  canManageTeachers: boolean;
}) {
  if (!canManageTeachers) return null;
  return (
    <div className="mb-3 grid grid-cols-2 gap-1.5 rounded-2xl bg-muted p-1">
      {(["students", "teachers"] as const).map((key) => (
        <button
          key={key}
          onClick={() => setMode(key)}
          className={cn(
            "rounded-xl py-2 text-xs font-bold uppercase tracking-wide transition-colors",
            mode === key
              ? "bg-card text-primary shadow-[var(--shadow-soft)]"
              : "text-muted-foreground",
          )}
        >
          {key}
        </button>
      ))}
    </div>
  );
}

function DayEntries({ entries }: { entries: AttendanceLogEntry[] }) {
  if (entries.length === 0) return <EmptyState title="No attendance recorded" />;
  return (
    <div className="space-y-2">
      {entries.map((entry) => (
        <Card
          key={entry.id}
          className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 p-3.5"
        >
          <div className="min-w-0">
            <p className="truncate font-semibold">{entry.student_name}</p>
            <p className="truncate text-xs text-muted-foreground">
              {entry.legacy_general ? "General attendance" : (entry.course?.name ?? "—")}
              {entry.timetable_slot ? ` · Period ${entry.timetable_slot.period}` : ""}
              {entry.marked_by?.display_name ? ` · ${entry.marked_by.display_name}` : ""}
            </p>
          </div>
          <Pill tone={statusTone(entry.status)}>{entry.status}</Pill>
        </Card>
      ))}
    </div>
  );
}

function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <label className="card-surface flex items-center gap-3 px-4 py-2.5">
      <span className="shrink-0 text-[0.68rem] font-bold uppercase tracking-widest text-muted-foreground">
        {label}
      </span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="min-w-0 flex-1 bg-transparent text-right text-sm font-semibold outline-none"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

/* --------------------------------------------------------- Teacher panel */

function TeacherAttendancePanel() {
  const queryClient = useQueryClient();
  const today = useQuery({
    queryKey: ["teacher-attendance-today"],
    queryFn: () => attendanceApi.myTeacherAttendanceToday(),
    retry: false,
  });
  const logs = useQuery({
    queryKey: ["teacher-attendance-history"],
    queryFn: () => attendanceApi.teacherHistory(),
    retry: false,
  });

  const check = useMutation({
    mutationFn: (action: "in" | "out") =>
      action === "in" ? attendanceApi.teacherCheckIn() : attendanceApi.teacherCheckOut(),
    onSuccess: () => {
      toast.success("Saved");
      void queryClient.invalidateQueries({ queryKey: ["teacher-attendance-today"] });
      void queryClient.invalidateQueries({ queryKey: ["teacher-attendance-history"] });
    },
    onError: (error) => toast.error(apiErrorMessage(error, "Couldn't update attendance")),
  });

  return (
    <>
      <Card className="grid grid-cols-2 gap-2">
        <button
          disabled={Boolean(today.data?.check_in) || check.isPending}
          onClick={() => check.mutate("in")}
          className="flex items-center justify-center gap-2 rounded-xl bg-primary-soft py-3 font-display text-sm font-extrabold text-primary disabled:opacity-40"
        >
          <LogIn className="h-4 w-4" />
          Check in {today.data?.check_in ? `· ${formatTime(today.data.check_in)}` : ""}
        </button>
        <button
          disabled={!today.data?.check_in || Boolean(today.data?.check_out) || check.isPending}
          onClick={() => check.mutate("out")}
          className="flex items-center justify-center gap-2 rounded-xl bg-accent-soft py-3 font-display text-sm font-extrabold text-accent-foreground disabled:opacity-40"
        >
          <LogOut className="h-4 w-4" />
          Check out {today.data?.check_out ? `· ${formatTime(today.data.check_out)}` : ""}
        </button>
      </Card>

      <SectionTitle>Teacher log</SectionTitle>
      {logs.isLoading ? <SkeletonList rows={5} /> : null}
      {!logs.isLoading && (logs.data ?? []).length === 0 ? (
        <EmptyState title="No teacher attendance logs" />
      ) : null}
      <div className="space-y-2">
        {(logs.data ?? []).map((entry) => (
          <Card
            key={entry.id}
            className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 p-3.5"
          >
            <div className="min-w-0">
              <p className="truncate font-semibold">{entry.teacher_name}</p>
              <p className="truncate text-xs text-muted-foreground">
                {entry.attendance_date} · in {formatTime(entry.check_in)} · out{" "}
                {formatTime(entry.check_out)}
              </p>
            </div>
            <Pill tone={statusTone(entry.status)}>{entry.status}</Pill>
          </Card>
        ))}
      </div>
    </>
  );
}

/* -------------------------------------------------------- Student's own */

function MyStudentAttendance() {
  const [month, setMonth] = useState(() => new Date());
  const [selectedDate, setSelectedDate] = useState(() => toDateKey(new Date()));

  const history = useQuery({
    queryKey: ["my-attendance", month.getFullYear(), month.getMonth()],
    queryFn: () => attendanceApi.myStudentHistory(monthRange(month)),
    retry: false,
  });

  const statuses = useMemo<StudentDayStatus>(
    () =>
      Object.fromEntries(
        (history.data?.entries ?? []).map((entry) => [entry.attendance_date, entry.status]),
      ),
    [history.data],
  );
  const dayEntries = (history.data?.entries ?? []).filter(
    (entry) => entry.attendance_date === selectedDate,
  );

  const present = (history.data?.entries ?? []).filter(
    (entry) => entry.status === "present",
  ).length;
  const total = history.data?.entries.length ?? 0;

  return (
    <AppShell
      title="My Attendance"
      subtitle={
        history.data
          ? `${history.data.class_name} · ${history.data.session_name}`
          : "Your monthly record"
      }
    >
      {history.isLoading ? <SkeletonList rows={4} /> : null}
      {history.isError ? <EmptyState title="Attendance unavailable" /> : null}

      {history.data ? (
        <>
          <Card className="mb-3 grid grid-cols-2 gap-3">
            <div>
              <p className="text-[0.68rem] font-bold uppercase tracking-widest text-muted-foreground">
                Present
              </p>
              <p className="font-display text-xl font-extrabold">
                {present}/{total}
              </p>
            </div>
            <div>
              <p className="text-[0.68rem] font-bold uppercase tracking-widest text-muted-foreground">
                Rate
              </p>
              <p className="font-display text-xl font-extrabold">
                {total ? Math.round((present / total) * 100) : 0}%
              </p>
            </div>
          </Card>

          <AttendanceCalendar
            month={month}
            onMonthChange={setMonth}
            selectedDate={selectedDate}
            onSelectDate={setSelectedDate}
            mode="student"
            studentDayStatus={statuses}
          />

          <SectionTitle>{selectedDate}</SectionTitle>
          <DayEntries entries={dayEntries} />
        </>
      ) : null}
    </AppShell>
  );
}
