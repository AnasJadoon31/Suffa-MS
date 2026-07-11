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

import type { AttendanceStatus } from "../data/mockData";
import { AttendanceCalendar, monthRange, toDateKey, type ClassDayStats, type HolidayMarkers, type StudentDayStatus } from "./AttendanceCalendar";
import { useAttendanceOutbox } from "../hooks/useAttendanceOutbox";
import { useAuth } from "../lib/AuthContext";
import {
  attendanceApi,
  type AttendanceClassOption,
  type AttendanceLogEntry,
  type AttendanceRoster,
  type ClassAttendanceHistory,
  type Holiday,
  type StudentAttendanceHistory,
  type Teacher,
  type TeacherAttendanceLogEntry,
  operationsApi,
  peopleApi,
} from "../lib/endpoints";
import { cachedFetch } from "../lib/offlineCache";
import { SearchDropdown } from "./SearchDropdown";
import { Input } from "./ui/Field";


const attendanceOptions = ["present", "absent", "leave"] as const;
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
        setError(err.response?.data?.detail ?? "Could not load teacher attendance");
      }
    })();
  }, [selectedTeacherId]);

  const matchingTeachers = teachers.filter((teacher) => {
    const query = teacherSearch.trim().toLowerCase();
    if (!query) return true;
    return teacher.name.toLowerCase().includes(query) || teacher.employee_code.toLowerCase().includes(query);
  });

  return (
    <section className="modulePanel">
      <div className="moduleHeader">
        <h2>Teacher attendance</h2>
        <p className="notice">Time-in/time-out logs for teachers.</p>
      </div>
      <div className="moduleToolbar">
        <SearchDropdown
          id="teacher-attendance-search"
          label="Teacher"
          placeholder="Search teacher name or code"
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
          emptyLabel="No matching teachers"
        />
        {(teacherSearch || selectedTeacherId) && (
          <div className="formActions">
            <button
              className="secondaryAction"
              type="button"
              onClick={() => {
                setTeacherSearch("");
                setSelectedTeacherId("");
              }}
            >
              Clear
            </button>
          </div>
        )}
      </div>
      {error && <p className="notice" style={{ color: "var(--rose)" }}>{error}</p>}
      <div className="dataTable">
        <div className="dataRow header">
          <span>Teacher</span>
          <span>Date</span>
          <span>Status</span>
          <span>Time in</span>
          <span>Time out</span>
          <span>Marked by</span>
        </div>
        {logs.length === 0 && <p className="emptyState">No teacher attendance logs yet.</p>}
        {logs.map((entry) => (
          <div className="dataRow" key={entry.id}>
            <span>
              <strong>{entry.teacher_name}</strong>
              <small>{entry.employee_code}</small>
            </span>
            <span>{entry.attendance_date}</span>
            <span>{entry.status}</span>
            <span>{formatTime(entry.check_in)}</span>
            <span>{formatTime(entry.check_out)}</span>
            <span>
              <strong>{entry.marked_by.display_name}</strong>
              <small>{entry.marked_by.username}</small>
            </span>
          </div>
        ))}
      </div>
    </section>
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

  if (entries.length === 0) {
    return <p className="emptyState">{t("noAttendanceHistory")}</p>;
  }

  return (
    <div className={includeStudent ? "dataTable attendanceHistoryTable" : "dataTable attendanceHistoryTable compact"}>
      <div className="dataRow header">
        <span>{t("dateCol")}</span>
        {includeStudent && <span>{t("studentCol")}</span>}
        <span>{t("statusCol")}</span>
        <span>{t("markedByCol")}</span>
        <span>{t("capturedAtCol")}</span>
        <span>{t("syncedAtCol")}</span>
      </div>
      {entries.map((entry) => (
        <div className="dataRow" key={entry.id}>
          <span>{entry.attendance_date}</span>
          {includeStudent && (
            <span>
              <strong>{entry.student_name}</strong>
              <small>{entry.admission_number}</small>
            </span>
          )}
          <span>
            <span className={`statusPill ${entry.status}`}>{t(entry.status)}</span>
            {entry.source === "approved_leave" && <small className="syncBadge">Approved leave</small>}
            {entry.overridden && <small className="syncBadge">{t("overriddenLabel")}</small>}
          </span>
          <span>
            <strong>{entry.marked_by.display_name}</strong>
            <small>{entry.marked_by.username} - {entry.marked_by.role}</small>
          </span>
          <span>
            {formatDateTime(entry.marked_at)}
            {wasCapturedOffline(entry) && <small className="syncBadge">{t("offlineCaptureLabel")}</small>}
          </span>
          <span>{formatDateTime(entry.synced_at)}</span>
        </div>
      ))}
    </div>
  );
}

export function AttendanceBoard({}: AttendanceBoardProps) {
  const { t } = useTranslation();
  const { user, hasPermission } = useAuth();
  const canManageTeacherAttendance = hasPermission("teachers.attendance.manage");
  const [attendanceMode, setAttendanceMode] = useState<AttendanceMode>("students");
  const [marked, setMarked] = useState<Record<string, AttendanceStatus>>({});
  const [classes, setClasses] = useState<AttendanceClassOption[]>([]);
  const [selectedClassId, setSelectedClassId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<AttendanceTab>("calendar");
  const [roster, setRoster] = useState<AttendanceRoster | null>(null);
  const [isLoadingClasses, setIsLoadingClasses] = useState(true);
  const [isLoadingRoster, setIsLoadingRoster] = useState(false);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [isSavingAttendance, setIsSavingAttendance] = useState(false);
  const [hasUnsavedMarks, setHasUnsavedMarks] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");
  const [error, setError] = useState("");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const { entries, lockedKeys, isSyncing, queueAttendanceBatch, sync, overrideEntry } = useAttendanceOutbox(sessionId);
  const canOverride = hasPermission("attendance.edit_locked");
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
  const [selectedStudentId, setSelectedStudentId] = useState("");
  const [studentHistory, setStudentHistory] = useState<StudentAttendanceHistory | null>(null);
  const [isLoadingStudentHistory, setIsLoadingStudentHistory] = useState(false);

  async function handleOverride(entry: (typeof lockedEntries)[number]): Promise<void> {
    const reason = window.prompt(t("overrideReasonPrompt") ?? "Reason for overriding locked attendance day:");
    if (!reason) return;
    await overrideEntry(entry, reason);
  }

  function selectClass(classId: string): void {
    setSelectedClassId(classId);
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
  }

  function returnToClasses(): void {
    setSelectedClassId(null);
    setActiveTab("calendar");
    setClassHistory(null);
    setStudentHistory(null);
    setSelectedStudentId("");
    setHasUnsavedMarks(false);
    setSaveMessage("");
  }

  useEffect(() => {
    void (async () => {
      setIsLoadingClasses(true);
      setError("");
      try {
        const { data } = await cachedFetch("attendance-classes", attendanceApi.listClasses);
        setClasses(data);
      } catch (err: any) {
        setError(err.response?.data?.detail ?? t("failedLoadAttendanceClasses"));
      } finally {
        setIsLoadingClasses(false);
      }
    })();
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
    if (!selectedClassId) {
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
        const { data } = await cachedFetch(`attendance-roster-${selectedClassId}`, () =>
          attendanceApi.classRoster(selectedClassId),
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
  }, [selectedClassId, t]);

  useEffect(() => {
    if (!selectedClassId) return;
    void (async () => {
      setIsLoadingClassHistory(true);
      setError("");
      try {
        setClassHistory(await attendanceApi.classHistory(selectedClassId, monthRange(calendarMonth)));
      } catch (err: any) {
        setClassHistory(null);
        setError(err.response?.data?.detail ?? t("failedLoadAttendanceHistory"));
      } finally {
        setIsLoadingClassHistory(false);
      }
    })();
  }, [selectedClassId, calendarMonth, t]);

  useEffect(() => {
    if (activeTab === "studentHistory" && !selectedStudentId && roster?.students.length) {
      setSelectedStudentId(roster.students[0].id);
    }
  }, [activeTab, roster, selectedStudentId]);

  useEffect(() => {
    if (!selectedClassId || activeTab !== "studentHistory" || !selectedStudentId) return;
    void (async () => {
      setIsLoadingStudentHistory(true);
      setError("");
      try {
        setStudentHistory(
          await attendanceApi.studentHistory(selectedClassId, selectedStudentId, monthRange(studentMonth)),
        );
      } catch (err: any) {
        setStudentHistory(null);
        setError(err.response?.data?.detail ?? t("failedLoadAttendanceHistory"));
      } finally {
        setIsLoadingStudentHistory(false);
      }
    })();
  }, [activeTab, selectedClassId, selectedStudentId, studentMonth, t]);

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

  const headerTitle = roster ? roster.class_name : t("chooseAttendanceClass");
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
            <button className="secondaryAction" type="button" onClick={returnToClasses}>
              <ArrowLeft size={17} />
              {t("classesHeading")}
            </button>
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
                  {entry.attendance_date} - {entry.subject_id}
                  <button type="button" onClick={() => void handleOverride(entry)}>
                    {t("override")}
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p>Ask the Principal to override.</p>
          )}
        </div>
      )}

      {canManageTeacherAttendance && (
        <div className="formActions" style={{ marginTop: 16 }}>
          <button
            className={attendanceMode === "students" ? "primaryAction" : "secondaryAction"}
            type="button"
            onClick={() => setAttendanceMode("students")}
          >
            Student attendance
          </button>
          <button
            className={attendanceMode === "teachers" ? "primaryAction" : "secondaryAction"}
            type="button"
            onClick={() => {
              setAttendanceMode("teachers");
              returnToClasses();
            }}
          >
            Teacher attendance
          </button>
        </div>
      )}

      {attendanceMode === "teachers" && <TeacherAttendancePanel />}

      {attendanceMode === "students" && !selectedClassId && (
        <div className="attendanceClassGrid" aria-label={t("chooseAttendanceClass")}>
          {classes.map((item) => (
            <button className="attendanceClassButton" key={item.id} type="button" onClick={() => selectClass(item.id)}>
              <span className="attendanceClassIcon" aria-hidden="true"><BookOpen size={18} /></span>
              <span className="attendanceClassBody">
                <strong>{item.name}</strong>
                <small>{item.course_names.join(", ") || t("noCoursesAssigned")}</small>
                <span className="attendanceClassMeta">
                  <UsersRound size={15} />
                  {t("studentCount", { count: item.student_count })}
                </span>
              </span>
              <ChevronRight size={18} aria-hidden="true" />
            </button>
          ))}
          {!isLoadingClasses && classes.length === 0 && <p className="emptyState">{t("noAttendanceClasses")}</p>}
          {isLoadingClasses && <p className="emptyState">{t("loadingLabel")}</p>}
        </div>
      )}

      {attendanceMode === "students" && selectedClassId && (
        <div className="formActions" style={{ marginTop: 16 }}>
          <button
            className={activeTab === "calendar" ? "primaryAction" : "secondaryAction"}
            type="button"
            onClick={() => setActiveTab("calendar")}
          >
            {t("calendarTab")}
          </button>
          <button
            className={activeTab === "studentHistory" ? "primaryAction" : "secondaryAction"}
            type="button"
            onClick={() => setActiveTab("studentHistory")}
          >
            {t("studentAttendanceHistory")}
          </button>
        </div>
      )}

      {attendanceMode === "students" && selectedClassId && activeTab === "calendar" && (
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
                        {isApprovedLeaveLocked && <span className="syncBadge">Approved leave</span>}
                      </div>
                      <div className="statusButtons" aria-label={`Attendance for ${student.name}`}>
                        {attendanceOptions.map((option) => (
                          <button
                            className={status === option ? `statusButton active ${option}` : "statusButton"}
                            key={option}
                            type="button"
                            disabled={!sessionId || isApprovedLeaveLocked}
                            onClick={() => mark(student.id, option)}
                          >
                            {t(option)}
                          </button>
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
                  <button
                    className="primaryAction"
                    type="button"
                    onClick={() => void saveAttendance()}
                    disabled={!sessionId || !hasUnsavedMarks || markedCount === 0 || isSavingAttendance}
                  >
                    <Save size={18} />
                    {t("saveAttendance")}
                  </button>
                  <button
                    className="secondaryAction"
                    type="button"
                    onClick={() => void sync()}
                    disabled={isSyncing || entries.length === 0}
                  >
                    <CloudUpload size={18} />
                    {t("syncNow")}
                  </button>
                </footer>
              </div>
            )}

            {!isLoadingClassHistory && selectedDate && !showMarkForm && (
              <>
                <AttendanceHistoryTable entries={selectedDayEntries} includeStudent />
                {isSelectedToday && (
                  <button className="secondaryAction" type="button" onClick={startEditingToday}>
                    <Pencil size={16} />
                    {t("editAttendance")}
                  </button>
                )}
              </>
            )}
          </section>
        </>
      )}

      {attendanceMode === "students" && selectedClassId && activeTab === "studentHistory" && (
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
              <button
                className={student.id === selectedStudentId ? "attendanceStudentListButton active" : "attendanceStudentListButton"}
                type="button"
                key={student.id}
                onClick={() => {
                  setSelectedStudentId(student.id);
                  setStudentSelectedDate(null);
                }}
              >
                <strong>{student.name}</strong>
                <small>{student.admission_number}</small>
              </button>
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
                <AttendanceHistoryTable entries={studentDayEntries} includeStudent={false} />
              )}
            </section>
          </div>
        </div>
      )}
    </section>
  );
}
