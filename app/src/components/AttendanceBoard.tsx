import { Button, PrimaryButton, SecondaryButton, DangerButton, IconButton, TableAction } from "./ui/Button";
import {
  ArrowLeft,
  BookOpen,
  ChevronRight,
  CloudUpload,
  Pencil,
  Save,
  UsersRound,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router";
import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButton";
import { styled, useTheme } from "@mui/material/styles";

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
import { useDialog } from "../lib/DialogContext";
import { useNavigationGuard } from "../lib/NavigationGuardContext";
import { DataCard } from "./ui/DataCard";
import { FilterBar } from "./ui/FilterBar";


const attendanceOptions = ["present", "absent", "leave"] as const;
const attendanceDayKeys = ["dayMon", "dayTue", "dayWed", "dayThu", "dayFri", "daySat", "daySun"] as const;
type AttendanceTab = "calendar" | "studentHistory";
type AttendanceMode = "students" | "teachers";

export type AttendanceBoardProps = Readonly<Record<string, never>>;

const ClassGrid = styled(Box)(({ theme }) => ({
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
  gap: theme.spacing(1.5),
  marginBottom: theme.spacing(2),
}));

const ClassCard = styled(Paper)(({ theme }) => ({
  padding: theme.spacing(2),
  borderRadius: 16,
  cursor: "pointer",
  transition: "box-shadow 0.2s ease, transform 0.15s ease",
  display: "flex",
  alignItems: "center",
  gap: theme.spacing(1.5),
  "&:hover": {
    boxShadow: theme.shadows[4],
    transform: "translateY(-1px)",
  },
}));

const RosterList = styled(Box)(() => ({
  display: "flex",
  flexDirection: "column",
  gap: 8,
}));

const StatusToggleGroup = styled(ToggleButtonGroup)(({ theme }) => ({
  display: "flex",
  width: "100%",
  "& .MuiToggleButton-root": {
    flex: 1,
    border: "1px solid",
    borderColor: theme.palette.divider,
    borderRadius: 0,
    padding: "8px 4px",
    fontSize: "0.75rem",
    fontWeight: 600,
    textTransform: "none",
    color: theme.palette.text.secondary,
    "&:first-of-type": { borderRadius: "8px 0 0 8px" },
    "&:last-of-type": { borderRadius: "0 8px 8px 0" },
    "&.Mui-selected": {
      backgroundColor: theme.palette.teal.main,
      color: theme.palette.teal.contrastText,
      borderColor: theme.palette.teal.main,
    },
  },
}));

const SaveBar = styled(Box)(({ theme }) => ({
  display: "flex",
  alignItems: "center",
  gap: theme.spacing(1),
  padding: theme.spacing(1.5),
  backgroundColor: theme.palette.background.default,
  borderRadius: 12,
  marginTop: theme.spacing(2),
  flexWrap: "wrap",
}));

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
      <FilterBar
        searchValue={teacherSearch}
        onSearchChange={(query) => {
          setTeacherSearch(query);
          setSelectedTeacherId("");
        }}
        searchPlaceholder={t("searchTeacherPlaceholder")}
      >
        {(teacherSearch || selectedTeacherId) && (
          <SecondaryButton
            type="button"
            onClick={() => {
              setTeacherSearch("");
              setSelectedTeacherId("");
            }}
          >
            {t("clearBtn")}
          </SecondaryButton>
        )}
      </FilterBar>
      {error && <Typography color="error.main">{error}</Typography>}

      <RosterList>
        {logs.length === 0 && <Typography>{t("noTeacherAttendanceLogs")}</Typography>}
        {logs.map((entry) => (
          <DataCard
            key={entry.id}
            title={entry.teacher_name}
            subtitle={entry.employee_code}
            fields={[
              { label: t("dateCol"), value: entry.attendance_date },
              { label: t("statusCol"), value: t(entry.status) },
              { label: t("timeInLabel"), value: formatTime(entry.check_in) },
              { label: t("timeOutLabel"), value: formatTime(entry.check_out) },
              { label: t("markedByCol"), value: entry.marked_by.display_name },
            ]}
          />
        ))}
      </RosterList>
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

function AttendanceHistoryCards({
  entries,
  includeStudent,
}: Readonly<{ entries: AttendanceLogEntry[]; includeStudent: boolean }>) {
  const { t } = useTranslation();

  return (
    <RosterList>
      {entries.length === 0 && <Typography>{t("noAttendanceHistory")}</Typography>}
      {entries.map((entry) => (
        <DataCard
          key={entry.id}
          title={includeStudent ? entry.student_name : entry.attendance_date}
          subtitle={includeStudent ? entry.admission_number : undefined}
          fields={[
            ...(includeStudent ? [{ label: t("admissionNumberCol"), value: entry.admission_number }] : []),
            { label: includeStudent ? t("dateCol") : t("courseAndPeriodLabel"), value: includeStudent ? entry.attendance_date : (entry.legacy_general ? t("legacyGeneralAttendance") : entry.course?.name ?? "—") },
            { label: t("statusCol"), value: t(entry.status) },
            { label: t("markedByCol"), value: entry.marked_by.display_name },
            { label: t("capturedAtCol"), value: formatDateTime(entry.marked_at) },
          ]}
        />
      ))}
    </RosterList>
  );
}

export function AttendanceBoard({}: AttendanceBoardProps) {
  const { t } = useTranslation();
  const { confirm, prompt } = useDialog();
  const { setNavigationGuard } = useNavigationGuard();
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

  const confirmDiscardUnsavedMarks = useCallback(async (): Promise<boolean> => {
    if (!hasUnsavedMarks) return true;
    const approved = await confirm(t("unsavedAttendanceWarning"), {
      title: t("unsavedAttendanceTitle"),
      confirmLabel: t("discardChangesBtn"),
    });
    if (approved) setHasUnsavedMarks(false);
    return approved;
  }, [confirm, hasUnsavedMarks, t]);

  useEffect(() => {
    setNavigationGuard(hasUnsavedMarks ? confirmDiscardUnsavedMarks : null);
    return () => setNavigationGuard(null);
  }, [confirmDiscardUnsavedMarks, hasUnsavedMarks, setNavigationGuard]);

  async function handleOverride(entry: (typeof lockedEntries)[number]): Promise<void> {
    const reason = await prompt(t("overrideReasonPrompt"), {
      title: t("overrideAttendanceTitle"),
      placeholder: t("overrideReasonPlaceholder"),
      confirmLabel: t("saveBtn"),
    });
    if (!reason) return;
    await overrideEntry(entry, reason);
  }

  function clearAttendanceSelection(): void {
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
  }

  async function selectClass(classId: string, sectionId: string): Promise<void> {
    if (!(await confirmDiscardUnsavedMarks())) return;
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

  async function returnToClasses(): Promise<void> {
    if (!(await confirmDiscardUnsavedMarks())) return;
    clearAttendanceSelection();
    setSearchParams({});
  }

  useEffect(() => {
    void (async () => {
      setIsLoadingClasses(true);
      setError("");
      try {
        const { data } = await cachedFetch("attendance-classes", attendanceApi.listClasses);
        setClasses(data);
        const pending = consumePendingClassNav();
        const pendingClass = pending ? data.find((c) => c.id === pending.classId) : undefined;
        const pendingSection = pendingClass?.sections.find((section) => section.id === pending?.sectionId)
          ?? pendingClass?.sections[0];
        if (pendingClass && pendingSection) {
          void selectClass(pendingClass.id, pendingSection.id);
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

  // Auto-select period when only one slot exists for current day
  useEffect(() => {
    if (!selectedCourseId || timetableSlots.length === 0) return;
    const todayDayOfWeek = new Date().getDay();
    const todaysSlots = timetableSlots.filter((slot) => slot.course_id === selectedCourseId && slot.day_of_week === todayDayOfWeek);
    if (todaysSlots.length === 1 && !selectedSlotId) {
      setSelectedSlotId(todaysSlots[0].id);
      setSearchParams((prev) => ({ ...prev, slot: todaysSlots[0].id }));
    }
  }, [selectedCourseId, timetableSlots, selectedSlotId, setSearchParams]);

  useEffect(() => {
    if (!selectedClassId || !selectedSectionId || !selectedCourseId) {
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
    if (!hasUnsavedMarks) return;
    const warnBeforeLeaving = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warnBeforeLeaving);
    return () => window.removeEventListener("beforeunload", warnBeforeLeaving);
  }, [hasUnsavedMarks]);

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

  useEffect(() => {
    if (!roster || activeTab !== "calendar" || selectedDate !== todayKey || editingToday || isLoadingClassHistory) return;
    if (selectedDayEntries.length > 0 && !onlyApprovedLeaveEntries) {
      setMarked({});
      setHasUnsavedMarks(false);
      return;
    }
    const defaults = Object.fromEntries(
      roster.students
        .filter((student) => !approvedLeaveStudentIds.has(student.id))
        .map((student) => [student.id, "present" as AttendanceStatus]),
    );
    setMarked(defaults);
    setHasUnsavedMarks(Object.keys(defaults).length > 0);
    setSaveMessage("");
  }, [
    activeTab,
    approvedLeaveStudentIds,
    editingToday,
    isLoadingClassHistory,
    onlyApprovedLeaveEntries,
    roster,
    selectedDate,
    selectedDayEntries.length,
    todayKey,
  ]);

  function handleSelectClassDate(date: string): void {
    setSelectedDate(date);
    setEditingToday(false);
    setMarked({});
    setHasUnsavedMarks(false);
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

  const theme = useTheme();
  return (
    <section>
      <Box sx={{ mb: 2 }}>
        <Box>
          <Typography variant="caption" sx={{ fontSize: "0.75rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", color: theme.palette.teal.dark }}>{headerEyebrow}</Typography>
          <Typography variant="h5" sx={{ my: 0.5 }}>{headerTitle}</Typography>
          {selectedClass?.course_names.length ? (
            <Typography color="text.secondary">{selectedClass.course_names.join(", ")}</Typography>
          ) : null}
        </Box>
        {selectedClassId && (
          <Box sx={{ mt: 1 }}>
            <SecondaryButton type="button" onClick={() => void returnToClasses()}>
              <ArrowLeft size={17} />
              {t("classesHeading")}
            </SecondaryButton>
          </Box>
        )}
      </Box>

      {error && <Typography color="error.main">{error}</Typography>}
      {saveMessage && <Typography>{saveMessage}</Typography>}

      {lockedEntries.length > 0 && (
        <Paper sx={{ p: 1.5, backgroundColor: "warning.light", borderRadius: 3, mb: 2 }} variant="outlined">
          <Typography>
            {lockedEntries.length} entr{lockedEntries.length === 1 ? "y" : "ies"} rejected - attendance day is locked
            or covered by approved leave.
          </Typography>
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
            <Typography>{t("askPrincipalOverride")}</Typography>
          )}
        </Paper>
      )}

      {canManageTeacherAttendance && (
        <Box sx={{ display: "flex", gap: 1, mb: 2 }}>
          {attendanceMode === "students" ? (
            <PrimaryButton
              type="button"
              onClick={async () => {
                if (!(await confirmDiscardUnsavedMarks())) return;
                setAttendanceMode("students");
                setSearchParams({});
              }}
            >
              {t("studentAttendanceHeading")}
            </PrimaryButton>
          ) : (
            <SecondaryButton
              type="button"
              onClick={async () => {
                if (!(await confirmDiscardUnsavedMarks())) return;
                setAttendanceMode("students");
                setSearchParams({});
              }}
            >
              {t("studentAttendanceHeading")}
            </SecondaryButton>
          )}
          {attendanceMode === "teachers" ? (
            <PrimaryButton
              type="button"
              onClick={async () => {
                if (!(await confirmDiscardUnsavedMarks())) return;
                setAttendanceMode("teachers");
                clearAttendanceSelection();
                setSearchParams({ mode: "teachers" });
              }}
            >
              {t("teacherAttendanceHeading")}
            </PrimaryButton>
          ) : (
            <SecondaryButton
              type="button"
              onClick={async () => {
                if (!(await confirmDiscardUnsavedMarks())) return;
                setAttendanceMode("teachers");
                clearAttendanceSelection();
                setSearchParams({ mode: "teachers" });
              }}
            >
              {t("teacherAttendanceHeading")}
            </SecondaryButton>
          )}
        </Box>
      )}

      {attendanceMode === "teachers" && <TeacherAttendancePanel />}

      {attendanceMode === "students" && !selectedClassId && (
        <ClassGrid>
          {classes.flatMap((item) => item.sections.map((section) => (
            <ClassCard key={section.id} variant="outlined" onClick={() => void selectClass(item.id, section.id)}>
              <Box sx={{ display: "flex", alignItems: "center", justifyContent: "center", width: 40, height: 40, borderRadius: 3, backgroundColor: "divider" }}>
                <BookOpen size={18} />
              </Box>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <strong>{item.name} / {section.name}</strong>
                <Typography component="small" variant="caption" sx={{ display: "block", color: "text.secondary" }}>{item.course_names.join(", ") || t("noCoursesAssigned")}</Typography>
                <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, fontSize: "0.8rem", color: "text.secondary" }}>
                  <UsersRound size={15} />
                  {t("studentCount", { count: section.student_count })}
                </Box>
              </Box>
              <ChevronRight size={18} />
            </ClassCard>
          )))}
          {!isLoadingClasses && classes.every((item) => item.sections.length === 0) && <Typography>{t("noAttendanceClasses")}</Typography>}
          {isLoadingClasses && <Typography>{t("loadingLabel")}</Typography>}
        </ClassGrid>
      )}

      {attendanceMode === "students" && selectedClassId && (
        <>
          <FilterBar
            fields={[
              {
                key: "course",
                type: "select",
                label: t("courseLabel"),
                value: selectedCourseId,
                placeholder: t("selectCoursePrompt"),
                options: (selectedClass?.courses ?? []).map((course) => ({ value: course.id, label: course.name })),
                onChange: async (value) => {
                  if (!(await confirmDiscardUnsavedMarks())) return;
                  setSelectedCourseId(value);
                  setSelectedSlotId("");
                  setRoster(null);
                  setSearchParams({ class: selectedClassId, section: selectedSectionId ?? "", course: value, slot: "", view: activeTab === "studentHistory" ? "history" : "calendar" });
                },
              },
              {
                key: "period",
                type: "select",
                label: t("periodCol"),
                value: selectedSlotId,
                placeholder: t("selectPeriodPrompt"),
                options: timetableSlots
                  .filter((slot) => slot.course_id === selectedCourseId && slot.day_of_week === new Date().getDay())
                  .map((slot) => ({
                    value: slot.id,
                    label: t("scheduledPeriodOption", { day: t(attendanceDayKeys[slot.day_of_week] ?? "dayMon"), period: slot.period, start: formatTime(slot.start_time), end: formatTime(slot.end_time) }),
                  })),
                onChange: async (value) => {
                  if (!(await confirmDiscardUnsavedMarks())) return;
                  setSelectedSlotId(value);
                  setSearchParams({ class: selectedClassId, section: selectedSectionId ?? "", course: selectedCourseId, slot: value, view: activeTab === "studentHistory" ? "history" : "calendar" });
                },
              },
            ]}
          />
          <Box sx={{ display: "flex", gap: 1, mb: 2 }}>
            {activeTab === "calendar" ? (
              <PrimaryButton
                type="button"
                onClick={async () => {
                  if (!(await confirmDiscardUnsavedMarks())) return;
                  setActiveTab("calendar");
                  setSearchParams({ class: selectedClassId, section: selectedSectionId ?? "", course: selectedCourseId, slot: selectedSlotId, view: "calendar" });
                }}
              >
                {t("calendarTab")}
              </PrimaryButton>
            ) : (
              <SecondaryButton
                type="button"
                onClick={async () => {
                  if (!(await confirmDiscardUnsavedMarks())) return;
                  setActiveTab("calendar");
                  setSearchParams({ class: selectedClassId, section: selectedSectionId ?? "", course: selectedCourseId, slot: selectedSlotId, view: "calendar" });
                }}
              >
                {t("calendarTab")}
              </SecondaryButton>
            )}
            {activeTab === "studentHistory" ? (
              <PrimaryButton
                type="button"
                onClick={async () => {
                  if (!(await confirmDiscardUnsavedMarks())) return;
                  setActiveTab("studentHistory");
                  setSearchParams({ class: selectedClassId, section: selectedSectionId ?? "", course: selectedCourseId, slot: selectedSlotId, view: "history", ...(selectedStudentId ? { student: selectedStudentId } : {}) });
                }}
              >
                {t("studentAttendanceHistory")}
              </PrimaryButton>
            ) : (
              <SecondaryButton
                type="button"
                onClick={async () => {
                  if (!(await confirmDiscardUnsavedMarks())) return;
                  setActiveTab("studentHistory");
                  setSearchParams({ class: selectedClassId, section: selectedSectionId ?? "", course: selectedCourseId, slot: selectedSlotId, view: "history", ...(selectedStudentId ? { student: selectedStudentId } : {}) });
                }}
              >
                {t("studentAttendanceHistory")}
              </SecondaryButton>
            )}
          </Box>
          {!selectedCourseId ? <Typography>{t("chooseCoursePeriodPrompt")}</Typography> : null}
          {selectedCourseId && selectedSlotId && (
            <PrimaryButton
              type="button"
              onClick={() => {
                setActiveTab("calendar");
                setSelectedDate(toDateKey(new Date()));
              }}
              sx={{ mb: 2 }}
            >
              {t("markTodayAttendance", { defaultValue: "Mark Today's Attendance" })}
            </PrimaryButton>
          )}
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

          <section>
            {isLoadingClassHistory && <Typography>{t("loadingLabel")}</Typography>}
            {!isLoadingClassHistory && !selectedDate && <Typography>{t("selectDayPrompt")}</Typography>}
            {!isLoadingClassHistory && selectedDate && (
              <Box sx={{ display: "flex", alignItems: "baseline", gap: 1, mb: 1 }}>
                <strong>{selectedDate}</strong>
                <HijriTag date={selectedDate} inline />
              </Box>
            )}

            {!isLoadingClassHistory && selectedDate && showMarkForm && (
              <RosterList>
                {isLoadingRoster && <Typography>{t("loadingLabel")}</Typography>}
                {!isLoadingRoster && roster?.students.map((student) => {
                  const isApprovedLeaveLocked = approvedLeaveStudentIds.has(student.id);
                  const status = isApprovedLeaveLocked ? "leave" : marked[student.id];
                  return (
                    <DataCard
                      key={student.id}
                      title={student.name}
                      subtitle={`${student.admission_number}${student.section_name ? ` - ${student.section_name}` : ""}`}
                      avatar={student.name.charAt(0)}
                      status={isApprovedLeaveLocked ? t("approvedLeaveLabel") : undefined}
                      fields={[
                        { label: t("statusCol"), value: status ? t(status) : "—" },
                      ]}
                      actions={
                        <StatusToggleGroup
                          value={status ?? ""}
                          onChange={(_, value) => { if (value) mark(student.id, value as AttendanceStatus); }}
                          aria-label={t("attendanceForStudentLabel", { name: student.name })}
                          size="small"
                        >
                          {attendanceOptions.map((option) => (
                            <ToggleButton
                              key={option}
                              value={option}
                              aria-label={t(option)}
                              disabled={readOnly || !sessionId || isApprovedLeaveLocked}
                            >
                              {t(option)}
                            </ToggleButton>
                          ))}
                        </StatusToggleGroup>
                      }
                    />
                  );
                })}
                {!isLoadingRoster && roster?.students.length === 0 && <Typography>{t("noActiveStudentsToMark")}</Typography>}

                <SaveBar>
                  <Typography component="span">{t("outbox")}</Typography>
                  <strong>{entries.length}</strong>
                  <Typography component="span">{t("markedStudents")}</Typography>
                  <strong>{markedCount}</strong>
                  <Typography component="small" variant="caption">{t("outboxHelp")}</Typography>
                  <PrimaryButton
                    type="button"
                    onClick={() => saveAttendance()}
                    disabled={readOnly || !sessionId || !hasUnsavedMarks || markedCount === 0 || isSavingAttendance}
                  >
                    <Save size={18} />
                    {t("saveAttendance")}
                  </PrimaryButton>
                  <SecondaryButton
                    type="button"
                    onClick={() => sync()}
                    disabled={readOnly || isSyncing || entries.length === 0}
                  >
                    <CloudUpload size={18} />
                    {t("syncNow")}
                  </SecondaryButton>
                </SaveBar>
              </RosterList>
            )}

            {!isLoadingClassHistory && selectedDate && !showMarkForm && (
              <>
                <AttendanceHistoryCards entries={selectedDayEntries} includeStudent />
                {isSelectedToday && (
                  <SecondaryButton type="button" onClick={startEditingToday}>
                    <Pencil size={16} />
                    {t("editAttendance")}
                  </SecondaryButton>
                )}
              </>
            )}
          </section>
        </>
      )}

      {attendanceMode === "students" && selectedClassId && selectedCourseId && activeTab === "studentHistory" && (
        <Box sx={{ display: { md: "grid" }, gridTemplateColumns: "280px 1fr", gap: 2 }}>
          <Box>
            <Box sx={{ mb: 1 }}>
              <Input
                type="text"
                placeholder={t("searchStudentPlaceholder") ?? ""}
                value={studentSearch}
                onChange={(event) => setStudentSearch(event.target.value)}
              />
            </Box>
            <RosterList>
              {filteredStudents.map((student) => (
                <DataCard
                  key={student.id}
                  title={student.name}
                  subtitle={student.admission_number}
                  avatar={student.name.charAt(0)}
                  onClick={() => {
                    setSelectedStudentId(student.id);
                    setStudentSelectedDate(null);
                    setSearchParams({ class: selectedClassId, section: selectedSectionId ?? "", course: selectedCourseId, slot: selectedSlotId, view: "history", student: student.id });
                  }}
                />
              ))}
            </RosterList>
            {filteredStudents.length === 0 && <Typography>{t("noStudentsFound")}</Typography>}
          </Box>

          <Box>
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
            <section>
              {isLoadingStudentHistory && <Typography>{t("loadingLabel")}</Typography>}
              {!isLoadingStudentHistory && !studentSelectedDate && <Typography>{t("selectDayPrompt")}</Typography>}
              {!isLoadingStudentHistory && studentSelectedDate && (
                <>
                  <Box sx={{ display: "flex", alignItems: "baseline", gap: 1, mb: 1 }}>
                    <strong>{studentSelectedDate}</strong>
                    <HijriTag date={studentSelectedDate} inline />
                  </Box>
                  <AttendanceHistoryCards entries={studentDayEntries} includeStudent={false} />
                </>
              )}
            </section>
          </Box>
        </Box>
      )}
    </section>
  );
}
