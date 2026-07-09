import {
  ArrowLeft,
  BookOpen,
  ChevronRight,
  ClipboardCheck,
  CloudUpload,
  History,
  Save,
  UserSearch,
  UsersRound,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import type { AttendanceStatus } from "../data/mockData";
import { useAttendanceOutbox } from "../hooks/useAttendanceOutbox";
import { useAuth } from "../lib/AuthContext";
import {
  attendanceApi,
  type AttendanceClassOption,
  type AttendanceLogEntry,
  type AttendanceRoster,
  type ClassAttendanceHistory,
  type StudentAttendanceHistory,
} from "../lib/endpoints";
import { cachedFetch } from "../lib/offlineCache";

const attendanceOptions = ["present", "absent", "leave"] as const;
type AttendanceMode = "overview" | "classHistory" | "studentHistory" | "markToday";

export type AttendanceBoardProps = Readonly<Record<string, never>>;

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function wasCapturedOffline(entry: AttendanceLogEntry): boolean {
  return new Date(entry.synced_at).getTime() - new Date(entry.marked_at).getTime() > 60_000;
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
  const { hasPermission } = useAuth();
  const [marked, setMarked] = useState<Record<string, AttendanceStatus>>({});
  const [classes, setClasses] = useState<AttendanceClassOption[]>([]);
  const [selectedClassId, setSelectedClassId] = useState<string | null>(null);
  const [activeMode, setActiveMode] = useState<AttendanceMode>("overview");
  const [roster, setRoster] = useState<AttendanceRoster | null>(null);
  const [classHistory, setClassHistory] = useState<ClassAttendanceHistory | null>(null);
  const [studentHistory, setStudentHistory] = useState<StudentAttendanceHistory | null>(null);
  const [selectedStudentId, setSelectedStudentId] = useState("");
  const [isLoadingClasses, setIsLoadingClasses] = useState(true);
  const [isLoadingRoster, setIsLoadingRoster] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [isSavingAttendance, setIsSavingAttendance] = useState(false);
  const [hasUnsavedMarks, setHasUnsavedMarks] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");
  const [error, setError] = useState("");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const { entries, lockedKeys, isSyncing, queueAttendanceBatch, sync, overrideEntry } = useAttendanceOutbox(sessionId);
  const canOverride = hasPermission("attendance.edit_locked");
  const lockedEntries = entries.filter((entry) => lockedKeys.includes(entry.idempotency_key));
  const selectedClass = classes.find((item) => item.id === selectedClassId) ?? null;
  const markedCount = Object.keys(marked).length;

  async function handleOverride(entry: (typeof lockedEntries)[number]): Promise<void> {
    const reason = window.prompt(t("overrideReasonPrompt") ?? "Reason for overriding locked attendance day:");
    if (!reason) return;
    await overrideEntry(entry, reason);
  }

  function selectClass(classId: string): void {
    setSelectedClassId(classId);
    setActiveMode("overview");
    setClassHistory(null);
    setStudentHistory(null);
    setSelectedStudentId("");
    setHasUnsavedMarks(false);
    setSaveMessage("");
  }

  function returnToClasses(): void {
    setSelectedClassId(null);
    setActiveMode("overview");
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
    if (!selectedClassId || activeMode !== "classHistory") return;
    void (async () => {
      setIsLoadingHistory(true);
      setError("");
      try {
        setClassHistory(await attendanceApi.classHistory(selectedClassId));
      } catch (err: any) {
        setClassHistory(null);
        setError(err.response?.data?.detail ?? t("failedLoadAttendanceHistory"));
      } finally {
        setIsLoadingHistory(false);
      }
    })();
  }, [activeMode, selectedClassId, t]);

  useEffect(() => {
    if (activeMode === "studentHistory" && !selectedStudentId && roster?.students.length) {
      setSelectedStudentId(roster.students[0].id);
    }
  }, [activeMode, roster, selectedStudentId]);

  useEffect(() => {
    if (!selectedClassId || activeMode !== "studentHistory" || !selectedStudentId) return;
    void (async () => {
      setIsLoadingHistory(true);
      setError("");
      try {
        setStudentHistory(await attendanceApi.studentHistory(selectedClassId, selectedStudentId));
      } catch (err: any) {
        setStudentHistory(null);
        setError(err.response?.data?.detail ?? t("failedLoadAttendanceHistory"));
      } finally {
        setIsLoadingHistory(false);
      }
    })();
  }, [activeMode, selectedClassId, selectedStudentId, t]);

  function mark(studentId: string, status: AttendanceStatus): void {
    setMarked((current) => ({ ...current, [studentId]: status }));
    setHasUnsavedMarks(true);
    setSaveMessage("");
  }

  async function saveAttendance(): Promise<void> {
    if (!sessionId || markedCount === 0) return;
    setIsSavingAttendance(true);
    setError("");
    try {
      await queueAttendanceBatch(marked);
      setHasUnsavedMarks(false);
      setSaveMessage(navigator.onLine ? t("attendanceSavedSyncing") : t("attendanceSavedOffline"));
    } catch (err: any) {
      setError(err.response?.data?.detail ?? t("failedSaveAttendance"));
    } finally {
      setIsSavingAttendance(false);
    }
  }

  const headerTitle = roster ? roster.class_name : t("chooseAttendanceClass");
  const headerEyebrow = roster ? `${t("sessionLabel")}: ${roster.session_name}` : t("classesHeading");

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
            {activeMode !== "overview" && (
              <button className="secondaryAction" type="button" onClick={() => setActiveMode("overview")}>
                <ArrowLeft size={17} />
                {t("classOverview")}
              </button>
            )}
            <button className="secondaryAction" type="button" onClick={returnToClasses}>
              <BookOpen size={17} />
              {t("classesHeading")}
            </button>
            {activeMode === "markToday" && (
              <>
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
              </>
            )}
          </div>
        )}
      </header>

      {error && <p className="notice notice-warning">{error}</p>}
      {activeMode === "markToday" && saveMessage && <p className="notice">{saveMessage}</p>}

      {lockedEntries.length > 0 && (
        <div className="notice notice-warning">
          <p>
            {lockedEntries.length} entr{lockedEntries.length === 1 ? "y" : "ies"} rejected - attendance day is locked
            (past 23:59).
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

      {!selectedClassId && (
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

      {selectedClassId && activeMode === "overview" && (
        <div className="attendanceActionGrid" aria-label={t("attendanceOptions")}>
          <button className="attendanceActionButton" type="button" onClick={() => setActiveMode("classHistory")}>
            <span className="attendanceClassIcon" aria-hidden="true"><History size={18} /></span>
            <span>
              <strong>{t("classAttendanceHistory")}</strong>
              <small>{roster ? t("studentCount", { count: roster.students.length }) : t("loadingLabel")}</small>
            </span>
            <ChevronRight size={18} aria-hidden="true" />
          </button>
          <button className="attendanceActionButton" type="button" onClick={() => setActiveMode("studentHistory")}>
            <span className="attendanceClassIcon" aria-hidden="true"><UserSearch size={18} /></span>
            <span>
              <strong>{t("studentAttendanceHistory")}</strong>
              <small>{t("studentLabel")}</small>
            </span>
            <ChevronRight size={18} aria-hidden="true" />
          </button>
          <button className="attendanceActionButton primary" type="button" onClick={() => setActiveMode("markToday")}>
            <span className="attendanceClassIcon" aria-hidden="true"><ClipboardCheck size={18} /></span>
            <span>
              <strong>{t("markTodayAttendance")}</strong>
              <small>{t("todayLabel")}</small>
            </span>
            <ChevronRight size={18} aria-hidden="true" />
          </button>
        </div>
      )}

      {selectedClassId && activeMode === "classHistory" && (
        <section className="attendanceModeSection">
          <div className="moduleHeader"><h2>{t("classAttendanceHistory")}</h2></div>
          {isLoadingHistory ? (
            <p className="emptyState">{t("loadingLabel")}</p>
          ) : (
            <AttendanceHistoryTable entries={classHistory?.entries ?? []} includeStudent />
          )}
        </section>
      )}

      {selectedClassId && activeMode === "studentHistory" && (
        <section className="attendanceModeSection">
          <div className="moduleHeader"><h2>{t("studentAttendanceHistory")}</h2></div>
          <div className="inlineForm attendanceStudentPicker">
            <label>
              {t("studentLabel")}
              <select value={selectedStudentId} onChange={(event) => setSelectedStudentId(event.target.value)}>
                {roster?.students.map((student) => (
                  <option key={student.id} value={student.id}>
                    {student.name} ({student.admission_number})
                  </option>
                ))}
              </select>
            </label>
          </div>
          {isLoadingRoster || isLoadingHistory ? (
            <p className="emptyState">{t("loadingLabel")}</p>
          ) : selectedStudentId ? (
            <AttendanceHistoryTable entries={studentHistory?.entries ?? []} includeStudent={false} />
          ) : (
            <p className="emptyState">{t("noActiveStudentsToMark")}</p>
          )}
        </section>
      )}

      {selectedClassId && activeMode === "markToday" && (
        <div className="roster">
          {isLoadingRoster && <p className="emptyState">{t("loadingLabel")}</p>}
          {!isLoadingRoster && roster?.students.map((student) => {
            const status = marked[student.id];
            return (
              <article className="rosterRow" key={student.id}>
                <div>
                  <strong>{student.name}</strong>
                  <small>{student.admission_number}{student.section_name ? ` - ${student.section_name}` : ""}</small>
                </div>
                <div className="statusButtons" aria-label={`Attendance for ${student.name}`}>
                  {attendanceOptions.map((option) => (
                    <button
                      className={status === option ? `statusButton active ${option}` : "statusButton"}
                      key={option}
                      type="button"
                      disabled={!sessionId}
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
        </div>
      )}

      {selectedClassId && activeMode === "markToday" && (
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
        </footer>
      )}
    </section>
  );
}
