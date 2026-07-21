import { Button } from "./ui/Button";
import {
  ArrowLeft,
  BookOpen,
  ChevronRight,
  CloudUpload,
  Pencil,
  Save,
  UsersRound,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";

import type { AttendanceStatus } from "../data/mockData";
import { AttendanceCalendar, monthRange, toDateKey, type ClassDayStats, type HolidayMarkers, type StudentDayStatus } from "./AttendanceCalendar";
import { useAttendanceOutbox } from "../hooks/useAttendanceOutbox";
import { useAuth } from "../lib/AuthContext";
import {
  academicsApi,
  attendanceApi,
  operationsApi,
  peopleApi,
  type AcademicClass,
  type AcademicSession,
  type AttendanceClassOption,
  type AttendanceLogEntry,
  type AttendanceRoster,
  type ClassAttendanceHistory,
  type Holiday,
  type StudentAttendanceHistory,
  type Teacher,
  type TeacherAttendanceLogEntry,
  type TeacherAttendanceToday
} from "../lib/endpoints";
import type { TimetableSlot } from "../lib/endpoints";
import { cachedFetch } from "../lib/offlineCache";
import { consumePendingClassNav } from "../lib/pendingNav";
import { Modal, FormModal } from "./ui/Modal";
import { PageSection, PageHeader } from "./ui/Layout";
import { HijriTag } from "./HijriTag";
import { SearchDropdown } from "./SearchDropdown";
import { useSessionReadOnly } from "./SessionSwitcher";
import { Input } from "./ui/Field";
import { DataTable } from "./ui/DataTable";
import { InlineFilter } from "./ui/InlineFilter";


const attendanceOptions = ["present", "absent", "leave"] as const;
const attendanceDayKeys = ["dayMon", "dayTue", "dayWed", "dayThu", "dayFri", "daySat", "daySun"] as const;
type AttendanceTab = "calendar" | "studentHistory";
type AttendanceMode = "students" | "teachers";

export type AttendanceBoardProps = Readonly<Record<string, never>>;

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatTime(value: string | null | undefined): string {
  return value ? value.slice(0, 5) : "-";
}

function wasCapturedOffline(entry: AttendanceLogEntry): boolean {
  return new Date(entry.synced_at).getTime() - new Date(entry.marked_at).getTime() > 60_000;
}

function TeacherAttendancePanel() {
  const { t } = useTranslation();
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [teacherSearch, setTeacherSearch] = useState("");
  const [selectedTeacherId, setSelectedTeacherId] = useState("");
  const [logs, setLogs] = useState<TeacherAttendanceLogEntry[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    void peopleApi.listTeachers().then(setTeachers).catch(() => setTeachers([]));
  }, []);

  useEffect(() => {
    void (async () => {
      setError("");
      try {
        setLogs(await attendanceApi.teacherHistory(selectedTeacherId ? { teacher_id: selectedTeacherId } : undefined));
      } catch (err: any) {
        setLogs([]);
        setError(err.response?.data?.detail ?? t("failedLoadTeacherAttendance"));
      }
    })();
  }, [selectedTeacherId, t]);

  const matchingTeachers = teachers.filter((teacher) => {
    const query = teacherSearch.trim().toLowerCase();
    if (!query) return true;
    return teacher.name.toLowerCase().includes(query) || teacher.employee_code.toLowerCase().includes(query);
  });

  return (
    <PageSection>
      <PageHeader title={t("teacherAttendanceHeading")} notice={t("teacherAttendanceDescription")} />
      <InlineFilter filters={[]}>
        <SearchDropdown
          id="teacher-attendance-search"
          label={t("teacherLabel")}
          placeholder={t("searchTeacherPlaceholder")}
          items={matchingTeachers}
          value={teacherSearch}
          getKey={(teacher) => teacher.id}
          getLabel={(teacher) => teacher.name}
          getDescription={(teacher) => teacher.employee_code}
          onQueryChange={(query) => {
            setTeacherSearch(query);
            setSelectedTeacherId("");
          }}
          onSelect={(teacher) => {
            setTeacherSearch(`${teacher.name} (${teacher.employee_code})`);
            setSelectedTeacherId(teacher.id);
          }}
          emptyLabel={t("noMatchingTeachers")}
        />
        {(teacherSearch || selectedTeacherId) && (
          <div className="formActions">
            <Button
              className="secondaryAction"
              type="button"
              onClick={() => {
                setTeacherSearch("");
                setSelectedTeacherId("");
              }}
            >
              {t("clearBtn")}
            </Button>
          </div>
        )}
      </InlineFilter>
      {error && <p className="notice" style={{ color: "var(--rose)" }}>{error}</p>}
      <DataTable<TeacherAttendanceLogEntry>
        columns={[
          { header: t("teacherLabel"), render: (entry) => (
            <>
              <strong>{entry.teacher_name}</strong>
              <small>{entry.employee_code}</small>
            </>
          ) },
          { header: t("dateCol"), render: (entry) => entry.attendance_date },
          { header: t("statusCol"), render: (entry) => t(entry.status) },
          { header: t("timeInLabel"), render: (entry) => formatTime(entry.check_in) },
          { header: t("timeOutLabel"), render: (entry) => formatTime(entry.check_out) },
          { header: t("markedByCol"), render: (entry) => (
            <>
              <strong>{entry.marked_by.display_name}</strong>
              <small>{entry.marked_by.username}</small>
            </>
          ) },
        ]}
        data={logs}
        keyExtractor={(entry) => entry.id}
        emptyMessage={t("noTeacherAttendanceLogs")}
      />
    </PageSection>
  );
}

function buildClassDayStats(month: Date, totalStudents: number, entries: AttendanceLogEntry[]): ClassDayStats {
  const stats: ClassDayStats = {};
  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const todayKey = toDateKey(new Date());
  for (let day = 1; day <= daysInMonth; day += 1) {
    const key = toDateKey(new Date(month.getFullYear(), month.getMonth(), day));
    if (key > todayKey) continue;
    stats[key] = { present: 0, total: totalStudents };
  }
  for (const entry of entries) {
    if (entry.status === "present" && stats[entry.attendance_date]) {
      stats[entry.attendance_date].present += 1;
    }
  }
  return stats;
}

function buildStudentDayStatus(entries: AttendanceLogEntry[]): StudentDayStatus {
  const map: StudentDayStatus = {};
  for (const entry of entries) map[entry.attendance_date] = entry.status;
  return map;
}

function parseDateKey(value: string): Date {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function buildHolidayMarkers(holidays: Holiday[]): HolidayMarkers {
  const markers: HolidayMarkers = {};
  for (const holiday of holidays) {
    const current = parseDateKey(holiday.start_date);
    const end = parseDateKey(holiday.end_date);
    while (current <= end) {
      markers[toDateKey(current)] = holiday.name;
      current.setDate(current.getDate() + 1);
    }
  }
  return markers;
}

function AttendanceHistoryTable({
  entries,
  includeStudent,
}: Readonly<{ entries: AttendanceLogEntry[]; includeStudent: boolean }>) {
  const { t } = useTranslation();

  return (
    <DataTable<AttendanceLogEntry>
      className={includeStudent ? "attendanceHistoryTable" : "attendanceHistoryTable compact"}
      columns={[
        { header: t("dateCol"), render: (entry) => entry.attendance_date },
        ...(includeStudent ? [{ header: t("studentCol"), render: (entry: AttendanceLogEntry) => (
          <>
            <strong>{entry.student_name}</strong>
            <small>{entry.admission_number}</small>
          </>
        ) }] : []),
        { header: t("courseAndPeriodLabel"), render: (entry) => entry.legacy_general ? (
          <span className="syncBadge">{t("legacyGeneralAttendance")}</span>
        ) : (
          <>
            <strong>{entry.course?.name}</strong>
            <small>{t("periodWithTime", {
              period: entry.timetable_slot?.period,
              start: formatTime(entry.timetable_slot?.start_time),
              end: formatTime(entry.timetable_slot?.end_time),
            })}</small>
          </>
        ) },
        { header: t("statusCol"), render: (entry) => (
          <>
            <span className={`statusPill ${entry.status}`}>{t(entry.status)}</span>
            {entry.source === "approved_leave" && <small className="syncBadge">{t("approvedLeaveLabel")}</small>}
            {entry.overridden && <small className="syncBadge">{t("overriddenLabel")}</small>}
          </>
        ) },
        { header: t("markedByCol"), render: (entry) => (
          <>
            <strong>{entry.marked_by.display_name}</strong>
            <small>{entry.marked_by.username} - {entry.marked_by.role}</small>
          </>
        ) },
        { header: t("capturedAtCol"), render: (entry) => (
          <>
            {formatDateTime(entry.marked_at)}
            {wasCapturedOffline(entry) && <small className="syncBadge">{t("offlineCaptureLabel")}</small>}
          </>
        ) },
        { header: t("syncedAtCol"), render: (entry) => formatDateTime(entry.synced_at) },
      ]}
      data={entries}
      keyExtractor={(entry) => entry.id}
      emptyMessage={t("noAttendanceHistory")}
    />
  );
}

export function AttendanceBoard({}: AttendanceBoardProps) {
  const { t } = useTranslation();
  const { user, hasPermission } = useAuth();
  const readOnly = useSessionReadOnly();
  const [searchParams, setSearchParams] = useSearchParams();
  const canManageTeacherAttendance = !readOnly && hasPermission("teachers.attendance.manage");
  const [attendanceMode, setAttendanceMode] = useState<AttendanceMode>(() => searchParams.get("mode") === "teachers" ? "teachers" : "students");
  const [marked, setMarked] = useState<Record<string, AttendanceStatus>>({});
  const [classes, setClasses] = useState<AttendanceClassOption[]>([]);
  const [selectedClassId, setSelectedClassId] = useState<string | null>(() => searchParams.get("class"));
  const [selectedSectionId, setSelectedSectionId] = useState<string | null>(() => searchParams.get("section"));
  const [selectedCourseId, setSelectedCourseId] = useState<string>(() => searchParams.get("course") ?? "");
  const [selectedSlotId, setSelectedSlotId] = useState<string>(() => searchParams.get("slot") ?? "");
  const [timetableSlots, setTimetableSlots] = useState<TimetableSlot[]>([]);
  const [activeTab, setActiveTab] = useState<AttendanceTab>(() => searchParams.get("view") === "history" ? "studentHistory" : "calendar");
  const [roster, setRoster] = useState<AttendanceRoster | null>(null);
  const [isLoadingClasses, setIsLoadingClasses] = useState(true);
  const [isLoadingRoster, setIsLoadingRoster] = useState(false);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [isSavingAttendance, setIsSavingAttendance] = useState(false);
  const [hasUnsavedMarks, setHasUnsavedMarks] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");
  const [error, setError] = useState("");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const { entries, lockedKeys, isSyncing, queueAttendanceBatch, sync, overrideEntry } = useAttendanceOutbox(
    sessionId,
    selectedCourseId || null,
    selectedSlotId || null,
  );
  const canOverride = !readOnly && hasPermission("attendance.edit_locked");
  const lockedEntries = entries.filter((entry) => lockedKeys.includes(entry.idempotency_key));
  const selectedClass = classes.find((item) => item.id === selectedClassId) ?? null;

  // Calendar tab
  const [calendarMonth, setCalendarMonth] = useState(() => new Date());
  const [selectedDate, setSelectedDate] = useState<string | null>(() => toDateKey(new Date()));
  const [editingToday, setEditingToday] = useState(false);
  const [classHistory, setClassHistory] = useState<ClassAttendanceHistory | null>(null);
  const [isLoadingClassHistory, setIsLoadingClassHistory] = useState(false);

  // Student history tab
  const [studentMonth, setStudentMonth] = useState(() => new Date());
  const [studentSelectedDate, setStudentSelectedDate] = useState<string | null>(null);
  const [studentSearch, setStudentSearch] = useState("");
  const [selectedStudentId, setSelectedStudentId] = useState(() => searchParams.get("student") ?? "");
  const [studentHistory, setStudentHistory] = useState<StudentAttendanceHistory | null>(null);
  const [isLoadingStudentHistory, setIsLoadingStudentHistory] = useState(false);

  useEffect(() => {
    setAttendanceMode(searchParams.get("mode") === "teachers" ? "teachers" : "students");
    setSelectedClassId(searchParams.get("class"));
    setSelectedSectionId(searchParams.get("section"));
    setSelectedCourseId(searchParams.get("course") ?? "");
    setSelectedSlotId(searchParams.get("slot") ?? "");
    setActiveTab(searchParams.get("view") === "history" ? "studentHistory" : "calendar");
    setSelectedStudentId(searchParams.get("student") ?? "");
  }, [searchParams]);

  async function handleOverride(entry: (typeof lockedEntries)[number]): Promise<void> {
    const reason = window.prompt(t("overrideReasonPrompt"));
    if (!reason) return;
    await overrideEntry(entry, reason);
  }

  function selectClass(classId: string, sectionId: string): void {
    setSelectedClassId(classId);
    setSelectedSectionId(sectionId);
    setSelectedCourseId("");
    setSelectedSlotId("");
    setActiveTab("calendar");
    setCalendarMonth(new Date());
    setSelectedDate(toDateKey(new Date()));
    setEditingToday(false);
    setClassHistory(null);
    setStudentHistory(null);
    setSelectedStudentId("");
    setStudentSearch("");
    setStudentSelectedDate(null);
    setHasUnsavedMarks(false);
    setSaveMessage("");
    setMarked({});
    setSearchParams({ class: classId, section: sectionId, view: "calendar" });
  }

  function returnToClasses(): void {
    setSelectedClassId(null);
    setSelectedSectionId(null);
    setSelectedCourseId("");
    setSelectedSlotId("");
    setTimetableSlots([]);
    setActiveTab("calendar");
    setClassHistory(null);
    setStudentHistory(null);
    setSelectedStudentId("");
    setHasUnsavedMarks(false);
    setSaveMessage("");
    setSearchParams({});
  }

  useEffect(() => {
    void (async () => {
      setIsLoadingClasses(true);
      setError("");
      try {
        const { data } = await cachedFetch("attendance-classes", attendanceApi.listClasses);
        setClasses(data);
        // Deep link from the dashboard's "open class list" button (§C):
        // jump straight into the roster instead of making the teacher pick again.
        const pending = consumePendingClassNav();
        const pendingClass = pending ? data.find((c) => c.id === pending.classId) : undefined;
        const pendingSection = pendingClass?.sections.find((section) => section.id === pending?.sectionId)
          ?? pendingClass?.sections[0];
        if (pendingClass && pendingSection) {
          selectClass(pendingClass.id, pendingSection.id);
        }
      } catch (err: any) {
        setError(err.response?.data?.detail ?? t("failedLoadAttendanceClasses"));
      } finally {
        setIsLoadingClasses(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t]);

  useEffect(() => {
    void (async () => {
      try {
        const { data } = await cachedFetch("holidays", () => operationsApi.listHolidays());
        setHolidays(data);
      } catch {
        setHolidays([]);
      }
    })();
  }, []);

  useEffect(() => {
    if (!selectedClassId || !selectedSectionId) {
      setTimetableSlots([]);
      return;
    }
    void (async () => {
      try {
        const slots = user?.role === "teacher"
          ? await operationsApi.listMyTimetable()
          : await operationsApi.listTimetable({ class_id: selectedClassId, section_id: selectedSectionId });
        const scoped = slots.filter((slot) => slot.class_id === selectedClassId && slot.section_id === selectedSectionId);
        setTimetableSlots(scoped);
      } catch {
        setTimetableSlots([]);
      }
    })();
  }, [selectedClassId, selectedSectionId, user?.role]);

  useEffect(() => {
    if (!selectedClassId || !selectedSectionId || !selectedCourseId || !selectedSlotId) {
      setRoster(null);
      setSessionId(null);
      setMarked({});
      setHasUnsavedMarks(false);
      setSaveMessage("");
      return;
    }
    void (async () => {
      setIsLoadingRoster(true);
      setError("");
      setMarked({});
      setHasUnsavedMarks(false);
      setSaveMessage("");
      try {
        const { data } = await cachedFetch(`attendance-roster-${selectedClassId}-${selectedSectionId}-${selectedCourseId}-${selectedSlotId}`, () =>
          attendanceApi.classRoster(selectedClassId, selectedSectionId, selectedCourseId, selectedSlotId),
        );
        setRoster(data);
        setSessionId(data.session_id);
      } catch (err: any) {
        setRoster(null);
        setSessionId(null);
        setError(err.response?.data?.detail ?? t("failedLoadAttendanceRoster"));
      } finally {
        setIsLoadingRoster(false);
      }
    })();
  }, [selectedClassId, selectedSectionId, selectedCourseId, selectedSlotId, t]);

  useEffect(() => {
    if (!selectedClassId || !selectedSectionId || !selectedCourseId) return;
    void (async () => {
      setIsLoadingClassHistory(true);
      setError("");
      try {
        setClassHistory(await attendanceApi.classHistory(selectedClassId, {
          ...monthRange(calendarMonth), section_id: selectedSectionId ?? undefined, course_id: selectedCourseId,
        }));
      } catch (err: any) {
        setClassHistory(null);
        setError(err.response?.data?.detail ?? t("failedLoadAttendanceHistory"));
      } finally {
        setIsLoadingClassHistory(false);
      }
    })();
  }, [selectedClassId, selectedSectionId, selectedCourseId, calendarMonth, t]);

  useEffect(() => {
    if (activeTab === "studentHistory" && !selectedStudentId && roster?.students.length) {
      setSelectedStudentId(roster.students[0].id);
      setSearchParams({ class: selectedClassId ?? "", section: selectedSectionId ?? "", view: "history", student: roster.students[0].id });
    }
  }, [activeTab, roster, selectedClassId, selectedSectionId, selectedStudentId, setSearchParams]);

  useEffect(() => {
    if (!selectedClassId || !selectedSectionId || activeTab !== "studentHistory" || !selectedStudentId) return;
    void (async () => {
      setIsLoadingStudentHistory(true);
      setError("");
      try {
        setStudentHistory(
          await attendanceApi.studentHistory(selectedClassId, selectedStudentId, {
            ...monthRange(studentMonth), section_id: selectedSectionId ?? undefined, course_id: selectedCourseId || undefined,
          }),
        );
      } catch (err: any) {
        setStudentHistory(null);
        setError(err.response?.data?.detail ?? t("failedLoadAttendanceHistory"));
      } finally {
        setIsLoadingStudentHistory(false);
      }
    })();
  }, [activeTab, selectedClassId, selectedSectionId, selectedCourseId, selectedStudentId, studentMonth, t]);

  function mark(studentId: string, status: AttendanceStatus): void {
    if (approvedLeaveStudentIds.has(studentId)) return;
    setMarked((current) => ({ ...current, [studentId]: status }));
    setHasUnsavedMarks(true);
    setSaveMessage("");
  }

  async function saveAttendance(): Promise<void> {
    if (!sessionId || markedCount === 0 || !roster || !user) return;
    setIsSavingAttendance(true);
    setError("");
    try {
      const editableMarks = Object.fromEntries(activeMarkedEntries);
      await queueAttendanceBatch(editableMarks);
      const todayKey = toDateKey(new Date());
      const nowIso = new Date().toISOString();
      const optimisticEntries: AttendanceLogEntry[] = activeMarkedEntries.map(([studentId, status]) => {
        const student = roster.students.find((item) => item.id === studentId);
        return {
          id: `optimistic-${studentId}-${todayKey}`,
          attendance_date: todayKey,
          student_id: studentId,
          student_name: student?.name ?? "",
          admission_number: student?.admission_number ?? "",
          status,
          marked_at: nowIso,
          synced_at: nowIso,
          marked_by: { id: user.id, username: user.username, display_name: user.username, role: user.role },
          overridden: false,
          source: "manual",
          locked_reason: null,
          leave_id: null,
          course: roster.course,
          timetable_slot: roster.timetable_slot,
          legacy_general: false,
        };
      });
      setClassHistory((current) => {
        const base = current ?? { session_id: sessionId, session_name: "", class_id: selectedClassId ?? "", class_name: "", entries: [] };
        const untouched = base.entries.filter(
          (entry) => !(entry.attendance_date === todayKey && editableMarks[entry.student_id]),
        );
        return { ...base, entries: [...untouched, ...optimisticEntries] };
      });
      setHasUnsavedMarks(false);
      setEditingToday(false);
      setMarked({});
      setSaveMessage(navigator.onLine ? t("attendanceSavedSyncing") : t("attendanceSavedOffline"));
    } catch (err: any) {
      setError(err.response?.data?.detail ?? t("failedSaveAttendance"));
    } finally {
      setIsSavingAttendance(false);
    }
  }

  const headerTitle = roster ? `${roster.class_name} / ${roster.section_name ?? ""}` : t("chooseAttendanceClass");
  const headerEyebrow = roster ? `${t("sessionLabel")}: ${roster.session_name}` : t("classesHeading");

  const todayKey = toDateKey(new Date());
  const totalStudents = roster?.students.length ?? 0;
  const holidayMarkers = useMemo(() => buildHolidayMarkers(holidays), [holidays]);
  const dayStats = buildClassDayStats(calendarMonth, totalStudents, classHistory?.entries ?? []);
  const selectedDayEntries = selectedDate
    ? (classHistory?.entries ?? []).filter((entry) => entry.attendance_date === selectedDate)
    : [];
  const approvedLeaveStudentIds = useMemo(
    () => new Set(selectedDayEntries.filter((entry) => entry.source === "approved_leave").map((entry) => entry.student_id)),
    [selectedDayEntries],
  );
  const activeMarkedEntries = Object.entries(marked).filter(([studentId]) => !approvedLeaveStudentIds.has(studentId));
  const markedCount = activeMarkedEntries.length;
  const isSelectedToday = selectedDate === todayKey;
  const onlyApprovedLeaveEntries = selectedDayEntries.length > 0 && selectedDayEntries.every((entry) => entry.source === "approved_leave");
  const showMarkForm = isSelectedToday && (selectedDayEntries.length === 0 || onlyApprovedLeaveEntries || editingToday);

  const studentDayStatus = buildStudentDayStatus(studentHistory?.entries ?? []);
  const studentDayEntries = studentSelectedDate
    ? (studentHistory?.entries ?? []).filter((entry) => entry.attendance_date === studentSelectedDate)
    : [];
  const filteredStudents = (roster?.students ?? []).filter((student) => {
    const query = studentSearch.trim().toLowerCase();
    if (!query) return true;
    return student.name.toLowerCase().includes(query) || student.admission_number.toLowerCase().includes(query);
  });

  function handleSelectClassDate(date: string): void {
    setSelectedDate(date);
    setEditingToday(false);
    setMarked({});
  }

  function startEditingToday(): void {
    const prefill: Record<string, AttendanceStatus> = {};
    for (const entry of selectedDayEntries) {
      if (entry.source !== "approved_leave") prefill[entry.student_id] = entry.status;
    }
    setMarked(prefill);
    setEditingToday(true);
    setHasUnsavedMarks(false);
  }

  return (
    <section className="attendancePanel">
      <header className="panelHeader attendanceHeader">
        <div>
          <span className="eyebrow">{headerEyebrow}</span>
          <h2>{headerTitle}</h2>
          {selectedClass?.course_names.length ? (
            <p className="panelSubtext">{selectedClass.course_names.join(", ")}</p>
          ) : null}
        </div>
        {selectedClassId && (
          <div className="headerActions">
            <Button className="secondaryAction" type="button" onClick={returnToClasses}>
              <ArrowLeft size={17} />
              {t("classesHeading")}
            </Button>
          </div>
        )}
      </header>

      {error && <p className="notice notice-warning">{error}</p>}
      {saveMessage && <p className="notice">{saveMessage}</p>}

      {lockedEntries.length > 0 && (
        <div className="notice notice-warning">
          <p>
            {lockedEntries.length} entr{lockedEntries.length === 1 ? "y" : "ies"} rejected - attendance day is locked
            or covered by approved leave.
          </p>
          {canOverride ? (
            <ul>
              {lockedEntries.map((entry) => (
                <li key={entry.idempotency_key}>
                  {entry.attendance_date} - {roster?.students.find((student) => student.id === entry.subject_id)?.name ?? t("unknownPersonLabel")}
                  <Button type="button" onClick={() => handleOverride(entry)}>
                    {t("override")}
                  </Button>
                </li>
              ))}
            </ul>
          ) : (
            <p>{t("askPrincipalOverride")}</p>
          )}
        </div>
      )}

      {canManageTeacherAttendance && (
        <div className="formActions" style={{ marginTop: 16 }}>
          <Button
            className={attendanceMode === "students" ? "primaryAction" : "secondaryAction"}
            type="button"
            onClick={() => {
              setAttendanceMode("students");
              setSearchParams({});
            }}
          >
            {t("studentAttendanceHeading")}
          </Button>
          <Button
            className={attendanceMode === "teachers" ? "primaryAction" : "secondaryAction"}
            type="button"
            onClick={() => {
              setAttendanceMode("teachers");
              returnToClasses();
              setSearchParams({ mode: "teachers" });
            }}
          >
            {t("teacherAttendanceHeading")}
          </Button>
        </div>
      )}

      {attendanceMode === "teachers" && <TeacherAttendancePanel />}

      {attendanceMode === "students" && !selectedClassId && (
        <div className="attendanceClassGrid" aria-label={t("chooseAttendanceClass")}>
          {classes.flatMap((item) => item.sections.map((section) => (
            <Button className="attendanceClassButton" key={section.id} type="button" onClick={() => selectClass(item.id, section.id)}>
              <span className="attendanceClassIcon" aria-hidden="true"><BookOpen size={18} /></span>
              <span className="attendanceClassBody">
                <strong>{item.name} / {section.name}</strong>
                <small>{item.course_names.join(", ") || t("noCoursesAssigned")}</small>
                <span className="attendanceClassMeta">
                  <UsersRound size={15} />
                  {t("studentCount", { count: section.student_count })}
                </span>
              </span>
              <ChevronRight size={18} aria-hidden="true" />
            </Button>
          )))}
          {!isLoadingClasses && classes.every((item) => item.sections.length === 0) && <p className="emptyState">{t("noAttendanceClasses")}</p>}
          {isLoadingClasses && <p className="emptyState">{t("loadingLabel")}</p>}
        </div>
      )}

      {attendanceMode === "students" && selectedClassId && (
        <>
        <InlineFilter
          className="attendancePeriodFilter"
          filters={[
            {
              key: "course", type: "select", label: t("courseLabel"), value: selectedCourseId,
              placeholder: t("selectCoursePrompt"),
              options: (selectedClass?.courses ?? []).map((course) => ({ value: course.id, label: course.name })),
              onChange: (value) => {
                setSelectedCourseId(value);
                setSelectedSlotId("");
                setRoster(null);
                setSearchParams({ class: selectedClassId, section: selectedSectionId ?? "", course: value, view: activeTab === "studentHistory" ? "history" : "calendar" });
              },
            },
            {
              key: "period", type: "select", label: t("periodCol"), value: selectedSlotId,
              placeholder: t("selectPeriodPrompt"), disabled: !selectedCourseId,
              options: timetableSlots.filter((slot) => slot.course_id === selectedCourseId).map((slot) => ({
                value: slot.id,
                label: t("scheduledPeriodOption", { day: t(attendanceDayKeys[slot.day_of_week] ?? "dayMon"), period: slot.period, start: formatTime(slot.start_time), end: formatTime(slot.end_time) }),
              })),
              onChange: (value) => {
                setSelectedSlotId(value);
                setSearchParams({ class: selectedClassId, section: selectedSectionId ?? "", course: selectedCourseId, slot: value, view: activeTab === "studentHistory" ? "history" : "calendar" });
              },
            },
          ]}
        />
        <div className="formActions" style={{ marginTop: 16 }}>
          <Button
            className={activeTab === "calendar" ? "primaryAction" : "secondaryAction"}
            type="button"
            onClick={() => {
              setActiveTab("calendar");
              setSearchParams({ class: selectedClassId, section: selectedSectionId ?? "", course: selectedCourseId, slot: selectedSlotId, view: "calendar" });
            }}
          >
            {t("calendarTab")}
          </Button>
          <Button
            className={activeTab === "studentHistory" ? "primaryAction" : "secondaryAction"}
            type="button"
            onClick={() => {
              setActiveTab("studentHistory");
              setSearchParams({ class: selectedClassId, section: selectedSectionId ?? "", course: selectedCourseId, slot: selectedSlotId, view: "history", ...(selectedStudentId ? { student: selectedStudentId } : {}) });
            }}
          >
            {t("studentAttendanceHistory")}
          </Button>
        </div>
        {!selectedCourseId || !selectedSlotId ? <p className="notice">{t("chooseCoursePeriodPrompt")}</p> : null}
        </>
      )}

      {attendanceMode === "students" && selectedClassId && selectedCourseId && selectedSlotId && activeTab === "calendar" && (
        <>
          <AttendanceCalendar
            mode="class"
            month={calendarMonth}
            onMonthChange={(next) => {
              setCalendarMonth(next);
              setSelectedDate(null);
              setEditingToday(false);
            }}
            selectedDate={selectedDate}
            onSelectDate={handleSelectClassDate}
            classDayStats={dayStats}
            holidayMarkers={holidayMarkers}
          />

          <section className="attendanceModeSection">
            {isLoadingClassHistory && <p className="emptyState">{t("loadingLabel")}</p>}
            {!isLoadingClassHistory && !selectedDate && <p className="emptyState">{t("selectDayPrompt")}</p>}
            {!isLoadingClassHistory && selectedDate && (
              <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 8 }}>
                <strong>{selectedDate}</strong>
                <HijriTag date={selectedDate} inline />
              </div>
            )}

            {!isLoadingClassHistory && selectedDate && showMarkForm && (
              <div className="roster">
                {isLoadingRoster && <p className="emptyState">{t("loadingLabel")}</p>}
                {!isLoadingRoster && roster?.students.map((student) => {
                  const isApprovedLeaveLocked = approvedLeaveStudentIds.has(student.id);
                  const status = isApprovedLeaveLocked ? "leave" : marked[student.id];
                  return (
                    <article className="rosterRow" key={student.id}>
                      <div>
                        <strong>{student.name}</strong>
                        <small>{student.admission_number}{student.section_name ? ` - ${student.section_name}` : ""}</small>
                        {isApprovedLeaveLocked && <span className="syncBadge">{t("approvedLeaveLabel")}</span>}
                      </div>
                      <div className="statusButtons" aria-label={t("attendanceForStudentLabel", { name: student.name })}>
                        {attendanceOptions.map((option) => (
                          <Button
                            className={status === option ? `statusButton active ${option}` : "statusButton"}
                            key={option}
                            type="button"
                            disabled={readOnly || !sessionId || isApprovedLeaveLocked}
                            onClick={() => mark(student.id, option)}
                          >
                            {t(option)}
                          </Button>
                        ))}
                      </div>
                    </article>
                  );
                })}
                {!isLoadingRoster && roster?.students.length === 0 && <p className="emptyState">{t("noActiveStudentsToMark")}</p>}

                <footer className="outboxStrip">
                  <span>{t("outbox")}</span>
                  <strong>{entries.length}</strong>
                  <span>{t("markedStudents")}</span>
                  <strong>{markedCount}</strong>
                  <small>{t("outboxHelp")}</small>
                  <Button
                    className="primaryAction"
                    type="button"
                    onClick={() => saveAttendance()}
                    disabled={readOnly || !sessionId || !hasUnsavedMarks || markedCount === 0 || isSavingAttendance}
                  >
                    <Save size={18} />
                    {t("saveAttendance")}
                  </Button>
                  <Button
                    className="secondaryAction"
                    type="button"
                    onClick={() => sync()}
                    disabled={readOnly || isSyncing || entries.length === 0}
                  >
                    <CloudUpload size={18} />
                    {t("syncNow")}
                  </Button>
                </footer>
              </div>
            )}

            {!isLoadingClassHistory && selectedDate && !showMarkForm && (
              <>
                <AttendanceHistoryTable entries={selectedDayEntries} includeStudent />
                {isSelectedToday && (
                  <Button className="secondaryAction" type="button" onClick={startEditingToday}>
                    <Pencil size={16} />
                    {t("editAttendance")}
                  </Button>
                )}
              </>
            )}
          </section>
        </>
      )}

      {attendanceMode === "students" && selectedClassId && selectedCourseId && selectedSlotId && activeTab === "studentHistory" && (
        <div className="attendanceStudentSplit">
          <div className="attendanceStudentList">
            <Input
              className="attendanceStudentSearchInput"
              type="text"
              placeholder={t("searchStudentPlaceholder") ?? ""}
              value={studentSearch}
              onChange={(event) => setStudentSearch(event.target.value)}
            />
            {filteredStudents.map((student) => (
              <Button
                className={student.id === selectedStudentId ? "attendanceStudentListButton active" : "attendanceStudentListButton"}
                type="button"
                key={student.id}
                onClick={() => {
                  setSelectedStudentId(student.id);
                  setStudentSelectedDate(null);
                  setSearchParams({ class: selectedClassId, section: selectedSectionId ?? "", course: selectedCourseId, slot: selectedSlotId, view: "history", student: student.id });
                }}
              >
                <strong>{student.name}</strong>
                <small>{student.admission_number}</small>
              </Button>
            ))}
            {filteredStudents.length === 0 && <p className="emptyState">{t("noStudentsFound")}</p>}
          </div>

          <div>
            <AttendanceCalendar
              mode="student"
              month={studentMonth}
              onMonthChange={(next) => {
                setStudentMonth(next);
                setStudentSelectedDate(null);
              }}
              selectedDate={studentSelectedDate}
              onSelectDate={setStudentSelectedDate}
              studentDayStatus={studentDayStatus}
              holidayMarkers={holidayMarkers}
            />
            <section className="attendanceModeSection">
              {isLoadingStudentHistory && <p className="emptyState">{t("loadingLabel")}</p>}
              {!isLoadingStudentHistory && !studentSelectedDate && <p className="emptyState">{t("selectDayPrompt")}</p>}
              {!isLoadingStudentHistory && studentSelectedDate && (
                <>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 8 }}>
                    <strong>{studentSelectedDate}</strong>
                    <HijriTag date={studentSelectedDate} inline />
                  </div>
                  <AttendanceHistoryTable entries={studentDayEntries} includeStudent={false} />
                </>
              )}
            </section>
          </div>
        </div>
      )}
    </section>
  );
}
