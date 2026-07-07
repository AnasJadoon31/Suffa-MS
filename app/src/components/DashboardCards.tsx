import { AlertTriangle, CircleDollarSign, ClipboardCheck, UsersRound } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import {
  type DashboardData,
  type PrincipalDashboard,
  type StudentDashboard,
  type TeacherDashboard,
  assessmentsApi,
  filesApi,
  reportingApi,
} from "../lib/endpoints";

export type DashboardCardsProps = Readonly<Record<string, never>>;

export function DashboardCards({}: DashboardCardsProps) {
  const [data, setData] = useState<DashboardData | null>(null);

  useEffect(() => {
    void reportingApi.dashboard().then(setData);
  }, []);

  if (!data) return null;
  if (data.role === "teacher") return <TeacherDashboardCards data={data} />;
  if (data.role === "student") return <StudentDashboardCards data={data} />;
  return <PrincipalDashboardCards data={data} />;
}

function PrincipalDashboardCards({ data }: Readonly<{ data: PrincipalDashboard }>) {
  const { t } = useTranslation();
  const attendanceTotal = data.attendance.present + data.attendance.absent + data.attendance.leave;
  const cards = [
    { label: t("people"), value: String(data.counts.students), detail: `${data.counts.teachers} teachers · ${data.counts.classes} classes`, icon: UsersRound },
    {
      label: t("todayAttendance"),
      value: `${data.attendance.present} / ${attendanceTotal || "—"}`,
      detail: attendanceTotal ? `${Math.round((data.attendance.present / attendanceTotal) * 100)}% present` : "No marks yet today",
      icon: ClipboardCheck,
    },
    { label: t("missingSync"), value: String(data.attendance.missing_sync_teachers), detail: "Teachers without today's mark", icon: AlertTriangle },
    { label: t("monthlyIncome"), value: `${data.finance.month_total.toLocaleString()} ${data.finance.currency}`, detail: "Contributions + donations", icon: CircleDollarSign },
  ];

  return (
    <>
      <section className="metricGrid" aria-label="Dashboard summary">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <article className="metricCard" key={card.label}>
              <Icon size={20} />
              <span>{card.label}</span>
              <strong>{card.value}</strong>
              <small>{card.detail}</small>
            </article>
          );
        })}
      </section>
      {data.attendance.missing_sync_teacher_list.length > 0 && (
        <section className="modulePanel">
          <div className="moduleHeader"><h2>Missing attendance sync</h2></div>
          <ul>
            {data.attendance.missing_sync_teacher_list.map((teacher) => <li key={teacher.id}>{teacher.name}</li>)}
          </ul>
        </section>
      )}
      {data.activity.length > 0 && (
        <section className="modulePanel">
          <div className="moduleHeader"><h2>Recent activity</h2></div>
          <ul>
            {data.activity.map((line) => <li key={line}>{line}</li>)}
          </ul>
        </section>
      )}
    </>
  );
}

function TeacherDashboardCards({ data }: Readonly<{ data: TeacherDashboard }>) {
  return (
    <>
      <section className="metricGrid" aria-label="Dashboard summary">
        <article className="metricCard">
          <span>My classes</span>
          <strong>{data.my_classes.length}</strong>
          <small>{data.my_classes.map((c) => `${c.class_name} · ${c.course_name}`).join(", ") || "No assignments yet"}</small>
        </article>
        <article className="metricCard">
          <span>Pending submissions</span>
          <strong>{data.pending_submissions}</strong>
          <small>Ungraded across your classes</small>
        </article>
      </section>
      <section className="modulePanel">
        <div className="moduleHeader"><h2>Today's timetable</h2></div>
        {data.today_timetable.length === 0 && <p className="emptyState">No periods today.</p>}
        <ul>
          {data.today_timetable.map((slot, i) => (
            <li key={i}>{slot.start_time} – {slot.end_time} (period {slot.period})</li>
          ))}
        </ul>
      </section>
    </>
  );
}

function DueAssignmentRow({ assignment, onSubmitted }: Readonly<{ assignment: StudentDashboard["due_assignments"][number]; onSubmitted: () => void }>) {
  const { t } = useTranslation();
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const submit = async () => {
    if (!file) return;
    setError("");
    try {
      const { object_key, upload_url } = await filesApi.presignUpload({
        category: "submissions", filename: file.name, content_type: file.type || "application/octet-stream",
      });
      await fetch(upload_url, { method: "PUT", body: file, headers: { "Content-Type": file.type || "application/octet-stream" } });
      await assessmentsApi.submitAssignment(assignment.id, object_key);
      setSubmitted(true);
      onSubmitted();
    } catch (err: any) {
      setError(err.response?.data?.detail ?? t("failedSubmitAssignment"));
    }
  };

  return (
    <li>
      {assignment.title} — due {assignment.due_date.slice(0, 10)}
      {submitted ? (
        <span> — {t("submittedLabel")}</span>
      ) : (
        <>
          <input type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          <button className="tableAction" type="button" disabled={!file} onClick={() => void submit()}>
            {t("submitBtn")}
          </button>
        </>
      )}
      {error && <span className="notice" style={{ color: "var(--rose)" }}>{error}</span>}
    </li>
  );
}

function StudentDashboardCards({ data }: Readonly<{ data: StudentDashboard }>) {
  return (
    <>
      <section className="metricGrid" aria-label="Dashboard summary">
        <article className="metricCard">
          <span>Overall score</span>
          <strong>{data.latest_result?.overall_score ?? "—"}</strong>
          <small>{data.latest_result?.published ? "Published" : "Not published yet"}</small>
          {data.latest_result?.published && (
            <button
              className="secondaryAction"
              type="button"
              onClick={() => void assessmentsApi.downloadMyResultCard(data.latest_result!.session_id)}
            >
              Download result card
            </button>
          )}
        </article>
        <article className="metricCard">
          <span>Due assignments</span>
          <strong>{data.due_assignments.length}</strong>
          <small>Not yet submitted</small>
        </article>
      </section>
      <section className="modulePanel">
        <div className="moduleHeader"><h2>Today's timetable</h2></div>
        {data.today_timetable.length === 0 && <p className="emptyState">No periods today.</p>}
        <ul>
          {data.today_timetable.map((slot, i) => (
            <li key={i}>{slot.start_time} – {slot.end_time} (period {slot.period})</li>
          ))}
        </ul>
      </section>
      <section className="modulePanel">
        <div className="moduleHeader"><h2>Due assignments</h2></div>
        {data.due_assignments.length === 0 && <p className="emptyState">Nothing due.</p>}
        <ul>
          {data.due_assignments.map((a) => (
            <DueAssignmentRow key={a.id} assignment={a} onSubmitted={() => { /* list refreshes on next dashboard load */ }} />
          ))}
        </ul>
      </section>
      <section className="modulePanel">
        <div className="moduleHeader"><h2>Announcements</h2></div>
        {data.announcements.length === 0 && <p className="emptyState">No announcements.</p>}
        <ul>
          {data.announcements.map((a) => <li key={a.id}>{a.title}</li>)}
        </ul>
      </section>
      <section className="modulePanel">
        <div className="moduleHeader"><h2>Resources</h2></div>
        {data.resources.length === 0 && <p className="emptyState">No resources shared yet.</p>}
        <ul>
          {data.resources.map((r) => <li key={r.id}>{r.title}</li>)}
        </ul>
      </section>
    </>
  );
}
