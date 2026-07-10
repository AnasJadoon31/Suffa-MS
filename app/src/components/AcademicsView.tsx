import { useEffect, useState } from "react";
import { CheckCircle2, Plus, Edit2, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import axios from "axios";

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
  const { t } = useTranslation();
  const [programs, setPrograms] = useState<Program[]>([]);
  const [classes, setClasses] = useState<AcademicClass[]>([]);
  const [sections, setSections] = useState<Record<string, Section[]>>({});
  const [courses, setCourses] = useState<Record<string, Course[]>>({});
  const [allCourses, setAllCourses] = useState<Course[]>([]);
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
  const [assignCourseId, setAssignCourseId] = useState("");
  const [sessionForm, setSessionForm] = useState({ name: "", gregorian_start: "", gregorian_end: "", hijri_span: "" });
  const [assignForm, setAssignForm] = useState({ teacher_id: "", session_id: "", class_id: "", course_id: "" });

  const [activeTab, setActiveTab] = useState<"programs" | "classes" | "courses" | "sections" | "sessions" | "assignments">("programs");

  const refreshAll = async () => {
    const [p, c, s, t_res, ac] = await Promise.all([
      academicsApi.listPrograms(),
      academicsApi.listClasses(),
      academicsApi.listSessions(),
      peopleApi.listTeachers(),
      academicsApi.listAllCourses(),
    ]);
    setPrograms(p);
    setClasses(c);
    setSessions(s);
    setTeachers(t_res);
    setAllCourses(ac);
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

  const handleError = (e: unknown) => {
    if (axios.isAxiosError(e) && e.response?.status === 409) {
      alert(e.response.data.detail || "Cannot delete this record because it is in use.");
    } else {
      console.error(e);
      alert("An error occurred.");
    }
  };

  // Generic delete handler
  const handleDelete = async (action: () => Promise<void>) => {
    if (!window.confirm("Are you sure you want to delete this record?")) return;
    try {
      await action();
      await refreshAll();
    } catch (e) {
      handleError(e);
    }
  };

  // Edit states
  const [editingProgram, setEditingProgram] = useState<Program | null>(null);
  const [editingClass, setEditingClass] = useState<AcademicClass | null>(null);
  const [editingCourse, setEditingCourse] = useState<Course | null>(null);
  const [editingSection, setEditingSection] = useState<Section | null>(null);
  const [editingSession, setEditingSession] = useState<AcademicSession | null>(null);

  useEffect(() => {
    void refreshAll();
  }, []);

  return (
    <section className="modulePanel">
      <div className="moduleHeader">
        <h2>{t("academicStructureTitle")}</h2>
        <p className="notice">{t("academicStructureSubtitle")}</p>
      </div>

      <div className="tabsContainer">
        <div className="tabList">
          <button
            type="button"
            className={`tabButton ${activeTab === "programs" ? "active" : ""}`}
            onClick={() => setActiveTab("programs")}
          >
            {t("programsHeading")}
          </button>
          <button
            type="button"
            className={`tabButton ${activeTab === "classes" ? "active" : ""}`}
            onClick={() => setActiveTab("classes")}
          >
            {t("classesHeading")}
          </button>
          <button
            type="button"
            className={`tabButton ${activeTab === "courses" ? "active" : ""}`}
            onClick={() => setActiveTab("courses")}
          >
            Courses
          </button>
          <button
            type="button"
            className={`tabButton ${activeTab === "sections" ? "active" : ""}`}
            onClick={() => setActiveTab("sections")}
          >
            {t("sectionsCoursesHeading")}
          </button>
          <button
            type="button"
            className={`tabButton ${activeTab === "sessions" ? "active" : ""}`}
            onClick={() => setActiveTab("sessions")}
          >
            {t("sessionsHeading")}
          </button>
          <button
            type="button"
            className={`tabButton ${activeTab === "assignments" ? "active" : ""}`}
            onClick={() => setActiveTab("assignments")}
          >
            {t("teacherAssignmentsHeading")}
          </button>
        </div>

        <div className="tabPanel">
          {activeTab === "programs" && (
            <>
              <h3>{t("programsHeading")}</h3>
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
                  {t("programNameLabel")}
                  <input required value={programName} onChange={(e) => setProgramName(e.target.value)} placeholder="e.g. Hifz" />
                </label>
                <div className="formActions">
                  <button className="primaryAction" type="submit"><Plus size={16} /> {t("addProgramBtn")}</button>
                </div>
              </form>
              <div className="dataTable">
                <div className="dataRow header"><span>{t("nameLabel")}</span><span>Actions</span></div>
                {programs.length === 0 && <p className="emptyState">{t("noProgramsYet")}</p>}
                {programs.map((p) => (
                  <div className="dataRow" key={p.id}>
                    {editingProgram?.id === p.id ? (
                      <form className="inlineForm" style={{ margin: 0, padding: 0 }} onSubmit={async (e) => {
                        e.preventDefault();
                        try {
                          await academicsApi.updateProgram(p.id, { name: editingProgram.name });
                          setEditingProgram(null);
                          await refreshAll();
                        } catch (err) { handleError(err); }
                      }}>
                        <input autoFocus value={editingProgram.name} onChange={e => setEditingProgram({ ...editingProgram, name: e.target.value })} />
                        <button className="primaryAction" type="submit">Save</button>
                        <button className="secondaryAction" type="button" onClick={() => setEditingProgram(null)}>Cancel</button>
                      </form>
                    ) : (
                      <>
                        <span>{p.name}</span>
                        <span className="actions">
                          <button className="iconBtn" title="Edit" onClick={() => setEditingProgram(p)}><Edit2 size={16} /></button>
                          <button className="iconBtn" title="Delete" onClick={() => handleDelete(() => academicsApi.deleteProgram(p.id))}><Trash2 size={16} /></button>
                        </span>
                      </>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}

          {activeTab === "classes" && (
            <>
              <h3>{t("classesHeading")}</h3>
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
                  {t("programLabel")}
                  <select required value={classProgramId} onChange={(e) => setClassProgramId(e.target.value)}>
                    <option value="">{t("selectEllipsis")}</option>
                    {programs.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </label>
                <label>
                  {t("classNameLabel")}
                  <input required value={className} onChange={(e) => setClassName(e.target.value)} placeholder="e.g. Darja 1" />
                </label>
                <div className="formActions">
                  <button className="primaryAction" type="submit"><Plus size={16} /> {t("addClassBtn")}</button>
                </div>
              </form>
              <div className="dataTable">
                <div className="dataRow header"><span>{t("nameLabel")}</span><span>{t("programLabel")}</span><span>Actions</span></div>
                {classes.length === 0 && <p className="emptyState">{t("noClassesYet")}</p>}
                {classes.map((c) => (
                  <div className="dataRow" key={c.id}>
                    {editingClass?.id === c.id ? (
                      <form className="inlineForm" style={{ margin: 0, padding: 0 }} onSubmit={async (e) => {
                        e.preventDefault();
                        try {
                          await academicsApi.updateClass(c.id, { name: editingClass.name, program_id: editingClass.program_id });
                          setEditingClass(null);
                          await refreshAll();
                        } catch (err) { handleError(err); }
                      }}>
                        <input autoFocus value={editingClass.name} onChange={e => setEditingClass({ ...editingClass, name: e.target.value })} />
                        <select value={editingClass.program_id} onChange={e => setEditingClass({ ...editingClass, program_id: e.target.value })}>
                          {programs.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </select>
                        <button className="primaryAction" type="submit">Save</button>
                        <button className="secondaryAction" type="button" onClick={() => setEditingClass(null)}>Cancel</button>
                      </form>
                    ) : (
                      <>
                        <span>{c.name}</span>
                        <span>{programs.find((p) => p.id === c.program_id)?.name ?? "—"}</span>
                        <span className="actions">
                          <button className="iconBtn" title="Edit" onClick={() => setEditingClass(c)}><Edit2 size={16} /></button>
                          <button className="iconBtn" title="Delete" onClick={() => handleDelete(() => academicsApi.deleteClass(c.id))}><Trash2 size={16} /></button>
                        </span>
                      </>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}

          {activeTab === "courses" && (
            <>
              <h3>Courses</h3>
              <form
                className="inlineForm"
                onSubmit={async (e) => {
                  e.preventDefault();
                  await academicsApi.createCourse(courseName);
                  setCourseName("");
                  await refreshAll();
                }}
              >
                <label>
                  {t("courseNameLabel")}
                  <input required value={courseName} onChange={(e) => setCourseName(e.target.value)} placeholder="e.g. Quran" />
                </label>
                <div className="formActions">
                  <button className="primaryAction" type="submit"><Plus size={16} /> {t("addCourseBtn")}</button>
                </div>
              </form>
              <div className="dataTable">
                <div className="dataRow header"><span>{t("nameLabel")}</span><span>Actions</span></div>
                {allCourses.length === 0 && <p className="emptyState">No courses yet.</p>}
                {allCourses.map((c) => (
                  <div className="dataRow" key={c.id}>
                    {editingCourse?.id === c.id ? (
                      <form className="inlineForm" style={{ margin: 0, padding: 0 }} onSubmit={async (e) => {
                        e.preventDefault();
                        try {
                          await academicsApi.updateCourse(c.id, { name: editingCourse.name });
                          setEditingCourse(null);
                          await refreshAll();
                        } catch (err) { handleError(err); }
                      }}>
                        <input autoFocus value={editingCourse.name} onChange={e => setEditingCourse({ ...editingCourse, name: e.target.value })} />
                        <button className="primaryAction" type="submit">Save</button>
                        <button className="secondaryAction" type="button" onClick={() => setEditingCourse(null)}>Cancel</button>
                      </form>
                    ) : (
                      <>
                        <span>{c.name}</span>
                        <span className="actions">
                          <button className="iconBtn" title="Edit" onClick={() => setEditingCourse(c)}><Edit2 size={16} /></button>
                          <button className="iconBtn" title="Delete" onClick={() => handleDelete(() => academicsApi.deleteCourse(c.id))}><Trash2 size={16} /></button>
                        </span>
                      </>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}

          {activeTab === "sections" && (
            <>
              <h3>{t("sectionsCoursesHeading")}</h3>
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
                  {t("classLabel")}
                  <select required value={sectionClassId} onChange={(e) => setSectionClassId(e.target.value)}>
                    <option value="">{t("selectEllipsis")}</option>
                    {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </label>
                <label>
                  {t("sectionNameLabel")}
                  <input required value={sectionName} onChange={(e) => setSectionName(e.target.value)} placeholder="e.g. A" />
                </label>
                <div className="formActions">
                  <button className="primaryAction" type="submit"><Plus size={16} /> {t("addSectionBtn")}</button>
                </div>
              </form>
              <form
                className="inlineForm"
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (!courseClassId || !assignCourseId) return;
                  await academicsApi.assignCourseToClass(courseClassId, assignCourseId);
                  setAssignCourseId("");
                  await refreshAll();
                }}
              >
                <label>
                  {t("classLabel")}
                  <select required value={courseClassId} onChange={(e) => setCourseClassId(e.target.value)}>
                    <option value="">{t("selectEllipsis")}</option>
                    {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </label>
                <label>
                  Course
                  <select required value={assignCourseId} onChange={(e) => setAssignCourseId(e.target.value)}>
                    <option value="">{t("selectEllipsis")}</option>
                    {allCourses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </label>
                <div className="formActions">
                  <button className="primaryAction" type="submit"><Plus size={16} /> Assign</button>
                </div>
              </form>
              <div className="dataTable">
                <div className="dataRow header"><span>{t("classLabel")}</span><span>{t("sectionsCol")}</span><span>{t("coursesCol")}</span></div>
                {classes.map((c) => (
                  <div className="dataRow" key={c.id} style={{ alignItems: "flex-start", gap: "1rem" }}>
                    <span><strong>{c.name}</strong></span>
                    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                      {(sections[c.id] ?? []).map((s) => (
                        <div key={s.id} style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          {editingSection?.id === s.id ? (
                            <form className="inlineForm" style={{ margin: 0, padding: 0 }} onSubmit={async (e) => {
                              e.preventDefault();
                              try {
                                await academicsApi.updateSection(c.id, s.id, { name: editingSection.name });
                                setEditingSection(null);
                                await refreshAll();
                              } catch (err) { handleError(err); }
                            }}>
                              <input autoFocus value={editingSection.name} onChange={e => setEditingSection({ ...editingSection, name: e.target.value })} />
                              <button className="primaryAction" type="submit">Save</button>
                              <button className="secondaryAction" type="button" onClick={() => setEditingSection(null)}>Cancel</button>
                            </form>
                          ) : (
                            <>
                              <span>{s.name}</span>
                              <span className="actions" style={{ marginLeft: "auto" }}>
                                <button className="iconBtn" title="Edit" onClick={() => setEditingSection(s)}><Edit2 size={14} /></button>
                                <button className="iconBtn" title="Delete" onClick={() => handleDelete(() => academicsApi.deleteSection(c.id, s.id))}><Trash2 size={14} /></button>
                              </span>
                            </>
                          )}
                        </div>
                      ))}
                      {!(sections[c.id]?.length > 0) && "—"}
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                      {(courses[c.id] ?? []).map((co) => (
                        <div key={co.id} style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          <span>{co.name}</span>
                          <span className="actions" style={{ marginLeft: "auto" }}>
                            <button className="iconBtn" title="Unassign" onClick={() => handleDelete(() => academicsApi.unassignCourseFromClass(c.id, co.id))}><Trash2 size={14} /></button>
                          </span>
                        </div>
                      ))}
                      {!(courses[c.id]?.length > 0) && "—"}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {activeTab === "sessions" && (
            <>
              <h3>{t("sessionsHeading")}</h3>
              <form
                className="inlineForm"
                onSubmit={async (e) => {
                  e.preventDefault();
                  await academicsApi.createSession(sessionForm);
                  setSessionForm({ name: "", gregorian_start: "", gregorian_end: "", hijri_span: "" });
                  await refreshAll();
                }}
              >
                <label>{t("nameLabel")}<input required value={sessionForm.name} onChange={(e) => setSessionForm({ ...sessionForm, name: e.target.value })} placeholder="2026" /></label>
                <label>{t("startLabel")}<input required type="date" value={sessionForm.gregorian_start} onChange={(e) => setSessionForm({ ...sessionForm, gregorian_start: e.target.value })} /></label>
                <label>{t("endLabel")}<input required type="date" value={sessionForm.gregorian_end} onChange={(e) => setSessionForm({ ...sessionForm, gregorian_end: e.target.value })} /></label>
                <label>{t("hijriSpanLabel")}<input required value={sessionForm.hijri_span} onChange={(e) => setSessionForm({ ...sessionForm, hijri_span: e.target.value })} placeholder="1447-1448" /></label>
                <div className="formActions">
                  <button className="primaryAction" type="submit"><Plus size={16} /> {t("addSessionBtn")}</button>
                </div>
              </form>
              <div className="dataTable">
                <div className="dataRow header"><span>{t("nameLabel")}</span><span>{t("spanCol")}</span><span>{t("activeCol")}</span><span>Actions</span></div>
                {sessions.length === 0 && <p className="emptyState">{t("noSessionsYet")}</p>}
                {sessions.map((s) => (
                  <div className="dataRow" key={s.id}>
                    {editingSession?.id === s.id ? (
                      <form className="inlineForm" style={{ margin: 0, padding: 0 }} onSubmit={async (e) => {
                        e.preventDefault();
                        try {
                          await academicsApi.updateSession(s.id, {
                            name: editingSession.name, gregorian_start: editingSession.gregorian_start,
                            gregorian_end: editingSession.gregorian_end, hijri_span: editingSession.hijri_span
                          });
                          setEditingSession(null);
                          await refreshAll();
                        } catch (err) { handleError(err); }
                      }}>
                        <input autoFocus value={editingSession.name} onChange={e => setEditingSession({ ...editingSession, name: e.target.value })} style={{width: 80}} />
                        <input type="date" value={editingSession.gregorian_start} onChange={e => setEditingSession({ ...editingSession, gregorian_start: e.target.value })} />
                        <input type="date" value={editingSession.gregorian_end} onChange={e => setEditingSession({ ...editingSession, gregorian_end: e.target.value })} />
                        <input value={editingSession.hijri_span} onChange={e => setEditingSession({ ...editingSession, hijri_span: e.target.value })} style={{width: 80}} />
                        <button className="primaryAction" type="submit">Save</button>
                        <button className="secondaryAction" type="button" onClick={() => setEditingSession(null)}>Cancel</button>
                      </form>
                    ) : (
                      <>
                        <span>{s.name}</span>
                        <span>{s.gregorian_start} → {s.gregorian_end}</span>
                        <span>{s.is_active ? <CheckCircle2 size={16} color="var(--leaf)" /> : "—"}</span>
                        <span className="actions" style={{ gap: "8px" }}>
                          {!s.is_active && (
                            <button className="tableAction" type="button" onClick={async () => { await academicsApi.activateSession(s.id); await refreshAll(); }}>
                              {t("activateBtn")}
                            </button>
                          )}
                          <button className="iconBtn" title="Edit" onClick={() => setEditingSession(s)}><Edit2 size={16} /></button>
                          {!s.is_active && <button className="iconBtn" title="Delete" onClick={() => handleDelete(() => academicsApi.deleteSession(s.id))}><Trash2 size={16} /></button>}
                        </span>
                      </>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}

          {activeTab === "assignments" && (
            <>
              <h3>{t("teacherAssignmentsHeading")}</h3>
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
                  {t("teacherLabel")}
                  <select required value={assignForm.teacher_id} onChange={(e) => setAssignForm({ ...assignForm, teacher_id: e.target.value })}>
                    <option value="">{t("selectEllipsis")}</option>
                    {teachers.map((t_res) => <option key={t_res.id} value={t_res.id}>{t_res.name}</option>)}
                  </select>
                </label>
                <label>
                  {t("sessionLabel")}
                  <select required value={assignForm.session_id} onChange={(e) => setAssignForm({ ...assignForm, session_id: e.target.value })}>
                    <option value="">{t("selectEllipsis")}</option>
                    {sessions.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </label>
                <label>
                  {t("classLabel")}
                  <select required value={assignForm.class_id} onChange={(e) => setAssignForm({ ...assignForm, class_id: e.target.value })}>
                    <option value="">{t("selectEllipsis")}</option>
                    {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </label>
                <label>
                  {t("courseNameLabel")}
                  <select required value={assignForm.course_id} onChange={(e) => setAssignForm({ ...assignForm, course_id: e.target.value })}>
                    <option value="">{t("selectEllipsis")}</option>
                    {(courses[assignForm.class_id] ?? allCourses).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </label>
                <div className="formActions">
                  <button className="primaryAction" type="submit"><Plus size={16} /> {t("assignBtn")}</button>
                </div>
              </form>
              <div className="dataTable">
                <div className="dataRow header"><span>{t("teacherLabel")}</span><span>{t("classLabel")}</span><span>{t("courseNameLabel")}</span></div>
                {assignments.length === 0 && <p className="emptyState">{t("noAssignmentsYet")}</p>}
                {assignments.map((a) => (
                  <div className="dataRow" key={a.id}>
                    <span>{teachers.find((t_res) => t_res.id === a.teacher_id)?.name ?? a.teacher_id}</span>
                    <span>{classes.find((c) => c.id === a.class_id)?.name ?? a.class_id}</span>
                    <span>{allCourses.find((c) => c.id === a.course_id)?.name ?? a.course_id}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
