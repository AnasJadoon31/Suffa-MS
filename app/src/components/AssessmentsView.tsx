import { useEffect, useState } from "react";
import { BookOpen, ClipboardList, FileDown, Plus, Send } from "lucide-react";
import { useTranslation } from "react-i18next";

import { academicsApi, type AcademicClass, type AcademicSession, type Course } from "../lib/endpoints";
import {
  assessmentsApi,
  type Assignment,
  type ExamType,
  type GradingScheme,
  type SessionResult,
  type Submission,
} from "../lib/endpoints";
import { peopleApi, type Student } from "../lib/endpoints";
import { messagingApi } from "../lib/endpoints";
import { filesApi } from "../lib/endpoints";
import { useAuth } from "../lib/AuthContext";

type Tab = "assignments" | "grading" | "results";

export function AssessmentsView() {
  const { t } = useTranslation();
  const { hasPermission } = useAuth();
  const [tab, setTab] = useState<Tab>("assignments");
  const [classes, setClasses] = useState<AcademicClass[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [sessions, setSessions] = useState<AcademicSession[]>([]);
  const [students, setStudents] = useState<Student[]>([]);

  useEffect(() => {
    void (async () => {
      const c = await academicsApi.listClasses();
      setClasses(c);
      const allCourses = (await Promise.all(c.map((cls) => academicsApi.listCourses(cls.id)))).flat();
      setCourses(allCourses);
      setSessions(await academicsApi.listSessions());
      setStudents(await peopleApi.listStudents());
    })();
  }, []);

  return (
    <section className="modulePanel">
      <div className="moduleHeader">
        <h2>{t("assessmentsTitle")}</h2>
        <p className="notice">{t("assessmentsSubtitle")}</p>
      </div>
      <div className="formActions" style={{ marginBottom: 16 }}>
        <button className={tab === "assignments" ? "primaryAction" : "secondaryAction"} type="button" onClick={() => setTab("assignments")}>
          <ClipboardList size={16} /> {t("assignmentsTab")}
        </button>
        <button className={tab === "grading" ? "primaryAction" : "secondaryAction"} type="button" onClick={() => setTab("grading")}>
          <BookOpen size={16} /> {t("gradingTab")}
        </button>
        <button className={tab === "results" ? "primaryAction" : "secondaryAction"} type="button" onClick={() => setTab("results")}>
          <Send size={16} /> {t("resultsTab")}
        </button>
      </div>
      {tab === "assignments" && (
        <AssignmentsTab classes={classes} courses={courses} canCreate={hasPermission("assignments.create")} />
      )}
      {tab === "grading" && <GradingTab courses={courses} canManage={hasPermission("assessments.exam_types.manage")} />}
      {tab === "results" && (
        <ResultsTab
          students={students}
          sessions={sessions}
          canPublish={hasPermission("assessments.results.publish")}
          canMessage={hasPermission("messaging.send")}
        />
      )}
    </section>
  );
}

function AssignmentsTab({
  classes,
  courses,
  canCreate,
}: Readonly<{ classes: AcademicClass[]; courses: Course[]; canCreate: boolean }>) {
  const { t } = useTranslation();
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [form, setForm] = useState({ class_id: "", course_id: "", title: "", instructions: "", due_date: "" });
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null);
  const [selected, setSelected] = useState<Assignment | null>(null);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [error, setError] = useState("");

  const load = async () => setAssignments(await assessmentsApi.listAssignments());
  useEffect(() => {
    void load();
  }, []);

  const openSubmissions = async (a: Assignment) => {
    setSelected(a);
    setSubmissions(await assessmentsApi.listSubmissions(a.id));
  };

  return (
    <>
      {canCreate && (
        <form
          className="inlineForm"
          onSubmit={async (e) => {
            e.preventDefault();
            setError("");
            try {
              let attachment_key: string | undefined;
              if (attachmentFile) {
                const { object_key, upload_url } = await filesApi.presignUpload({
                  category: "assignments", filename: attachmentFile.name, content_type: attachmentFile.type || "application/octet-stream",
                });
                await fetch(upload_url, { method: "PUT", body: attachmentFile, headers: { "Content-Type": attachmentFile.type || "application/octet-stream" } });
                attachment_key = object_key;
              }
              await assessmentsApi.createAssignment({
                ...form,
                due_date: new Date(form.due_date).toISOString(),
                attachment_key,
              });
              setForm({ class_id: "", course_id: "", title: "", instructions: "", due_date: "" });
              setAttachmentFile(null);
              await load();
            } catch (err: any) {
              setError(err.response?.data?.detail ?? t("failedCreateAssignment"));
            }
          }}
        >
          <label>
            {t("classLabel")}
            <select required value={form.class_id} onChange={(e) => setForm({ ...form, class_id: e.target.value })}>
              <option value="">{t("selectEllipsis")}</option>
              {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
          <label>
            {t("courseLabel")}
            <select required value={form.course_id} onChange={(e) => setForm({ ...form, course_id: e.target.value })}>
              <option value="">{t("selectEllipsis")}</option>
              {courses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
          <label>
            {t("titleLabel")}
            <input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </label>
          <label>
            {t("instructionsLabel")}
            <input required value={form.instructions} onChange={(e) => setForm({ ...form, instructions: e.target.value })} />
          </label>
          <label>
            {t("dueDateLabel")}
            <input required type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} />
          </label>
          <label>
            {t("attachmentLabel")}
            <input type="file" onChange={(e) => setAttachmentFile(e.target.files?.[0] ?? null)} />
          </label>
          <div className="formActions">
            <button className="primaryAction" type="submit"><Plus size={16} /> {t("createAssignmentBtn")}</button>
          </div>
        </form>
      )}
      {error && <p className="notice" style={{ color: "var(--rose)" }}>{error}</p>}
      <div className="dataTable">
        <div className="dataRow header"><span>{t("titleCol")}</span><span>{t("courseCol")}</span><span>{t("dueCol")}</span><span></span></div>
        {assignments.length === 0 && <p className="emptyState">{t("noAssignmentsYet")}</p>}
        {assignments.map((a) => (
          <div className="dataRow" key={a.id}>
            <span>{a.title}</span>
            <span>{courses.find((c) => c.id === a.course_id)?.name ?? "—"}</span>
            <span>{new Date(a.due_date).toLocaleDateString()}</span>
            <span>
              {a.attachment_key && (
                <button
                  className="tableAction"
                  type="button"
                  onClick={async () => {
                    const { url } = await filesApi.presignDownload(a.attachment_key!);
                    window.open(url, "_blank", "noreferrer");
                  }}
                >
                  <FileDown size={14} /> {t("downloadBtn")}
                </button>
              )}
              <button className="tableAction" type="button" onClick={() => openSubmissions(a)}>{t("submissionsBtn")}</button>
            </span>
          </div>
        ))}
      </div>
      {selected && (
        <div className="modulePanel" style={{ marginTop: 16 }}>
          <h3>{t("submissionsHeading", { title: selected.title })}</h3>
          <div className="dataTable">
            <div className="dataRow header"><span>{t("studentCol")}</span><span>{t("submittedCol")}</span><span>{t("lateCol")}</span><span>{t("markCol")}</span><span></span></div>
            {submissions.length === 0 && <p className="emptyState">{t("noSubmissionsYet")}</p>}
            {submissions.map((s) => (
              <SubmissionRow key={s.id} submission={s} onGraded={() => void openSubmissions(selected)} />
            ))}
          </div>
        </div>
      )}
    </>
  );
}

function SubmissionRow({ submission, onGraded }: Readonly<{ submission: Submission; onGraded: () => void }>) {
  const { t } = useTranslation();
  const [mark, setMark] = useState(submission.mark?.toString() ?? "");
  return (
    <div className="dataRow">
      <span>{submission.student_id}</span>
      <span>{new Date(submission.submitted_at).toLocaleString()}</span>
      <span>{submission.is_late ? t("lateLabel") : t("onTimeLabel")}</span>
      <span>
        <input style={{ width: 60 }} value={mark} onChange={(e) => setMark(e.target.value)} />
      </span>
      <span>
        <button
          className="tableAction"
          type="button"
          onClick={async () => {
            const { url } = await filesApi.presignDownload(submission.file_key);
            window.open(url, "_blank", "noreferrer");
          }}
        >
          <FileDown size={14} /> {t("downloadBtn")}
        </button>
        <button
          className="tableAction"
          type="button"
          onClick={async () => {
            await assessmentsApi.gradeSubmission(submission.id, { mark: Number(mark) });
            onGraded();
          }}
        >
          {t("saveBtn")}
        </button>
      </span>
    </div>
  );
}

function GradingTab({ courses, canManage }: Readonly<{ courses: Course[]; canManage: boolean }>) {
  const { t } = useTranslation();
  const [schemes, setSchemes] = useState<GradingScheme[]>([]);
  const [examTypes, setExamTypes] = useState<ExamType[]>([]);
  const [schemeForm, setSchemeForm] = useState({ name: "", bandsText: "Mumtaz:90-100, Jayyid:60-89.99, Rasib:0-59.99" });
  const [examForm, setExamForm] = useState({ course_id: "", name: "", weightage: "", grading_scheme_id: "" });
  const [markForm, setMarkForm] = useState({ exam_type_id: "", student_id: "", score: "" });
  const [error, setError] = useState("");

  const load = async () => {
    setSchemes(await assessmentsApi.listGradingSchemes());
    setExamTypes(await assessmentsApi.listExamTypes());
  };
  useEffect(() => {
    void load();
  }, []);

  const parseBands = (text: string) =>
    text.split(",").map((chunk) => {
      const [label, range] = chunk.trim().split(":");
      const [min, max] = range.split("-").map(Number);
      return { label: label.trim(), min_score: min, max_score: max };
    });

  return (
    <>
      {canManage && (
        <form
          className="inlineForm"
          onSubmit={async (e) => {
            e.preventDefault();
            setError("");
            try {
              await assessmentsApi.createGradingScheme({ name: schemeForm.name, bands: parseBands(schemeForm.bandsText) });
              setSchemeForm({ name: "", bandsText: "" });
              await load();
            } catch (err: any) {
              setError(err.response?.data?.detail ?? t("failedCreateScheme"));
            }
          }}
        >
          <label>{t("schemeNameLabel")}<input required value={schemeForm.name} onChange={(e) => setSchemeForm({ ...schemeForm, name: e.target.value })} /></label>
          <label style={{ gridColumn: "span 2" }}>
            {t("bandsLabel")}
            <input required value={schemeForm.bandsText} onChange={(e) => setSchemeForm({ ...schemeForm, bandsText: e.target.value })} />
          </label>
          <div className="formActions"><button className="primaryAction" type="submit"><Plus size={16} /> {t("addSchemeBtn")}</button></div>
        </form>
      )}
      <div className="dataTable">
        <div className="dataRow header"><span>{t("schemeCol")}</span><span>{t("bandsCol")}</span></div>
        {schemes.length === 0 && <p className="emptyState">{t("noSchemesYet")}</p>}
        {schemes.map((s) => (
          <div className="dataRow" key={s.id}>
            <span>{s.name}</span>
            <span>{s.bands.map((b) => `${b.label} (${b.min_score}-${b.max_score})`).join(", ")}</span>
          </div>
        ))}
      </div>

      {canManage && (
        <form
          className="inlineForm"
          style={{ marginTop: 16 }}
          onSubmit={async (e) => {
            e.preventDefault();
            setError("");
            try {
              await assessmentsApi.createExamType({
                course_id: examForm.course_id,
                name: examForm.name,
                weightage: Number(examForm.weightage),
                grading_scheme_id: examForm.grading_scheme_id,
              });
              setExamForm({ course_id: "", name: "", weightage: "", grading_scheme_id: "" });
              await load();
            } catch (err: any) {
              setError(err.response?.data?.detail ?? t("failedCreateExamType"));
            }
          }}
        >
          <label>
            {t("courseLabel")}
            <select required value={examForm.course_id} onChange={(e) => setExamForm({ ...examForm, course_id: e.target.value })}>
              <option value="">{t("selectEllipsis")}</option>
              {courses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
          <label>{t("examNameLabel")}<input required value={examForm.name} onChange={(e) => setExamForm({ ...examForm, name: e.target.value })} placeholder="Midterm" /></label>
          <label>{t("weightageLabel")}<input required type="number" value={examForm.weightage} onChange={(e) => setExamForm({ ...examForm, weightage: e.target.value })} placeholder="40" /></label>
          <label>
            {t("gradingSchemeLabel")}
            <select required value={examForm.grading_scheme_id} onChange={(e) => setExamForm({ ...examForm, grading_scheme_id: e.target.value })}>
              <option value="">{t("selectEllipsis")}</option>
              {schemes.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </label>
          <div className="formActions"><button className="primaryAction" type="submit"><Plus size={16} /> {t("addExamTypeBtn")}</button></div>
        </form>
      )}
      <div className="dataTable">
        <div className="dataRow header"><span>{t("courseCol")}</span><span>{t("examCol")}</span><span>{t("weightageCol")}</span></div>
        {examTypes.length === 0 && <p className="emptyState">{t("noExamTypesYet")}</p>}
        {examTypes.map((et) => (
          <div className="dataRow" key={et.id}>
            <span>{courses.find((c) => c.id === et.course_id)?.name ?? "—"}</span>
            <span>{et.name}</span>
            <span>{et.weightage}%</span>
          </div>
        ))}
      </div>

      <form
        className="inlineForm"
        style={{ marginTop: 16 }}
        onSubmit={async (e) => {
          e.preventDefault();
          setError("");
          try {
            await assessmentsApi.enterMark({
              exam_type_id: markForm.exam_type_id,
              student_id: markForm.student_id,
              score: Number(markForm.score),
            });
            setMarkForm({ ...markForm, score: "" });
          } catch (err: any) {
            setError(err.response?.data?.detail ?? t("failedEnterMark"));
          }
        }}
      >
        <label>
          {t("examTypeLabel")}
          <select required value={markForm.exam_type_id} onChange={(e) => setMarkForm({ ...markForm, exam_type_id: e.target.value })}>
            <option value="">{t("selectEllipsis")}</option>
            {examTypes.map((et) => <option key={et.id} value={et.id}>{et.name}</option>)}
          </select>
        </label>
        <label>{t("studentIdLabel")}<input required value={markForm.student_id} onChange={(e) => setMarkForm({ ...markForm, student_id: e.target.value })} /></label>
        <label>{t("scoreLabel")}<input required type="number" value={markForm.score} onChange={(e) => setMarkForm({ ...markForm, score: e.target.value })} /></label>
        <div className="formActions"><button className="primaryAction" type="submit">{t("saveMarkBtn")}</button></div>
      </form>
      {error && <p className="notice" style={{ color: "var(--rose)" }}>{error}</p>}
    </>
  );
}

function ResultsTab({
  students,
  sessions,
  canPublish,
  canMessage,
}: Readonly<{ students: Student[]; sessions: AcademicSession[]; canPublish: boolean; canMessage: boolean }>) {
  const { t } = useTranslation();
  const [studentId, setStudentId] = useState("");
  const [sessionId, setSessionId] = useState("");
  const [result, setResult] = useState<SessionResult | null>(null);
  const [error, setError] = useState("");
  const [sendNotice, setSendNotice] = useState("");

  const sendReport = async () => {
    setSendNotice("");
    try {
      const link = await messagingApi.sendReport({ student_id: studentId });
      window.open(link.url, "_blank", "noopener,noreferrer");
    } catch (err: any) {
      setSendNotice(err.response?.data?.detail ?? t("failedSendReport"));
    }
  };

  const lookup = async () => {
    setError("");
    try {
      setResult(await assessmentsApi.sessionResult(studentId, sessionId));
    } catch (err: any) {
      setResult(null);
      setError(err.response?.data?.detail ?? t("failedLoadResult"));
    }
  };

  return (
    <>
      <div className="inlineForm">
        <label>
          {t("studentLabel")}
          <select value={studentId} onChange={(e) => setStudentId(e.target.value)}>
            <option value="">{t("selectEllipsis")}</option>
            {students.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>
        <label>
          {t("sessionLabel")}
          <select value={sessionId} onChange={(e) => setSessionId(e.target.value)}>
            <option value="">{t("selectEllipsis")}</option>
            {sessions.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>
        <div className="formActions">
          <button className="secondaryAction" type="button" onClick={lookup} disabled={!studentId || !sessionId}>{t("viewResultBtn")}</button>
          {canPublish && (
            <button
              className="primaryAction"
              type="button"
              disabled={!studentId || !sessionId}
              onClick={async () => {
                await assessmentsApi.publishResults(sessionId, [studentId]);
                await lookup();
              }}
            >
              <Send size={16} /> {t("publishBtn")}
            </button>
          )}
          {canMessage && (
            <button className="secondaryAction" type="button" disabled={!studentId || !result?.published} onClick={() => void sendReport()}>
              <Send size={16} /> {t("sendToParentsBtn")}
            </button>
          )}
          <button
            className="secondaryAction"
            type="button"
            disabled={!studentId || !sessionId || !result}
            onClick={() => void assessmentsApi.downloadResultCard(studentId, sessionId)}
          >
            <FileDown size={16} /> {t("downloadResultCardBtn")}
          </button>
        </div>
      </div>
      {error && <p className="notice" style={{ color: "var(--rose)" }}>{error}</p>}
      {sendNotice && <p className="notice">{sendNotice}</p>}
      {result && (
        <div className="dataTable">
          <div className="dataRow header"><span>{t("courseCol")}</span><span>{t("scoreCol")}</span><span>{t("bandCol")}</span></div>
          {result.course_results.map((cr) => (
            <div className="dataRow" key={cr.course_id}>
              <span>{cr.course_id}</span>
              <span>{cr.raw_score ?? "—"}</span>
              <span>{cr.band ?? "—"}</span>
            </div>
          ))}
          <div className="dataRow">
            <span><strong>{t("overallLabel")}</strong></span>
            <span><strong>{result.overall_score ?? "—"}</strong></span>
            <span>{result.published ? t("publishedLabel") : t("notPublishedLabel")}</span>
          </div>
        </div>
      )}
    </>
  );
}
