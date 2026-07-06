import { useEffect, useState } from "react";
import { CheckCircle2, Plus } from "lucide-react";

import {
  type AcademicClass,
  type AcademicSession,
  type Course,
  type Program,
  type Section,
  type TeacherAssignment,
  academicsApi,
} from "../lib/endpoints";
import { peopleApi, type Teacher } from "../lib/endpoints";

export function AcademicsView() {
  const [programs, setPrograms] = useState<Program[]>([]);
  const [classes, setClasses] = useState<AcademicClass[]>([]);
  const [sections, setSections] = useState<Record<string, Section[]>>({});
  const [courses, setCourses] = useState<Record<string, Course[]>>({});
  const [sessions, setSessions] = useState<AcademicSession[]>([]);
  const [assignments, setAssignments] = useState<TeacherAssignment[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);

  const [programName, setProgramName] = useState("");
  const [className, setClassName] = useState("");
  const [classProgramId, setClassProgramId] = useState("");
  const [sectionClassId, setSectionClassId] = useState("");
  const [sectionName, setSectionName] = useState("");
  const [courseClassId, setCourseClassId] = useState("");
  const [courseName, setCourseName] = useState("");
  const [sessionForm, setSessionForm] = useState({ name: "", gregorian_start: "", gregorian_end: "", hijri_span: "" });
  const [assignForm, setAssignForm] = useState({ teacher_id: "", session_id: "", class_id: "", course_id: "" });

  const refreshAll = async () => {
    const [p, c, s, t] = await Promise.all([
      academicsApi.listPrograms(),
      academicsApi.listClasses(),
      academicsApi.listSessions(),
      peopleApi.listTeachers(),
    ]);
    setPrograms(p);
    setClasses(c);
    setSessions(s);
    setTeachers(t);
    const secByClass: Record<string, Section[]> = {};
    const courseByClass: Record<string, Course[]> = {};
    for (const cls of c) {
      secByClass[cls.id] = await academicsApi.listSections(cls.id);
      courseByClass[cls.id] = await academicsApi.listCourses(cls.id);
    }
    setSections(secByClass);
    setCourses(courseByClass);
    setAssignments(await academicsApi.listTeacherAssignments());
  };

  useEffect(() => {
    void refreshAll();
  }, []);

  const allCourses = Object.values(courses).flat();

  return (
    <section className="modulePanel">
      <div className="moduleHeader">
        <h2>Academic Structure</h2>
        <p className="notice">Programs, classes, sections, courses, sessions, and teacher assignments.</p>
      </div>

      <h3>Programs</h3>
      <form
        className="inlineForm"
        onSubmit={async (e) => {
          e.preventDefault();
          await academicsApi.createProgram(programName);
          setProgramName("");
          await refreshAll();
        }}
      >
        <label>
          Program name
          <input required value={programName} onChange={(e) => setProgramName(e.target.value)} placeholder="e.g. Hifz" />
        </label>
        <div className="formActions">
          <button className="primaryAction" type="submit"><Plus size={16} /> Add program</button>
        </div>
      </form>
      <div className="dataTable">
        <div className="dataRow header"><span>Name</span></div>
        {programs.length === 0 && <p className="emptyState">No programs yet.</p>}
        {programs.map((p) => <div className="dataRow" key={p.id}><span>{p.name}</span></div>)}
      </div>

      <h3 style={{ marginTop: 24 }}>Classes</h3>
      <form
        className="inlineForm"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!classProgramId) return;
          await academicsApi.createClass(classProgramId, className);
          setClassName("");
          await refreshAll();
        }}
      >
        <label>
          Program
          <select required value={classProgramId} onChange={(e) => setClassProgramId(e.target.value)}>
            <option value="">Select…</option>
            {programs.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
        <label>
          Class name
          <input required value={className} onChange={(e) => setClassName(e.target.value)} placeholder="e.g. Darja 1" />
        </label>
        <div className="formActions">
          <button className="primaryAction" type="submit"><Plus size={16} /> Add class</button>
        </div>
      </form>
      <div className="dataTable">
        <div className="dataRow header"><span>Name</span><span>Program</span></div>
        {classes.length === 0 && <p className="emptyState">No classes yet.</p>}
        {classes.map((c) => (
          <div className="dataRow" key={c.id}>
            <span>{c.name}</span>
            <span>{programs.find((p) => p.id === c.program_id)?.name ?? "—"}</span>
          </div>
        ))}
      </div>

      <h3 style={{ marginTop: 24 }}>Sections &amp; Courses</h3>
      <form
        className="inlineForm"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!sectionClassId) return;
          await academicsApi.createSection(sectionClassId, sectionName);
          setSectionName("");
          await refreshAll();
        }}
      >
        <label>
          Class
          <select required value={sectionClassId} onChange={(e) => setSectionClassId(e.target.value)}>
            <option value="">Select…</option>
            {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        <label>
          Section name
          <input required value={sectionName} onChange={(e) => setSectionName(e.target.value)} placeholder="e.g. A" />
        </label>
        <div className="formActions">
          <button className="primaryAction" type="submit"><Plus size={16} /> Add section</button>
        </div>
      </form>
      <form
        className="inlineForm"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!courseClassId) return;
          await academicsApi.createCourse(courseClassId, courseName);
          setCourseName("");
          await refreshAll();
        }}
      >
        <label>
          Class
          <select required value={courseClassId} onChange={(e) => setCourseClassId(e.target.value)}>
            <option value="">Select…</option>
            {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        <label>
          Course name
          <input required value={courseName} onChange={(e) => setCourseName(e.target.value)} placeholder="e.g. Quran" />
        </label>
        <div className="formActions">
          <button className="primaryAction" type="submit"><Plus size={16} /> Add course</button>
        </div>
      </form>
      <div className="dataTable">
        <div className="dataRow header"><span>Class</span><span>Sections</span><span>Courses</span></div>
        {classes.map((c) => (
          <div className="dataRow" key={c.id}>
            <span>{c.name}</span>
            <span>{(sections[c.id] ?? []).map((s) => s.name).join(", ") || "—"}</span>
            <span>{(courses[c.id] ?? []).map((co) => co.name).join(", ") || "—"}</span>
          </div>
        ))}
      </div>

      <h3 style={{ marginTop: 24 }}>Academic Sessions</h3>
      <form
        className="inlineForm"
        onSubmit={async (e) => {
          e.preventDefault();
          await academicsApi.createSession(sessionForm);
          setSessionForm({ name: "", gregorian_start: "", gregorian_end: "", hijri_span: "" });
          await refreshAll();
        }}
      >
        <label>Name<input required value={sessionForm.name} onChange={(e) => setSessionForm({ ...sessionForm, name: e.target.value })} placeholder="2026" /></label>
        <label>Start<input required type="date" value={sessionForm.gregorian_start} onChange={(e) => setSessionForm({ ...sessionForm, gregorian_start: e.target.value })} /></label>
        <label>End<input required type="date" value={sessionForm.gregorian_end} onChange={(e) => setSessionForm({ ...sessionForm, gregorian_end: e.target.value })} /></label>
        <label>Hijri span<input required value={sessionForm.hijri_span} onChange={(e) => setSessionForm({ ...sessionForm, hijri_span: e.target.value })} placeholder="1447-1448" /></label>
        <div className="formActions">
          <button className="primaryAction" type="submit"><Plus size={16} /> Add session</button>
        </div>
      </form>
      <div className="dataTable">
        <div className="dataRow header"><span>Name</span><span>Span</span><span>Active</span><span></span></div>
        {sessions.length === 0 && <p className="emptyState">No sessions yet.</p>}
        {sessions.map((s) => (
          <div className="dataRow" key={s.id}>
            <span>{s.name}</span>
            <span>{s.gregorian_start} → {s.gregorian_end}</span>
            <span>{s.is_active ? <CheckCircle2 size={16} color="var(--leaf)" /> : "—"}</span>
            <span>
              {!s.is_active && (
                <button className="tableAction" type="button" onClick={async () => { await academicsApi.activateSession(s.id); await refreshAll(); }}>
                  Activate
                </button>
              )}
            </span>
          </div>
        ))}
      </div>

      <h3 style={{ marginTop: 24 }}>Teacher Assignments</h3>
      <form
        className="inlineForm"
        onSubmit={async (e) => {
          e.preventDefault();
          const { teacher_id, session_id, class_id, course_id } = assignForm;
          if (!teacher_id || !session_id || !class_id || !course_id) return;
          await academicsApi.createTeacherAssignment(assignForm);
          await refreshAll();
        }}
      >
        <label>
          Teacher
          <select required value={assignForm.teacher_id} onChange={(e) => setAssignForm({ ...assignForm, teacher_id: e.target.value })}>
            <option value="">Select…</option>
            {teachers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </label>
        <label>
          Session
          <select required value={assignForm.session_id} onChange={(e) => setAssignForm({ ...assignForm, session_id: e.target.value })}>
            <option value="">Select…</option>
            {sessions.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>
        <label>
          Class
          <select required value={assignForm.class_id} onChange={(e) => setAssignForm({ ...assignForm, class_id: e.target.value })}>
            <option value="">Select…</option>
            {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        <label>
          Course
          <select required value={assignForm.course_id} onChange={(e) => setAssignForm({ ...assignForm, course_id: e.target.value })}>
            <option value="">Select…</option>
            {(courses[assignForm.class_id] ?? allCourses).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        <div className="formActions">
          <button className="primaryAction" type="submit"><Plus size={16} /> Assign</button>
        </div>
      </form>
      <div className="dataTable">
        <div className="dataRow header"><span>Teacher</span><span>Class</span><span>Course</span></div>
        {assignments.length === 0 && <p className="emptyState">No assignments yet.</p>}
        {assignments.map((a) => (
          <div className="dataRow" key={a.id}>
            <span>{teachers.find((t) => t.id === a.teacher_id)?.name ?? a.teacher_id}</span>
            <span>{classes.find((c) => c.id === a.class_id)?.name ?? a.class_id}</span>
            <span>{allCourses.find((c) => c.id === a.course_id)?.name ?? a.course_id}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
