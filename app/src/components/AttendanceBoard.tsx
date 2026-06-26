import { CloudUpload } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { students, type AttendanceStatus } from "../data/mockData";
import { useAttendanceOutbox } from "../hooks/useAttendanceOutbox";

const attendanceOptions = ["present", "absent", "leave"] as const;

export type AttendanceBoardProps = Readonly<Record<string, never>>;

export function AttendanceBoard({}: AttendanceBoardProps) {
  const { t } = useTranslation();
  const [marked, setMarked] = useState<Record<string, AttendanceStatus>>({});
  const { entries, isSyncing, queueAttendance, sync } = useAttendanceOutbox();

  async function mark(studentId: string, status: AttendanceStatus): Promise<void> {
    setMarked((current) => ({ ...current, [studentId]: status }));
    await queueAttendance(studentId, status);
  }

  return (
    <section className="attendancePanel">
      <header className="panelHeader">
        <div>
          <span className="eyebrow">Darja 1 · Quran</span>
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

      <div className="roster">
        {students.map((student) => {
          const status = marked[student.id] ?? student.status;
          return (
            <article className="rosterRow" key={student.id}>
              <div>
                <strong>{student.name}</strong>
                <small>{student.admissionNumber} · {student.className}</small>
              </div>
              <div className="statusButtons" aria-label={`Attendance for ${student.name}`}>
                {attendanceOptions.map((option) => (
                  <button
                    className={status === option ? `statusButton active ${option}` : "statusButton"}
                    key={option}
                    type="button"
                    onClick={() => void mark(student.id, option)}
                  >
                    {t(option)}
                  </button>
                ))}
              </div>
            </article>
          );
        })}
      </div>

      <footer className="outboxStrip">
        <span>{t("outbox")}</span>
        <strong>{entries.length}</strong>
        <small>Saved locally for 7-day offline workflow</small>
      </footer>
    </section>
  );
}
