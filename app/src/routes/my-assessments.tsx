import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Upload, Trash2, FileDown } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { AppShell } from "@/components/app/AppShell";
import { Card, EmptyState, Pill, SectionTitle, SkeletonList } from "@/components/app/Primitives";
import { useAuth } from "@/lib/mms/auth";
import { academicsApi, type AcademicSession } from "@/lib/mms/endpoints";
import { assessmentsApi, filesApi, type Assignment, type SessionResult } from "@/lib/mms/more-endpoints";
import { apiErrorMessage } from "@/lib/mms/api";

export const Route = createFileRoute("/my-assessments")({
  head: () => ({
    meta: [
      { title: "My Assessments — Suffa MS" },
      { name: "description", content: "My assignments and submission status" },
    ],
  }),
  component: MyAssessmentsPage,
});

function MyAssessmentsPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const client = useQueryClient();

  const [files, setFiles] = useState<Record<string, File | null>>({});
  const [submitting, setSubmitting] = useState<Set<string>>(new Set());
  const [error, setError] = useState("");

  const sessions = useQuery({
    queryKey: ["sessions"],
    queryFn: () => academicsApi.listSessions(),
  });

  const contextId =
    user?.selected_session_id ??
    sessions.data?.find((s) => s.is_active)?.id ??
    "";

  const assignments = useQuery({
    queryKey: ["assignments"],
    queryFn: () => assessmentsApi.listAssignments(),
    enabled: Boolean(user),
  });

  const result = useQuery({
    queryKey: ["my-result", contextId],
    queryFn: () => (contextId ? assessmentsApi.myResult(contextId) : Promise.reject()),
    enabled: Boolean(contextId),
  });

  const handleFileSelect = (assignmentId: string, file: File | null) => {
    setFiles((prev) => ({ ...prev, [assignmentId]: file }));
  };

  const handleSubmit = async (assignment: Assignment) => {
    const file = files[assignment.id];
    if (!file) return;
    setError("");
    setSubmitting((prev) => new Set(prev).add(assignment.id));
    try {
      const { object_key, upload_url } = await filesApi.presignUpload({
        category: "submissions",
        filename: file.name,
        content_type: file.type || "application/octet-stream",
        size_bytes: file.size,
      });
      await fetch(upload_url, { method: "PUT", body: file, headers: { "Content-Type": file.type || "application/octet-stream" } });
      await assessmentsApi.submitAssignment(assignment.id, object_key);
      await client.invalidateQueries({ queryKey: ["assignments"] });
    } catch (err) {
      setError(apiErrorMessage(err, t("Failed to submit assignment")));
    } finally {
      setSubmitting((prev) => {
        const next = new Set(prev);
        next.delete(assignment.id);
        return next;
      });
    }
  };

  const handleRemove = async (assignmentId: string) => {
    setError("");
    try {
      await assessmentsApi.removeOwnSubmission(assignmentId);
      await client.invalidateQueries({ queryKey: ["assignments"] });
    } catch (err) {
      setError(apiErrorMessage(err, t("Failed to remove submission")));
    }
  };

  return (
    <AppShell title={t("My assessments")} subtitle={t("Assignments and submissions")}>
      {assignments.isLoading ? <SkeletonList rows={4} /> : null}
      {assignments.isError ? (
        <EmptyState title={apiErrorMessage(assignments.error, t("Could not load assignments"))} />
      ) : null}
      {error ? (
        <p className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error}</p>
      ) : null}

      {result.data ? (
        <>
          <SectionTitle>{t("My result for this session")}</SectionTitle>
          <Card>
            <p className="text-sm">{result.data.summary}</p>
          </Card>
        </>
      ) : null}

      <SectionTitle>{t("Assignments")}</SectionTitle>
      {assignments.data?.length === 0 ? (
        <EmptyState title={t("No assignments yet")} />
      ) : (
        <div className="space-y-2.5">
          {assignments.data?.map((assignment) => {
            const submitted = Boolean(assignment.submission_file_key);
            const isSubmitting = submitting.has(assignment.id);
            return (
              <Card key={assignment.id} className="space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold">{assignment.title}</p>
                    {assignment.description ? (
                      <p className="mt-0.5 text-xs text-muted-foreground">{assignment.description}</p>
                    ) : null}
                    {assignment.due_date ? (
                      <p className="mt-1 text-xs">
                        <Pill tone="warning">{t("Due")} {assignment.due_date.slice(0, 10)}</Pill>
                      </p>
                    ) : null}
                  </div>
                  <Pill tone={submitted ? "success" : "warning"}>
                    {submitted ? t("Submitted") : t("Pending")}
                  </Pill>
                </div>
                {submitted ? (
                  <button
                    onClick={() => handleRemove(assignment.id)}
                    className="flex items-center gap-1 text-xs text-destructive"
                  >
                    <Trash2 className="h-3 w-3" />
                    {t("Remove submission")}
                  </button>
                ) : (
                  <div className="flex items-center gap-2">
                    <input
                      type="file"
                      accept=".pdf,.doc,.docx,.txt,.jpg,.png,.webp"
                      onChange={(e) => handleFileSelect(assignment.id, e.target.files?.[0] ?? null)}
                      className="text-xs text-muted-foreground file:rounded-lg file:border file:border-border file:bg-card file:px-2 file:py-1 file:text-xs file:font-semibold file:text-foreground"
                    />
                    <button
                      onClick={() => handleSubmit(assignment)}
                      disabled={!files[assignment.id] || isSubmitting}
                      className="flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground disabled:opacity-50"
                    >
                      <Upload className="h-3 w-3" />
                      {isSubmitting ? t("Uploading...") : t("Submit")}
                    </button>
                  </div>
                )}
                {assignment.submission_mark != null ? (
                  <p className="text-xs">
                    {t("Mark")}: {assignment.submission_mark}{" "}
                    {assignment.submission_feedback ? `— ${assignment.submission_feedback}` : ""}
                  </p>
                ) : null}
              </Card>
            );
          })}
        </div>
      )}
    </AppShell>
  );
}
