import { FileDown } from "lucide-react";
import { useEffect, useState } from "react";

import { useAuth } from "../lib/AuthContext";
import { academicsApi, type AcademicClass, type AcademicSession, reportingApi } from "../lib/endpoints";

export function ReportsView() {
  const { hasPermission } = useAuth();
  const [classes, setClasses] = useState<AcademicClass[]>([]);
  const [sessions, setSessions] = useState<AcademicSession[]>([]);
  const [classId, setClassId] = useState("");
  const [sessionId, setSessionId] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    void academicsApi.listClasses().then(setClasses);
    void academicsApi.listSessions().then((rows) => {
      setSessions(rows);
      const active = rows.find((s) => s.is_active);
      if (active) setSessionId(active.id);
    });
  }, []);

  const withErrorHandling = async (fn: () => Promise<void>) => {
    setError("");
    try {
      await fn();
    } catch (err: any) {
      setError(err.response?.data?.detail ?? "Failed to generate report");
    }
  };

  return (
    <section className="modulePanel">
      <div className="moduleHeader">
        <h2>Reports</h2>
        <p className="notice">Generate reports by scope and period, export as CSV or PDF.</p>
      </div>

      <div className="inlineForm">
        <label>
          Start date
          <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </label>
        <label>
          End date
          <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        </label>
      </div>

      <div className="modulePanel">
        <div className="moduleHeader"><h3>Attendance summary</h3></div>
        <div className="inlineForm">
          <label>
            Class
            <select value={classId} onChange={(e) => setClassId(e.target.value)}>
              <option value="">Select…</option>
              {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
          <div className="formActions">
            <button
              className="secondaryAction"
              type="button"
              disabled={!classId || !startDate || !endDate}
              onClick={() =>
                void withErrorHandling(() =>
                  reportingApi.downloadAttendanceReport({ class_id: classId, start_date: startDate, end_date: endDate }, "csv")
                )
              }
            >
              <FileDown size={16} /> CSV
            </button>
            <button
              className="secondaryAction"
              type="button"
              disabled={!classId || !startDate || !endDate}
              onClick={() =>
                void withErrorHandling(() =>
                  reportingApi.downloadAttendanceReport({ class_id: classId, start_date: startDate, end_date: endDate }, "pdf")
                )
              }
            >
              <FileDown size={16} /> PDF
            </button>
          </div>
        </div>
      </div>

      {hasPermission("assessments.marks.enter") && (
        <div className="modulePanel">
          <div className="moduleHeader"><h3>Results (gradesheet)</h3></div>
          <div className="inlineForm">
            <label>
              Class
              <select value={classId} onChange={(e) => setClassId(e.target.value)}>
                <option value="">Select…</option>
                {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>
            <label>
              Session
              <select value={sessionId} onChange={(e) => setSessionId(e.target.value)}>
                <option value="">Select…</option>
                {sessions.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </label>
            <div className="formActions">
              <button
                className="secondaryAction"
                type="button"
                disabled={!classId || !sessionId}
                onClick={() =>
                  void withErrorHandling(() =>
                    reportingApi.downloadResultsReport({ class_id: classId, session_id: sessionId }, "csv")
                  )
                }
              >
                <FileDown size={16} /> CSV
              </button>
              <button
                className="secondaryAction"
                type="button"
                disabled={!classId || !sessionId}
                onClick={() =>
                  void withErrorHandling(() =>
                    reportingApi.downloadResultsReport({ class_id: classId, session_id: sessionId }, "pdf")
                  )
                }
              >
                <FileDown size={16} /> PDF
              </button>
            </div>
          </div>
        </div>
      )}

      {hasPermission("finance.reports.view") && (
        <div className="modulePanel">
          <div className="moduleHeader"><h3>Finance report</h3></div>
          <div className="formActions">
            <button
              className="secondaryAction"
              type="button"
              disabled={!startDate || !endDate}
              onClick={() =>
                void withErrorHandling(() => reportingApi.downloadFinanceReport({ start_date: startDate, end_date: endDate }, "csv"))
              }
            >
              <FileDown size={16} /> CSV
            </button>
            <button
              className="secondaryAction"
              type="button"
              disabled={!startDate || !endDate}
              onClick={() =>
                void withErrorHandling(() => reportingApi.downloadFinanceReport({ start_date: startDate, end_date: endDate }, "pdf"))
              }
            >
              <FileDown size={16} /> PDF
            </button>
          </div>
        </div>
      )}

      {error && <p className="notice" style={{ color: "var(--rose)" }}>{error}</p>}
    </section>
  );
}
