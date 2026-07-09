import { ArrowLeft, BookOpen, ChevronRight, CloudUpload, UsersRound } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import type { AttendanceStatus } from "../data/mockData";
import { useAttendanceOutbox } from "../hooks/useAttendanceOutbox";
import { useAuth } from "../lib/AuthContext";
import { attendanceApi, type AttendanceClassOption, type AttendanceRoster } from "../lib/endpoints";
import { cachedFetch } from "../lib/offlineCache";

const attendanceOptions = ["present", "absent", "leave"] as const;

export type AttendanceBoardProps = Readonly<Record<string, never>>;

export function AttendanceBoard({}: AttendanceBoardProps) {
  const { t } = useTranslation();
  const { hasPermission } = useAuth();
  const [marked, setMarked] = useState<Record<string, AttendanceStatus>>({});
  const [classes, setClasses] = useState<AttendanceClassOption[]>([]);
  const [selectedClassId, setSelectedClassId] = useState<string | null>(null);
  const [roster, setRoster] = useState<AttendanceRoster | null>(null);
  const [isLoadingClasses, setIsLoadingClasses] = useState(true);
  const [isLoadingRoster, setIsLoadingRoster] = useState(false);
  const [error, setError] = useState("");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const { entries, lockedKeys, isSyncing, queueAttendance, sync, overrideEntry } = useAttendanceOutbox(sessionId);
  const canOverride = hasPermission("attendance.edit_locked");
  const lockedEntries = entries.filter((entry) => lockedKeys.includes(entry.idempotency_key));
  const selectedClass = classes.find((item) => item.id === selectedClassId) ?? null;

  async function handleOverride(entry: (typeof lockedEntries)[number]): Promise<void> {
    const reason = window.prompt(t("overrideReasonPrompt") ?? "Reason for overriding locked attendance day:");
    if (!reason) return;
    await overrideEntry(entry, reason);
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
      return;
    }
    void (async () => {
      setIsLoadingRoster(true);
      setError("");
      setMarked({});
      try {
        const { data } = await cachedFetch(`attendance-roster-${selectedClassId}`, () => attendanceApi.classRoster(selectedClassId));
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

  async function mark(studentId: string, status: AttendanceStatus): Promise<void> {
    setMarked((current) => ({ ...current, [studentId]: status }));
    await queueAttendance(studentId, status);
  }

  return (
    <section className="attendancePanel">
      <header className="panelHeader attendanceHeader">
        <div>
          <span className="eyebrow">
            {roster ? `${t("sessionLabel")}: ${roster.session_name}` : t("classesHeading")}
          </span>
          <h2>{roster ? roster.class_name : t("chooseAttendanceClass")}</h2>
          {selectedClass?.course_names.length ? (
            <p className="panelSubtext">{selectedClass.course_names.join(", ")}</p>
          ) : null}
        </div>
        {selectedClassId && (
          <div className="headerActions">
            <button className="secondaryAction" type="button" onClick={() => setSelectedClassId(null)}>
              <ArrowLeft size={17} />
              {t("classesHeading")}
            </button>
            <button
              className="primaryAction"
              type="button"
              onClick={() => void sync()}
              disabled={isSyncing || entries.length === 0}
            >
              <CloudUpload size={18} />
              {t("syncNow")}
            </button>
          </div>
        )}
      </header>

      {error && <p className="notice notice-warning">{error}</p>}

      {lockedEntries.length > 0 && (
        <div className="notice notice-warning">
          <p>
            {lockedEntries.length} entr{lockedEntries.length === 1 ? "y" : "ies"} rejected — attendance day is locked
            (past 23:59).
          </p>
          {canOverride ? (
            <ul>
              {lockedEntries.map((entry) => (
                <li key={entry.idempotency_key}>
                  {entry.attendance_date} · {entry.subject_id}
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
            <button
              className="attendanceClassButton"
              key={item.id}
              type="button"
              onClick={() => setSelectedClassId(item.id)}
            >
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

      {selectedClassId && (
        <div className="roster">
          {isLoadingRoster && <p className="emptyState">{t("loadingLabel")}</p>}
          {!isLoadingRoster && roster?.students.map((student) => {
            const status = marked[student.id];
            return (
              <article className="rosterRow" key={student.id}>
                <div>
                  <strong>{student.name}</strong>
                  <small>{student.admission_number}{student.section_name ? ` · ${student.section_name}` : ""}</small>
                </div>
                <div className="statusButtons" aria-label={`Attendance for ${student.name}`}>
                  {attendanceOptions.map((option) => (
                    <button
                      className={status === option ? `statusButton active ${option}` : "statusButton"}
                      key={option}
                      type="button"
                      disabled={!sessionId}
                      onClick={() => void mark(student.id, option)}
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

      {selectedClassId && (
        <footer className="outboxStrip">
          <span>{t("outbox")}</span>
          <strong>{entries.length}</strong>
          <small>{t("outboxHelp")}</small>
        </footer>
      )}
    </section>
  );
}
