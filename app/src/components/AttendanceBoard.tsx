import { CloudUpload } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import type { AttendanceStatus } from "../data/mockData";
import { useAttendanceOutbox } from "../hooks/useAttendanceOutbox";
import { useAuth } from "../lib/AuthContext";
import { academicsApi, peopleApi, type Student } from "../lib/endpoints";
import { cachedFetch } from "../lib/offlineCache";

const attendanceOptions = ["present", "absent", "leave"] as const;

export type AttendanceBoardProps = Readonly<Record<string, never>>;

export function AttendanceBoard({}: AttendanceBoardProps) {
  const { t } = useTranslation();
  const { hasPermission } = useAuth();
  const [marked, setMarked] = useState<Record<string, AttendanceStatus>>({});
  const [students, setStudents] = useState<Student[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessionName, setSessionName] = useState("");
  const { entries, lockedKeys, isSyncing, queueAttendance, sync, overrideEntry } = useAttendanceOutbox(sessionId);
  const canOverride = hasPermission("attendance.edit_locked");
  const lockedEntries = entries.filter((entry) => lockedKeys.includes(entry.idempotency_key));

  async function handleOverride(entry: (typeof lockedEntries)[number]): Promise<void> {
    const reason = window.prompt(t("overrideReasonPrompt") ?? "Reason for overriding locked attendance day:");
    if (!reason) return;
    await overrideEntry(entry, reason);
  }

  useEffect(() => {
    void (async () => {
      // Cached so the roster and active session survive a fully offline day —
      // marks queue in the outbox and sync once back online (§3.4).
      const { data } = await cachedFetch("attendance-roster", async () => {
        const [sessions, roster] = await Promise.all([academicsApi.listSessions(), peopleApi.listStudents()]);
        return { sessions, roster };
      });
      const active = data.sessions.find((s) => s.is_active);
      setSessionId(active?.id ?? null);
      setSessionName(active?.name ?? "No active session");
      setStudents(data.roster.filter((s) => s.status === "active"));
    })();
  }, []);

  async function mark(studentId: string, status: AttendanceStatus): Promise<void> {
    setMarked((current) => ({ ...current, [studentId]: status }));
    await queueAttendance(studentId, status);
  }

  return (
    <section className="attendancePanel">
      <header className="panelHeader">
        <div>
          <span className="eyebrow">Session: {sessionName}</span>
          <h2>{t("markAttendance")}</h2>
        </div>
        <button
          className="primaryAction"
          type="button"
          onClick={() => void sync()}
          disabled={isSyncing || entries.length === 0}
        >
          <CloudUpload size={18} />
          {t("syncNow")}
        </button>
      </header>

      {!sessionId && <p className="notice">No active academic session — activate one under Academics first.</p>}

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

      <div className="roster">
        {students.map((student) => {
          const status = marked[student.id];
          return (
            <article className="rosterRow" key={student.id}>
              <div>
                <strong>{student.name}</strong>
                <small>{student.admission_number}</small>
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
        {students.length === 0 && <p className="emptyState">No active students to mark.</p>}
      </div>

      <footer className="outboxStrip">
        <span>{t("outbox")}</span>
        <strong>{entries.length}</strong>
        <small>Saved locally, syncs automatically when online</small>
      </footer>
    </section>
  );
}
