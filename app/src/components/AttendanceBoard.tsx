import { CloudUpload } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import type { AttendanceStatus } from "../data/mockData";
import { useAttendanceOutbox } from "../hooks/useAttendanceOutbox";
import { academicsApi, peopleApi, type Student } from "../lib/endpoints";

const attendanceOptions = ["present", "absent", "leave"] as const;

export type AttendanceBoardProps = Readonly<Record<string, never>>;

export function AttendanceBoard({}: AttendanceBoardProps) {
  const { t } = useTranslation();
  const [marked, setMarked] = useState<Record<string, AttendanceStatus>>({});
  const [students, setStudents] = useState<Student[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessionName, setSessionName] = useState("");
  const { entries, isSyncing, queueAttendance, sync } = useAttendanceOutbox(sessionId);

  useEffect(() => {
    void (async () => {
      const [sessions, roster] = await Promise.all([academicsApi.listSessions(), peopleApi.listStudents()]);
      const active = sessions.find((s) => s.is_active);
      setSessionId(active?.id ?? null);
      setSessionName(active?.name ?? "No active session");
      setStudents(roster.filter((s) => s.status === "active"));
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
