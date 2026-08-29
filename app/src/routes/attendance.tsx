import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import {
  ArrowLeft,
  BookOpen,
  Check,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  CircleSlash,
  Loader2,
  Minus,
  Pencil,
  Search,
  UsersRound,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/app/AppShell";
import { FilterBar } from "@/components/app/FilterBar";
import {
  AttendanceCalendar,
  monthRange,
  parseDateKey,
  toDateKey,
  type ClassDayStats,
  type HolidayMarkers,
  type StudentDayStatus,
} from "@/components/app/AttendanceCalendar";
import {
  Card,
  CustomDropdown,
  EmptyState,
  Field,
  Pill,
  SectionTitle,
  SkeletonList,
  TextInput,
} from "@/components/app/Primitives";
import { cn } from "@/lib/utils";
import { apiErrorMessage } from "@/lib/mms/api";
import { useAuth } from "@/lib/mms/auth";
import {
  attendanceApi,
  operationsApi,
  reportingApi,
  type AttendanceLogEntry,
  type AttendanceStatus,
  type AttendanceSyncEntry,
  type ClassAttendanceHistory,
  type TeacherAttendanceLogEntry,
} from "@/lib/mms/endpoints";
import { applyMutationSuccess } from "@/lib/mms/mutation-helpers";
import { enqueueEntry } from "@/lib/mms/outbox";
import { opsApi } from "@/lib/mms/more-endpoints";
import { useOnlineStatus } from "@/lib/mms/useOnlineStatus";
import { useTranslation } from "react-i18next";

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
    const { t } = useTranslation();
  const { user } = useAuth();
  if (user?.role === "student") return <MyStudentAttendance />;
  if (user?.role === "parent") return <ParentAttendance />;
  return <AttendanceBoard />;
}

/* ------------------------------------------------------------------ Parent */

function ParentAttendance() {
  const { t } = useTranslation();
  const dashboard = useQuery({
    queryKey: ["dashboard"],
    queryFn: () => reportingApi.dashboard(),
  });
  const [expanded, setExpanded] = useState<string | null>(null);
  const [selectedCourses, setSelectedCourses] = useState<Record<string, string>>({});

  const selfContainedSetting = useQuery({
    queryKey: ["setting-self-contained-enabled"],
    queryFn: async () => {
      const catalog = await opsApi.listSettingsCatalog();
      const enabled = catalog.find((s) => s.key === "academics.self_contained_enabled");
      const programs = catalog.find((s) => s.key === "academics.self_contained_programs");
      const programIds = new Set<string>();
      if (programs?.value) {
        try {
          const parsed = JSON.parse(programs.value);
          if (Array.isArray(parsed)) parsed.forEach((id: string) => programIds.add(id));
        } catch { /* ignore */ }
      }
      return { enabled: enabled?.value === "true", programIds };
    },
    staleTime: 60_000,
  });

  const data = dashboard.data;

  if (dashboard.isLoading || selfContainedSetting.isLoading)
    return <AppShell title={t("Attendance")}><SkeletonList rows={4} /></AppShell>;
  if (dashboard.isError) return <AppShell title={t("Attendance")}><EmptyState title={t("Attendance unavailable")} /></AppShell>;

  const children = Array.isArray((data as any)?.children) ? (data as any).children : [];
  if (children.length === 0) return <AppShell title={t("Attendance")}><EmptyState title={t("No children found")} /></AppShell>;

  function isSelfContained(child: any): boolean {
    if (!selfContainedSetting.data?.enabled || !child.program_id) return false;
    return selfContainedSetting.data.programIds.has(child.program_id);
  }

  return (
    <AppShell title={t("Attendance")}>
      <div className="space-y-2.5">
        {children.map((child: any) => {
          const isOpen = expanded === child.id;
          const classId = child.class_id;
          if (!classId) {
            return (
              <Card key={child.id} className="p-3.5">
                <p className="font-display text-sm font-extrabold">{child.name}</p>
                <p className="text-xs text-muted-foreground">{t("No class assigned")}</p>
              </Card>
            );
          }
          const selfContained = isSelfContained(child);
          const courses: { id: string; name: string }[] = child.courses || [];
          const needsCourseSelection = !selfContained && courses.length > 0;
          const selectedCourseId = selectedCourses[child.id] || "";

          return (
            <Card key={child.id} className="overflow-hidden p-0">
              <button
                onClick={() => setExpanded(isOpen ? null : child.id)}
                className="flex w-full items-center justify-between gap-3 p-3.5 text-left"
              >
                <div className="min-w-0">
                  <p className="font-display text-sm font-extrabold">{child.name}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {[child.class_name, child.section_name].filter(Boolean).join(" · ")}
                  </p>
                </div>
                <ChevronDown
                  className={cn(
                    "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
                    isOpen && "rotate-180",
                  )}
                />
              </button>
              <div className={cn("border-t border-border", !isOpen && "hidden")}>
                <div className="px-3.5 pb-3.5 pt-2">
                  {needsCourseSelection && !selectedCourseId ? (
                    <div className="space-y-3">
                      <p className="text-xs text-muted-foreground">{t("Select a course to view attendance")}</p>
                      <Select
                        label={t("Course")}
                        value=""
                        onChange={(val) => setSelectedCourses((prev) => ({ ...prev, [child.id]: val }))}
                        options={[
                          { value: "", label: t("Select") },
                          ...courses.map((c) => ({ value: c.id, label: c.name })),
                        ]}
                      />
                    </div>
                  ) : (
                    <ChildAttendance
                      child={{
                        id: child.id,
                        name: child.name,
                        classId,
                      }}
                      courseId={selectedCourseId || undefined}
                      courseName={courses.find((c) => c.id === selectedCourseId)?.name}
                      showCourseLabel={needsCourseSelection}
                      onChangeCourse={() => setSelectedCourses((prev) => ({ ...prev, [child.id]: "" }))}
                    />
                  )}
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </AppShell>
  );
}

function ChildAttendance({
  child,
  courseId,
  courseName,
  showCourseLabel,
  onChangeCourse,
}: {
  child: { id: string; name: string; classId: string };
  courseId?: string;
  courseName?: string;
  showCourseLabel: boolean;
  onChangeCourse: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div>
      {showCourseLabel ? (
        <div className="mb-2 flex items-center justify-between gap-2">
          <Pill tone="default">
            <BookOpen className="h-3 w-3" />
            {courseName}
          </Pill>
          <button
            onClick={onChangeCourse}
            className="text-xs font-semibold text-primary hover:underline"
          >
            {t("Change course")}
          </button>
        </div>
      ) : null}
      <MyStudentAttendance child={child} courseId={courseId} />
    </div>
  );
}

/* ------------------------------------------------------------------ Board */

function AttendanceBoard() {
    const { t } = useTranslation();
  const { user, hasPermission } = useAuth();
  const queryClient = useQueryClient();
  const canManageTeachers = hasPermission("teachers.attendance.manage");
  const canEditAttendanceHistory =
    user?.role === "principal" ||
    user?.role === "super_admin" ||
    Boolean(user?.is_principal_delegate) ||
    hasPermission("attendance.edit_locked");

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
  const [classSearch, setClassSearch] = useState("");
  const [classCourseFilter, setClassCourseFilter] = useState("");
  const [studentDateFrom, setStudentDateFrom] = useState("");
  const [studentDateTo, setStudentDateTo] = useState("");
  const [studentClassFilter, setStudentClassFilter] = useState("");
  const [studentStatusFilter, setStudentStatusFilter] = useState<AttendanceStatus | "all">("all");
  const [expandedAttendanceClassId, setExpandedAttendanceClassId] = useState<string | null>(null);
  const [historySearch, setHistorySearch] = useState("");
  const [historyStatusFilter, setHistoryStatusFilter] = useState<AttendanceStatus | "all">("all");
  const [studentId, setStudentId] = useState("");

  const classes = useQuery({
    queryKey: ["attendance-classes", studentDateFrom, studentDateTo, studentStatusFilter],
    queryFn: () =>
      attendanceApi.listClasses({
        start_date: studentDateFrom || undefined,
        end_date: studentDateTo || undefined,
        attendance_status: studentStatusFilter === "all" ? undefined : studentStatusFilter,
      }),
  });
  const holidays = useQuery({
    queryKey: ["holidays"],
    queryFn: () => operationsApi.listHolidays(),
    retry: false,
  });

  const selfContainedSetting = useQuery({
    queryKey: ["setting-self-contained-enabled"],
    queryFn: async () => {
      const catalog = await opsApi.listSettingsCatalog();
      const enabled = catalog.find((s) => s.key === "academics.self_contained_enabled");
      const programs = catalog.find((s) => s.key === "academics.self_contained_programs");
      const programIds = new Set<string>();
      if (programs?.value) {
        try {
          const parsed = JSON.parse(programs.value);
          if (Array.isArray(parsed)) parsed.forEach((id: string) => programIds.add(id));
        } catch { /* ignore */ }
      }
      return { enabled: enabled?.value === "true", programIds };
    },
    staleTime: 60_000,
  });

  const selectedClass = classes.data?.find((item) => item.id === classId) ?? null;
  const selectedSection = selectedClass?.sections.find((item) => item.id === sectionId) ?? null;

  const selectedClassProgramId = selectedClass?.program_id ?? null;
  const isSelfContainedClass =
    selfContainedSetting.data?.enabled === true &&
    selectedClassProgramId !== null &&
    selfContainedSetting.data?.programIds.has(selectedClassProgramId);

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
    queryKey: ["attendance-roster", classId, sectionId, courseId, slotId, isSelfContainedClass],
    queryFn: () =>
      isSelfContainedClass
        ? attendanceApi.classRoster(classId!, sectionId ?? "", undefined, undefined)
        : attendanceApi.classRoster(classId!, sectionId ?? "", courseId, slotId),
    enabled: Boolean(classId && sectionId && (isSelfContainedClass || courseId)),
    retry: (failureCount, error) => {
      const status = (error as { response?: { status?: number } })?.response?.status;
      if (status === 409) return false;
      return failureCount < 2;
    },
  });

  const history = useQuery({
    queryKey: [
      "attendance-class-history",
      classId,
      sectionId,
      courseId,
      isSelfContainedClass,
      month.getFullYear(),
      month.getMonth(),
    ],
    queryFn: () =>
      attendanceApi.classHistory(classId!, {
        ...monthRange(month),
        ...(sectionId ? { section_id: sectionId } : {}),
        ...(courseId && !isSelfContainedClass ? { course_id: courseId } : {}),
      }),
    enabled: Boolean(classId && sectionId && (isSelfContainedClass || courseId)),
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
  const filteredDayEntries = useMemo(() => {
    const term = historySearch.trim().toLowerCase();
    return dayEntries.filter((entry) => {
      const matchesStatus = historyStatusFilter === "all" || entry.status === historyStatusFilter;
      const matchesSearch =
        !term ||
        entry.student_name.toLowerCase().includes(term) ||
        entry.admission_number.toLowerCase().includes(term) ||
        (entry.course?.name ?? "").toLowerCase().includes(term);
      return matchesStatus && matchesSearch;
    });
  }, [dayEntries, historySearch, historyStatusFilter]);

  const classCourseOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const item of classes.data ?? []) {
      for (const course of item.courses) map.set(course.id, course.name);
    }
    return [...map.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [classes.data]);

  const attendanceClassCards = useMemo(() => {
    const term = classSearch.trim().toLowerCase();
    return (classes.data ?? []).flatMap((item) => {
      const matchesClass = !studentClassFilter || item.id === studentClassFilter;
      const matchesCourse =
        !classCourseFilter || item.courses.some((course) => course.id === classCourseFilter);
      const classTextMatches =
        !term ||
        item.name.toLowerCase().includes(term) ||
        item.courses.some((course) => course.name.toLowerCase().includes(term));
      const visibleSections = classTextMatches
        ? item.sections
        : item.sections.filter((section) => section.name.toLowerCase().includes(term));
      return matchesClass && matchesCourse && visibleSections.length > 0
        ? [{ item, sections: visibleSections }]
        : [];
    });
  }, [classCourseFilter, classSearch, classes.data, studentClassFilter]);

  // Falls back to a valid date only when the underlying data actually
  // changed (a month switch, a refetch) and made the current selection
  // stale — not on every selectedDate change, which would include this
  // effect's own setSelectedDate calls, plus the calendar's normal click
  // handler. `selectedDate` is intentionally excluded from the deps: with it
  // included, clicking any date with no attendance entries yet (the
  // expected, common case — reviewing or about to mark a day) immediately
  // snapped the selection straight back, making every unmarked date look
  // unreachable.
  useEffect(() => {
    if (tab !== "calendar") return;
    const entries = history.data?.entries ?? [];
    if (entries.length === 0) return;
    if (!entries.some((entry) => entry.attendance_date === selectedDate)) {
      setSelectedDate(entries[0]!.attendance_date);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [history.data, tab]);

  useEffect(() => {
    if (tab !== "history") return;
    const entries = studentHistory.data?.entries ?? [];
    if (entries.length === 0) return;
    if (!entries.some((entry) => entry.attendance_date === selectedDate)) {
      setSelectedDate(entries[0]!.attendance_date);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentHistory.data, tab]);
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

  const rosterErrorStatus = (roster.error as { response?: { status?: number } } | null)?.response?.status;
  const multiplePeriods = todaysSlots.length > 1 || rosterErrorStatus === 409;
  const effectiveSlotId = slotId || undefined;

  const online = useOnlineStatus();

  const save = useMutation({
    mutationFn: async (): Promise<
      | { offline: true; count: number; entries: AttendanceSyncEntry[] }
      | { offline: false; result: Awaited<ReturnType<typeof attendanceApi.sync>> }
    > => {
      const data = roster.data;
      if (!data) throw new Error("Roster not loaded");
      if (multiplePeriods && !slotId) throw new Error("Select a period before saving");
      const capturedAt = new Date().toISOString();
      const attendanceDate = capturedAt.slice(0, 10);
      const entries: AttendanceSyncEntry[] = Object.entries(marks).map(([subjectId, status]) => ({
        subject_type: "student",
        subject_id: subjectId,
        session_id: data.session_id,
        course_id: isSelfContainedClass ? undefined : (data.course?.id ?? courseId),
        timetable_slot_id: isSelfContainedClass ? undefined : effectiveSlotId,
        attendance_date: attendanceDate,
        status,
        captured_at: capturedAt,
        idempotency_key: `${subjectId}:${data.session_id}:${attendanceDate}:${isSelfContainedClass ? "general" : (effectiveSlotId ?? "general")}`,
      }));
      if (!entries.length) throw new Error("Nothing to submit");
      if (!online) {
        for (const entry of entries) {
          await enqueueEntry(entry);
        }
        return { offline: true, count: entries.length, entries };
      }
      try {
        const result = await attendanceApi.sync(entries);
        return { offline: false, result };
      } catch {
        for (const entry of entries) {
          await enqueueEntry(entry);
        }
        return { offline: true, count: entries.length, entries };
      }
    },
    onSuccess: (res) => {
      if ("offline" in res && res.offline) {
        toast.success(`Saved offline — ${res.count} mark${res.count === 1 ? "" : "s"} will sync when online`);
        // The history query is server-backed and has no way to know about
        // these marks until the outbox actually syncs — invalidating it
        // here would refetch stale data with nothing recorded yet and wipe
        // out what was just marked, undoing the save from the UI's
        // perspective (hasRecords/canMark below reads straight from this
        // query). Inject the marks locally instead so the calendar/day view
        // shows them as recorded immediately; a later real fetch (sync
        // completing, a month change, a fresh mount) naturally replaces
        // this placeholder with the server's own copy.
        const studentsById = new Map((roster.data?.students ?? []).map((s) => [s.id, s]));
        const nowIso = new Date().toISOString();
        const synthetic: AttendanceLogEntry[] = res.entries.map((entry) => {
          const student = studentsById.get(entry.subject_id);
          return {
            id: entry.idempotency_key,
            attendance_date: entry.attendance_date,
            student_id: entry.subject_id,
            student_name: student?.name ?? "",
            admission_number: student?.admission_number ?? "",
            status: entry.status,
            marked_at: nowIso,
            synced_at: "",
            marked_by: { id: "", username: "", display_name: "", role: "" },
            overridden: false,
            source: "manual",
            locked_reason: null,
            leave_id: null,
            course: roster.data?.course ?? null,
            timetable_slot: roster.data?.timetable_slot ?? null,
            legacy_general: false,
          };
        });
        const bySubject = new Map(synthetic.map((entry) => [entry.student_id, entry]));
        queryClient.setQueryData<ClassAttendanceHistory | undefined>(
          [
            "attendance-class-history",
            classId,
            sectionId,
            courseId,
            isSelfContainedClass,
            month.getFullYear(),
            month.getMonth(),
          ],
          (old) => {
            if (!old) return old;
            const replaced = old.entries.filter(
              (entry) =>
                !(entry.attendance_date === synthetic[0]?.attendance_date && bySubject.has(entry.student_id)),
            );
            return { ...old, entries: [...replaced, ...synthetic] };
          },
        );
      } else if (!res.offline && res.result) {
        const locked = res.result.locked?.length ?? 0;
        toast.success(
          locked ? `Saved — ${locked} entr${locked === 1 ? "y" : "ies"} locked` : "Attendance saved",
        );
        void queryClient.invalidateQueries({ queryKey: ["attendance-class-history"] });
      }
      setEditing(false);
      setMarks({});
      void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (error) => toast.error(apiErrorMessage(error, "Couldn't save attendance")),
  });

  const correctHistory = useMutation({
    mutationFn: ({ entry, status, sessionId }: {
      entry: AttendanceLogEntry;
      status: AttendanceStatus;
      sessionId: string;
    }) =>
      attendanceApi.override(
        {
          subject_type: "student",
          subject_id: entry.student_id,
          session_id: sessionId,
          course_id: entry.course?.id ?? undefined,
          timetable_slot_id: entry.timetable_slot?.id ?? undefined,
          attendance_date: entry.attendance_date,
          status,
          captured_at: new Date().toISOString(),
          idempotency_key: `${entry.student_id}:${sessionId}:${entry.attendance_date}:${entry.timetable_slot?.id ?? "general"}`,
        },
        "Admin corrected student attendance history",
      ),
    onSuccess: () =>
      applyMutationSuccess({
        client: queryClient,
        message: t("Attendance updated"),
        queryKeys: [
          ["attendance-class-history"],
          ["attendance-student-history"],
          ["dashboard"],
          ["my-attendance"],
        ],
      }),
    onError: (error) => toast.error(apiErrorMessage(error, t("Couldn't update attendance"))),
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
    setExpandedAttendanceClassId(null);
  };

  const resetClassFilters = () => {
    setClassSearch("");
    setClassCourseFilter("");
    setStudentDateFrom("");
    setStudentDateTo("");
    setStudentClassFilter("");
    setStudentStatusFilter("all");
  };

  const resetHistoryFilters = () => {
    setHistorySearch("");
    setHistoryStatusFilter("all");
  };

  if (mode === "teachers" && canManageTeachers) {
    return (
      <AppShell title={t("Attendance")} subtitle={t("Teacher attendance log")}>
        <ModeToggle mode={mode} setMode={setMode} canManageTeachers={canManageTeachers} />
        <TeacherAttendancePanel canEdit={canEditAttendanceHistory} />
      </AppShell>
    );
  }

  if (!classId || !sectionId) {
    return (
      <AppShell title={t("Attendance")} subtitle={t("Choose a class to begin")}>
        <ModeToggle mode={mode} setMode={setMode} canManageTeachers={canManageTeachers} />
        <FilterBar
          search={{ value: classSearch, onChange: setClassSearch, placeholder: t("Search classes, sections or courses...") }}
          activeCount={
            (classCourseFilter ? 1 : 0) +
            (classSearch.trim() ? 1 : 0) +
            (studentDateFrom ? 1 : 0) +
            (studentDateTo ? 1 : 0) +
            (studentClassFilter ? 1 : 0) +
            (studentStatusFilter !== "all" ? 1 : 0)
          }
          onClear={resetClassFilters}
        >
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label={t("From")}>
              <TextInput type="date" value={studentDateFrom} onChange={(event) => setStudentDateFrom(event.target.value)} />
            </Field>
            <Field label={t("To")}>
              <TextInput type="date" value={studentDateTo} onChange={(event) => setStudentDateTo(event.target.value)} />
            </Field>
            <Field label={t("Class")}>
              <CustomDropdown value={studentClassFilter} onChange={(event) => setStudentClassFilter(event.target.value)}>
                <option value="">{t("All classes")}</option>
                {(classes.data ?? []).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </CustomDropdown>
            </Field>
            <Field label={t("Status")}>
              <CustomDropdown value={studentStatusFilter} onChange={(event) => setStudentStatusFilter(event.target.value as AttendanceStatus | "all")}>
                <option value="all">{t("All statuses")}</option>
                <option value="present">{t("Present")}</option>
                <option value="absent">{t("Absent")}</option>
                <option value="leave">{t("Leave")}</option>
              </CustomDropdown>
            </Field>
            <Field label={t("Course")}>
              <CustomDropdown value={classCourseFilter} onChange={(event) => setClassCourseFilter(event.target.value)}>
                <option value="">{t("All courses")}</option>
                {classCourseOptions.map((course) => <option key={course.id} value={course.id}>{course.name}</option>)}
              </CustomDropdown>
            </Field>
          </div>
        </FilterBar>
        {classes.isLoading ? <SkeletonList rows={5} /> : null}
        {!classes.isLoading && (classes.data ?? []).every((item) => item.sections.length === 0) ? (
          <EmptyState
            title={t("No classes assigned")}
            hint="Ask your principal to assign classes to you."
          />
        ) : null}
        {!classes.isLoading && attendanceClassCards.length === 0 && (classes.data ?? []).some((item) => item.sections.length > 0) ? (
          <EmptyState title={t("No matching classes")} />
        ) : null}
        <div className="space-y-2.5">
          {attendanceClassCards.map(({ item, sections }) => {
            const expanded = expandedAttendanceClassId === item.id;
            return (
              <div key={item.id}>
                <button
                  onClick={() => setExpandedAttendanceClassId(expanded ? null : item.id)}
                  className="card-surface grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 p-3.5 text-left active:scale-[0.99]"
                >
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary">
                    <BookOpen className="h-5 w-5" />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate font-display font-extrabold">{item.name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {item.courses.map((course) => course.name).join(", ") || t("No courses assigned")}
                    </p>
                    <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                      <UsersRound className="h-3.5 w-3.5" />
                      {item.student_count} {t("students")} · {sections.length} {t("sections")}
                    </p>
                  </div>
                  {expanded ? <ChevronUp className="h-4 w-4 shrink-0 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />}
                </button>
                {expanded ? (
                  <div className="ms-5 mt-1 space-y-1.5 border-s-2 border-border ps-3">
                    {sections.map((section) => (
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
                        className="flex w-full items-center justify-between gap-3 rounded-xl bg-muted px-3 py-2.5 text-left text-sm font-bold text-foreground"
                      >
                        <span className="truncate">{section.name}</span>
                        <span className="shrink-0 text-xs font-semibold text-muted-foreground">
                          {section.student_count} {t("students")}
                        </span>
                        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            );
          })}
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
        {t("Classes")}</button>

      {isSelfContainedClass ? (
        <div className="rounded-xl border border-primary/30 bg-primary-soft/30 px-3 py-2.5 text-xs text-primary">
          {t("Self-contained classroom — one daily attendance in the morning")}
        </div>
      ) : (
        <div className="space-y-2.5">
          <Select
            label={t("Course")}
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
              label={t("Period")}
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
      )}

      {!isSelfContainedClass && !courseId ? (
        <div className="mt-4">
          <EmptyState title={t("Pick a course")} hint="Attendance is recorded per course and period." />
        </div>
      ) : null}

      {isSelfContainedClass || courseId ? (
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
                {key === "calendar" ? t("Calendar") : t("Student history")}
              </button>
            ))}
          </div>

          {tab === "calendar" ? (
            <>
              <SectionTitle>{t("Month")}</SectionTitle>
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
                      {t("Edit")}</button>
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
                        {t("All present")}</button>
                      <button
                        onClick={() => setMarks({})}
                        className="rounded-full bg-muted px-3 py-1 text-[0.68rem] font-bold uppercase text-muted-foreground"
                      >
                        {t("Clear")}</button>
                    </div>
                  ) : undefined
                }
              >
                {selectedDate}
              </SectionTitle>

              {roster.isLoading || history.isLoading ? <SkeletonList rows={5} /> : null}

              {!canMark ? (
                isToday && !hasRecords && todaysSlots.length > 1 && !slotId ? (
                  <div className="mt-4">
                    <EmptyState title={t("Pick a period")} hint="Multiple periods found for this course today." />
                  </div>
                ) : isToday && !hasRecords && todaysSlots.length === 0 ? (
                  <div className="mt-4">
                    <EmptyState title={t("No periods today")} hint="This course is not scheduled for you today." />
                  </div>
                ) : isToday && !hasRecords && roster.isError ? (
                  <div className="mt-4">
                    <EmptyState title={t("Could not load roster")} hint="You may not be assigned to this class." />
                  </div>
                ) : (
                  <>
                    <FilterBar
                      search={{ value: historySearch, onChange: setHistorySearch, placeholder: t("Search students or courses...") }}
                      activeCount={(historySearch.trim() ? 1 : 0) + (historyStatusFilter !== "all" ? 1 : 0)}
                      onClear={resetHistoryFilters}
                    >
                      <Select
                        label={t("Status")}
                        value={historyStatusFilter}
                        onChange={(value) => setHistoryStatusFilter(value as AttendanceStatus | "all")}
                        options={[
                          { value: "all", label: t("All statuses") },
                          { value: "present", label: t("Present") },
                          { value: "absent", label: t("Absent") },
                          { value: "leave", label: t("Leave") },
                        ]}
                      />
                    </FilterBar>
                    <DayEntries
                      entries={filteredDayEntries}
                      sessionId={history.data?.session_id}
                      canEdit={canEditAttendanceHistory}
                      correctingEntryId={correctHistory.variables?.entry.id}
                      isCorrecting={correctHistory.isPending}
                      onCorrect={(entry, status, sessionId) =>
                        correctHistory.mutate({ entry, status, sessionId })
                      }
                    />
                  </>
                )
              ) : (
                <>
                  <label className="card-surface mb-3 flex items-center gap-2 px-3.5 py-2.5">
                    <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <input
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                      placeholder={t("Search name or admission no.")}
                      className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                    />
                  </label>

                  {students.length === 0 && !roster.isLoading ? (
                    <EmptyState title={t("No students in this roster")} />
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
                        {!online ? `${t("Save offline")} ·` : null}{t("Save")}{Object.keys(marks).length} {t("mark")}{Object.keys(marks).length === 1 ? "" : "s"}
                      </button>
                    </div>
                  ) : null}
                </>
              )}
            </>
          ) : (
            <>
              <SectionTitle>{t("Student")}</SectionTitle>
              <Select
                label={t("Student")}
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
                    sessionId={studentHistory.data?.session_id}
                    canEdit={canEditAttendanceHistory}
                    correctingEntryId={correctHistory.variables?.entry.id}
                    isCorrecting={correctHistory.isPending}
                    onCorrect={(entry, status, sessionId) =>
                      correctHistory.mutate({ entry, status, sessionId })
                    }
                  />
                </>
              ) : (
                <div className="mt-3">
                  <EmptyState title={t("Pick a student")} hint="See their month at a glance." />
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
    const { t } = useTranslation();
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
          {key === "students" ? t("Students") : t("Teachers")}
        </button>
      ))}
    </div>
  );
}

function DayEntries({
  entries,
  sessionId,
  canEdit = false,
  correctingEntryId,
  isCorrecting = false,
  onCorrect,
}: {
  entries: AttendanceLogEntry[];
  sessionId?: string;
  canEdit?: boolean;
  correctingEntryId?: string;
  isCorrecting?: boolean;
  onCorrect?: (entry: AttendanceLogEntry, status: AttendanceStatus, sessionId: string) => void;
}) {
  const { t } = useTranslation();
  if (entries.length === 0) return <EmptyState title={t("No attendance recorded")} />;
  return (
    <div className="space-y-2">
      {entries.map((entry) => {
        const editable = canEdit && entry.source === "manual" && Boolean(sessionId && onCorrect);
        const isRowSaving = isCorrecting && correctingEntryId === entry.id;
        return (
          <Card key={entry.id} className="space-y-3 p-3.5">
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
              <div className="min-w-0">
                <p className="truncate font-semibold">{entry.student_name}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {entry.legacy_general ? t("General attendance") : (entry.course?.name ?? "—")}
                  {entry.timetable_slot ? ` · ${t("Period")} ${entry.timetable_slot.period}` : ""}
                  {entry.marked_by?.display_name ? ` · ${entry.marked_by.display_name}` : ""}
                </p>
              </div>
              <Pill tone={statusTone(entry.status)}>{entry.status}</Pill>
            </div>
            {editable ? (
              <div className="flex flex-wrap items-center justify-end gap-1.5">
                <span className="me-auto text-[0.68rem] font-bold uppercase tracking-widest text-muted-foreground">
                  {t("Change status")}
                </span>
                {STATUSES.map(({ value, label, icon: Icon }) => (
                  <button
                    key={value}
                    type="button"
                    disabled={entry.status === value || isCorrecting}
                    aria-label={`${t("Set")} ${entry.student_name} ${t(value)}`}
                    onClick={() => sessionId && onCorrect?.(entry, value, sessionId)}
                    className={cn(
                      "grid h-9 w-9 place-items-center rounded-xl border text-xs font-extrabold transition-colors disabled:opacity-40",
                      entry.status === value &&
                        value === "present" &&
                        "border-transparent bg-success text-success-foreground",
                      entry.status === value &&
                        value === "absent" &&
                        "border-transparent bg-destructive text-destructive-foreground",
                      entry.status === value &&
                        value === "leave" &&
                        "border-transparent bg-accent text-accent-foreground",
                      entry.status !== value && "border-border bg-muted text-muted-foreground",
                    )}
                  >
                    {isRowSaving && entry.status !== value ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : entry.status === value ? (
                      <Icon className="h-4 w-4" />
                    ) : (
                      label
                    )}
                  </button>
                ))}
              </div>
            ) : null}
          </Card>
        );
      })}
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
    const { t } = useTranslation();
  return (
    <label className="card-surface flex items-center gap-3 px-4 py-2.5">
      <span className="shrink-0 text-[0.68rem] font-bold uppercase tracking-widest text-muted-foreground">
        {label}
      </span>
      <CustomDropdown
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="min-w-0 flex-1 border-0 bg-transparent px-0 py-0 ltr:text-right rtl:text-left text-sm font-semibold shadow-none focus:border-0"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </CustomDropdown>
    </label>
  );
}

/* --------------------------------------------------------- Teacher panel */

function TeacherAttendancePanel({ canEdit }: { canEdit: boolean }) {
    const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<AttendanceStatus | "all">("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [correctingEntryId, setCorrectingEntryId] = useState<string | null>(null);
  const [teacherTimeEdits, setTeacherTimeEdits] = useState<Record<string, { checkIn: string; checkOut: string }>>({});
  const [expandedTeacherEntryId, setExpandedTeacherEntryId] = useState<string | null>(null);
  const logs = useQuery({
    queryKey: ["teacher-attendance-history", dateFrom, dateTo],
    queryFn: () =>
      attendanceApi.teacherHistory(
        dateFrom || dateTo
          ? { ...(dateFrom ? { start_date: dateFrom } : {}), ...(dateTo ? { end_date: dateTo } : {}) }
          : undefined,
      ),
    retry: false,
  });

  const correctTeacherHistory = useMutation({
    mutationFn: ({
      entry,
      status,
      checkIn = entry.check_in ?? undefined,
      checkOut = entry.check_out ?? undefined,
    }: {
      entry: TeacherAttendanceLogEntry;
      status: AttendanceStatus;
      checkIn?: string;
      checkOut?: string;
    }) =>
      attendanceApi.override(
        {
          subject_type: "teacher",
          subject_id: entry.teacher_id,
          session_id: entry.session_id,
          attendance_date: entry.attendance_date,
          status,
          check_in: checkIn || undefined,
          check_out: checkOut || undefined,
          captured_at: new Date().toISOString(),
          idempotency_key: `${entry.teacher_id}:${entry.session_id}:${entry.attendance_date}`,
        },
        "Admin corrected teacher attendance history",
      ),
    onSuccess: async (_data, variables) => {
      toast.success(t("Attendance updated"));
      setCorrectingEntryId(null);
      setTeacherTimeEdits((current) => {
        const { [variables.entry.id]: _saved, ...remaining } = current;
        return remaining;
      });
      await queryClient.invalidateQueries({ queryKey: ["teacher-attendance-history"] });
    },
    onError: (error) => {
      setCorrectingEntryId(null);
      toast.error(apiErrorMessage(error, t("Couldn't update attendance")));
    },
  });

  const filteredLogs = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (logs.data ?? []).filter((entry) => {
      const matchesStatus = statusFilter === "all" || entry.status === statusFilter;
      const matchesSearch =
        !term ||
        entry.teacher_name.toLowerCase().includes(term) ||
        entry.employee_code.toLowerCase().includes(term) ||
        entry.attendance_date.includes(term);
      return matchesStatus && matchesSearch;
    });
  }, [logs.data, search, statusFilter]);

  const clearFilters = () => {
    setSearch("");
    setStatusFilter("all");
    setDateFrom("");
    setDateTo("");
  };

  return (
    <>
      <FilterBar
        title={<h2 className="truncate font-display text-sm font-extrabold uppercase tracking-[0.14em] text-muted-foreground">{t("Teacher log")}</h2>}
        search={{ value: search, onChange: setSearch, placeholder: t("Search teachers or dates...") }}
        activeCount={(search.trim() ? 1 : 0) + (statusFilter !== "all" ? 1 : 0) + (dateFrom ? 1 : 0) + (dateTo ? 1 : 0)}
        onClear={clearFilters}
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label={t("From")}>
            <TextInput type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} />
          </Field>
          <Field label={t("To")}>
            <TextInput type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} />
          </Field>
          <Field label={t("Status")}>
            <CustomDropdown value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as AttendanceStatus | "all")}>
              <option value="all">{t("All statuses")}</option>
              <option value="present">{t("Present")}</option>
              <option value="absent">{t("Absent")}</option>
              <option value="leave">{t("Leave")}</option>
            </CustomDropdown>
          </Field>
        </div>
      </FilterBar>
      {logs.isLoading ? <SkeletonList rows={5} /> : null}
      {!logs.isLoading && filteredLogs.length === 0 ? (
        <EmptyState title={t("No teacher attendance logs")} />
      ) : null}
      <div className="space-y-2">
        {filteredLogs.map((entry) => {
          const timeEdit = teacherTimeEdits[entry.id] ?? {
            checkIn: entry.check_in?.slice(0, 5) ?? "",
            checkOut: entry.check_out?.slice(0, 5) ?? "",
          };
          const isEditingEntry = expandedTeacherEntryId === entry.id;
          return (
          <Card key={entry.id} className="space-y-3 p-3.5">
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
              <div className="min-w-0">
                <p className="truncate font-semibold">{entry.teacher_name}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {entry.attendance_date} · {t("in")} {formatTime(entry.check_in)} · {t("out")} {formatTime(entry.check_out)}
                </p>
              </div>
              <Pill tone={statusTone(entry.status)}>{entry.status}</Pill>
            </div>
            {canEdit ? (
              <button
                type="button"
                onClick={() => setExpandedTeacherEntryId(isEditingEntry ? null : entry.id)}
                className="flex w-full items-center justify-between rounded-xl bg-muted px-3 py-2.5 text-sm font-extrabold text-primary"
              >
                <span>{t("Edit attendance")}</span>
                {isEditingEntry ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </button>
            ) : null}
            {canEdit && isEditingEntry ? (
              <div className="flex flex-wrap items-center justify-end gap-1.5">
                <span className="me-auto text-[0.68rem] font-bold uppercase tracking-widest text-muted-foreground">
                  {t("Change status")}
                </span>
                {STATUSES.map(({ value, label, icon: Icon }) => (
                  <button
                    key={value}
                    type="button"
                    disabled={entry.status === value || correctingEntryId === entry.id}
                    aria-label={`${t("Set")} ${entry.teacher_name} ${t(value)}`}
                    onClick={() => {
                      setCorrectingEntryId(entry.id);
                      correctTeacherHistory.mutate({
                        entry,
                        status: value,
                        checkIn: timeEdit.checkIn,
                        checkOut: timeEdit.checkOut,
                      });
                    }}
                    className={cn(
                      "grid h-9 w-9 place-items-center rounded-xl border text-xs font-extrabold transition-colors disabled:opacity-40",
                      entry.status === value && value === "present" && "border-transparent bg-success text-success-foreground",
                      entry.status === value && value === "absent" && "border-transparent bg-destructive text-destructive-foreground",
                      entry.status === value && value === "leave" && "border-transparent bg-accent text-accent-foreground",
                      entry.status !== value && "border-border bg-muted text-muted-foreground",
                    )}
                  >
                    {correctingEntryId === entry.id && entry.status !== value ? <Loader2 className="h-4 w-4 animate-spin" /> : entry.status === value ? <Icon className="h-4 w-4" /> : label}
                  </button>
                ))}
              </div>
            ) : null}
            {canEdit && isEditingEntry ? (
              <div className="grid grid-cols-2 gap-3 border-t border-border pt-3">
                <Field label={t("Time in")}>
                  <TextInput
                    type="time"
                    value={timeEdit.checkIn}
                    disabled={correctingEntryId === entry.id}
                    onChange={(event) =>
                      setTeacherTimeEdits((current) => ({
                        ...current,
                        [entry.id]: { ...timeEdit, checkIn: event.target.value },
                      }))
                    }
                  />
                </Field>
                <Field label={t("Time out")}>
                  <TextInput
                    type="time"
                    value={timeEdit.checkOut}
                    disabled={correctingEntryId === entry.id}
                    onChange={(event) =>
                      setTeacherTimeEdits((current) => ({
                        ...current,
                        [entry.id]: { ...timeEdit, checkOut: event.target.value },
                      }))
                    }
                  />
                </Field>
                <button
                  type="button"
                  disabled={correctingEntryId === entry.id}
                  onClick={() => {
                    setCorrectingEntryId(entry.id);
                    correctTeacherHistory.mutate({
                      entry,
                      status: entry.status,
                      checkIn: timeEdit.checkIn,
                      checkOut: timeEdit.checkOut,
                    });
                  }}
                  className="col-span-2 rounded-xl bg-primary-soft px-3 py-2.5 text-sm font-extrabold text-primary disabled:opacity-40"
                >
                  {correctingEntryId === entry.id ? t("Saving...") : t("Save times")}
                </button>
              </div>
            ) : null}
          </Card>
          );
        })}
      </div>
    </>
  );
}

/* -------------------------------------------------------- Student's own */

function MyStudentAttendance({ child, courseId }: { child?: { id: string; name: string; classId: string }; courseId?: string }) {
    const { t } = useTranslation();
  const [month, setMonth] = useState(() => new Date());
  const [selectedDate, setSelectedDate] = useState(() => toDateKey(new Date()));
  const isGuardianView = Boolean(child);

  const history = useQuery({
    queryKey: ["my-attendance", child?.id, month.getFullYear(), month.getMonth(), courseId],
    queryFn: () => child
      ? attendanceApi.studentHistory(child.classId, child.id, monthRange(month), courseId)
      : attendanceApi.myStudentHistory(monthRange(month)),
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

  const content = (
    <>
      {history.isLoading ? <SkeletonList rows={4} /> : null}
      {history.isError ? <EmptyState title={t("Attendance unavailable")} /> : null}

      {history.data ? (
        <>
          <Card className="mb-3 grid grid-cols-2 gap-3">
            <div>
              <p className="text-[0.68rem] font-bold uppercase tracking-widest text-muted-foreground">
                {t("Present")}</p>
              <p className="font-display text-xl font-extrabold">
                {present}/{total}
              </p>
            </div>
            <div>
              <p className="text-[0.68rem] font-bold uppercase tracking-widest text-muted-foreground">
                {t("Rate")}</p>
              <p className="font-display text-xl font-extrabold">
                {total ? Math.round((present / total) * 100) : 0}%
              </p>
            </div>
          </Card>

          <AttendanceCalendar
            month={month}
            onMonthChange={setMonth}
            selectedDate={isGuardianView ? null : selectedDate}
            onSelectDate={isGuardianView ? () => {} : setSelectedDate}
            mode="student"
            studentDayStatus={statuses}
          />

          {!isGuardianView ? (
            <>
              <SectionTitle>{selectedDate}</SectionTitle>
              <DayEntries entries={dayEntries} />
            </>
          ) : null}
        </>
      ) : null}
    </>
  );

  if (child) {
    return (
      <div>
        <p className="mb-3 text-sm text-muted-foreground">
          {history.data ? `${history.data.class_name} · ${history.data.session_name}` : t("Monthly record")}
        </p>
        {content}
      </div>
    );
  }

  return (
    <AppShell
      title={t("My Attendance")}
      subtitle={
        history.data
          ? `${history.data.class_name} · ${history.data.session_name}`
          : "Your monthly record"
      }
    >
      {content}
    </AppShell>
  );
}
