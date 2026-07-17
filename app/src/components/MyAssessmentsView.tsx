import { FileDown, Upload } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { academicsApi, assessmentsApi, filesApi, type Assignment, type SessionResult } from "../lib/endpoints";
import { useAuth } from "../lib/AuthContext";
import { useSessionReadOnly } from "./SessionSwitcher";
import { ErrorState, LoadingState } from "./ui/AsyncState";
import { Input } from "./ui/Field";

export function MyAssessmentsView() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const readOnly = useSessionReadOnly();
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [result, setResult] = useState<SessionResult | null>(null);
  const [sessionId, setSessionId] = useState("");
  const [files, setFiles] = useState<Record<string, File | null>>({});
  const [submitted, setSubmitted] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    void (async () => {
      setLoading(true);
      try {
        const [rows, sessions] = await Promise.all([assessmentsApi.listAssignments(), academicsApi.listSessions()]);
        setAssignments(rows);
        const contextId = user?.selected_session_id ?? sessions.find((session) => session.is_active)?.id ?? "";
        setSessionId(contextId);
        if (contextId) {
          try { setResult(await assessmentsApi.myResult(contextId)); } catch { setResult(null); }
        }
      } catch (err: any) {
        setError(err.response?.data?.detail ?? t("failedLoadAssessments"));
      } finally {
        setLoading(false);
      }
    })();
  }, [t, user?.selected_session_id]);

  const submit = async (assignment: Assignment) => {
    const file = files[assignment.id];
    if (!file || readOnly) return;
    setError("");
    try {
      const { object_key, upload_url } = await filesApi.presignUpload({
        category: "submissions", filename: file.name, content_type: file.type || "application/octet-stream", size_bytes: file.size,
      });
      await fetch(upload_url, { method: "PUT", body: file, headers: { "Content-Type": file.type || "application/octet-stream" } });
      await assessmentsApi.submitAssignment(assignment.id, object_key);
      setSubmitted((current) => new Set(current).add(assignment.id));
    } catch (err: any) {
      setError(err.response?.data?.detail ?? t("failedSubmitAssignment"));
    }
  };

  return (
    <section className="modulePanel">
      <div className="moduleHeader"><h2>{t("myAssessments")}</h2><p className="notice">{t("descMyAssessments")}</p></div>
      {loading && <LoadingState />}
      {!loading && error && <ErrorState message={error} />}
      {!loading && !error && result?.published && (
        <div className="notice">
          {t("overallScoreLabel")}: <strong>{result.overall_score ?? "—"}</strong>
          <button className="tableAction" type="button" onClick={() => void assessmentsApi.downloadMyResultCard(sessionId)}>
            <FileDown size={14} /> {t("downloadResultCardBtn")}
          </button>
        </div>
      )}
      {!loading && assignments.length === 0 && <p className="emptyState">{t("nothingDue")}</p>}
      <div className="dataTable">
        {assignments.map((assignment) => (
          <div className="dataRow" key={assignment.id}>
            <span><strong>{assignment.title}</strong><small>{assignment.course_name ?? "—"}</small></span>
            <span>{new Date(assignment.due_date).toLocaleString()}</span>
            <span>{assignment.instructions}</span>
            <span>
              {submitted.has(assignment.id) ? t("submittedLabel") : (
                <>
                  <Input type="file" disabled={readOnly} onChange={(event) => setFiles({ ...files, [assignment.id]: event.target.files?.[0] ?? null })} />
                  <button className="tableAction" type="button" disabled={readOnly || !files[assignment.id]} onClick={() => void submit(assignment)}>
                    <Upload size={14} /> {t("submitBtn")}
                  </button>
                </>
              )}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
