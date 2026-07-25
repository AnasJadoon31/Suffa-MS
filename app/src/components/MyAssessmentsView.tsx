import { Button } from "./ui/Button";
import { FileDown, Trash2, Upload } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { academicsApi, assessmentsApi, filesApi, type Assignment, type SessionResult } from "../lib/endpoints";
import { useAuth } from "../lib/AuthContext";
import { PageSection, PageHeader } from "./ui/Layout";
import { useSessionReadOnly } from "./SessionSwitcher";
import { ErrorState, LoadingState } from "./ui/AsyncState";
import { Input } from "./ui/Field";
import { useDialog } from "../lib/DialogContext";

export function MyAssessmentsView() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const readOnly = useSessionReadOnly();
  const dialog = useDialog();
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
      const submission = await assessmentsApi.submitAssignment(assignment.id, object_key);
      setSubmitted((current) => new Set(current).add(assignment.id));
      setAssignments((current) => current.map((item) => item.id === assignment.id ? {
        ...item,
        submission_file_key: submission.file_key,
        submission_mark: submission.mark,
        submission_feedback: submission.feedback,
        submitted_at: submission.submitted_at,
      } : item));
    } catch (err: any) {
      setError(err.response?.data?.detail ?? t("failedSubmitAssignment"));
    }
  };

  const removeSubmission = async (assignment: Assignment) => {
    if (readOnly || !(await dialog.confirm(t("removeSubmissionConfirm")))) return;
    setError("");
    try {
      await assessmentsApi.removeOwnSubmission(assignment.id);
      setAssignments((current) => current.map((item) => item.id === assignment.id ? {
        ...item, submission_file_key: null, submission_mark: null,
        submission_feedback: null, submitted_at: null,
      } : item));
      setSubmitted((current) => {
        const next = new Set(current);
        next.delete(assignment.id);
        return next;
      });
    } catch (err: any) {
      setError(err.response?.data?.detail ?? t("failedRemoveSubmission"));
    }
  };

  return (
    <PageSection>
      <PageHeader title={t("myAssessments")} notice={t("descMyAssessments")} />
      {loading && <LoadingState />}
      {!loading && error && <ErrorState message={error} />}
      {!loading && !error && result?.published && (
        <div className="notice">
          {t("overallScoreLabel")}: <strong>{result.overall_score ?? "—"}</strong>
          <div className="resultSummaryList">
            {result.course_results.map((courseResult) => (
              <span key={courseResult.course_id} className="badge">
                {assignments.find((assignment) => assignment.course_id === courseResult.course_id)?.course_name ?? t("courseLabel")}: {courseResult.raw_score ?? "—"}{courseResult.band ? ` · ${courseResult.band}` : ""}
              </span>
            ))}
          </div>
          <Button className="tableAction" type="button" onClick={() => assessmentsApi.downloadMyResultCard(sessionId)}>
            <FileDown size={14} /> {t("downloadResultCardBtn")}
          </Button>
        </div>
      )}
      {!loading && assignments.length === 0 && <p className="emptyState">{t("nothingDue")}</p>}
      <div className="dataTable">
        <div className="dataRow header assessmentStudentRow">
          <span>{t("assignmentLabel")}</span><span>{t("dueDateLabel")}</span>
          <span>{t("instructionsLabel")}</span><span>{t("submissionActionsLabel")}</span>
        </div>
        {assignments.map((assignment) => (
          <div className="dataRow assessmentStudentRow" key={assignment.id}>
            <span data-label={t("assignmentLabel")}><strong>{assignment.title}</strong><small>{assignment.course_name ?? "—"}</small></span>
            <span data-label={t("dueDateLabel")}>{new Date(assignment.due_date).toLocaleString()}</span>
            <span data-label={t("instructionsLabel")}>{assignment.instructions || "—"}</span>
            <span data-label={t("submissionActionsLabel")}>
              {(assignment.submission_file_key || submitted.has(assignment.id)) ? (
                <span className="submissionSummary">
                  <span>{t("submittedLabel")}</span>
                  {assignment.submission_mark != null && (
                    <span className="badge success">{assignment.submission_mark}{assignment.max_marks ? ` / ${assignment.max_marks}` : ""}</span>
                  )}
                  {assignment.submission_feedback && <span>{t("remarksLabel")}: {assignment.submission_feedback}</span>}
                  {assignment.submission_file_key && (
                    <Button className="tableAction" type="button" onClick={async () => {
                      const { url } = await filesApi.presignDownload(assignment.submission_file_key!);
                      window.open(url, "_blank", "noreferrer");
                    }}>
                      <FileDown size={14} /> {t("downloadBtn")}
                    </Button>
                  )}
                  {!readOnly && new Date() <= new Date(assignment.due_date) && (
                    <>
                      <Input aria-label={t("replacementFileLabel")} type="file" onChange={(event) => setFiles({ ...files, [assignment.id]: event.target.files?.[0] ?? null })} />
                      <Button className="tableAction" type="button" disabled={!files[assignment.id]} onClick={() => submit(assignment)}>
                        <Upload size={14} /> {t("replaceSubmissionBtn")}
                      </Button>
                      <Button className="tableAction dangerAction" type="button" onClick={() => removeSubmission(assignment)}>
                        <Trash2 size={14} /> {t("removeSubmissionBtn")}
                      </Button>
                    </>
                  )}
                </span>
              ) : (
                <>
                  <Input type="file" disabled={readOnly} onChange={(event) => setFiles({ ...files, [assignment.id]: event.target.files?.[0] ?? null })} />
                  <Button className="tableAction" type="button" disabled={readOnly || !files[assignment.id]} onClick={() => submit(assignment)}>
                    <Upload size={14} /> {t("submitBtn")}
                  </Button>
                </>
              )}
            </span>
          </div>
        ))}
      </div>
    </PageSection>
  );
}
