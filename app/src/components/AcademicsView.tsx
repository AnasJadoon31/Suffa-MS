import { Button } from "./ui/Button";
import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Plus, Edit2, Trash2, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useDialog } from "../lib/DialogContext";
import axios from "axios";

import {
  type AcademicClass,
  type AcademicSession,
  type Course,
  type Program,
  type Section,
  academicsApi,
} from "../lib/endpoints";
import { peopleApi, type Teacher } from "../lib/endpoints";
import { RolloverWizard } from "./RolloverWizard";
import { Input, Select, Checkbox } from "./ui/Field";
import { ErrorState, LoadingState } from "./ui/AsyncState";
import { useSessionReadOnly } from "./SessionSwitcher";
import { Modal, FormModal } from "./ui/Modal";
import { PageSection, PageHeader } from "./ui/Layout";


export type AcademicTab = "programs" | "classes" | "courses" | "sessions";

export function AcademicsView({ tab = "programs", onTabChange }: Readonly<{ tab?: AcademicTab; onTabChange?: (tab: AcademicTab) => void }>) {
  const { t } = useTranslation();
  const { alert, confirm } = useDialog();
  const readOnly = useSessionReadOnly();
  const [programs, setPrograms] = useState<Program[]>([]);
  const [classes, setClasses] = useState<AcademicClass[]>([]);
  const [sections, setSections] = useState<Record<string, Section[]>>({});
  const [courses, setCourses] = useState<Record<string, Course[]>>({});
  const [allCourses, setAllCourses] = useState<Course[]>([]);
  const [sessions, setSessions] = useState<AcademicSession[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);

  const [programName, setProgramName] = useState("");
  const [className, setClassName] = useState("");
  const [classProgramId, setClassProgramId] = useState("");
  const [classPortalEnabled, setClassPortalEnabled] = useState(true);
  const [sectionClassId, setSectionClassId] = useState("");
  const [sectionName, setSectionName] = useState("");
  const [courseName, setCourseName] = useState("");
  const [courseMapModalClassId, setCourseMapModalClassId] = useState<string | null>(null);
  const [sessionForm, setSessionForm] = useState({ name: "", gregorian_start: "", gregorian_end: "", hijri_span: "" });
  const [rolloverSourceSession, setRolloverSourceSession] = useState<AcademicSession | null>(null);
  const [createModal, setCreateModal] = useState<"program" | "class" | "section" | "course" | "session" | null>(null);

  const activeTab = tab;

  // B7-b: classes tab sort/filter.
  const [classSearch, setClassSearch] = useState("");
  const [classFilterProgram, setClassFilterProgram] = useState("");
  const [classSortBy, setClassSortBy] = useState<"name" | "program">("name");
  const classesToShow = useMemo(() => {
    let list = classes;
    if (classFilterProgram) list = list.filter((c) => c.program_id === classFilterProgram);
    if (classSearch.trim()) {
      const needle = classSearch.trim().toLowerCase();
      list = list.filter((c) => c.name.toLowerCase().includes(needle));
    }
    const programName = (id: string) => programs.find((p) => p.id === id)?.name ?? "";
    return [...list].sort((a, b) =>
      classSortBy === "program"
        ? programName(a.program_id).localeCompare(programName(b.program_id)) || a.name.localeCompare(b.name)
        : a.name.localeCompare(b.name)
    );
  }, [classes, programs, classFilterProgram, classSearch, classSortBy]);

  // B7-f: course-mapping (assign) tab sort/filter.
  const [courseMapFilterClass, setCourseMapFilterClass] = useState("");
  const [courseMapSearch, setCourseMapSearch] = useState("");
  const classesForCourseMap = useMemo(() => {
    let list = classes;
    if (courseMapFilterClass) list = list.filter((c) => c.id === courseMapFilterClass);
    if (courseMapSearch.trim()) {
      const needle = courseMapSearch.trim().toLowerCase();
      list = list.filter((c) => c.name.toLowerCase().includes(needle));
    }
    return [...list].sort((a, b) => a.name.localeCompare(b.name));
  }, [classes, courseMapFilterClass, courseMapSearch]);

  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const refreshAll = async () => {
    try {
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
      setLoadError("");
    } catch (e: any) {
      setLoadError(e.response?.data?.detail ?? t("failedLoadAcademics"));
    }
  };

  const handleError = async (e: unknown) => {
    if (axios.isAxiosError(e) && e.response?.status === 409) {
      await alert(e.response.data.detail === "course_name_exists" ? t("courseNameExists") : (e.response.data.detail || t("recordInUseError")));
    } else {
      console.error(e);
      await alert(t("genericError"));
    }
  };

  // Generic delete handler
  const handleDelete = async (action: () => Promise<void>) => {
    if (!(await confirm(t("deleteRecordConfirm")))) return;
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
    void (async () => {
      setIsLoading(true);
      await refreshAll();
      setIsLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <PageSection readOnly={readOnly}>
      <PageHeader title={t("academicStructureTitle")} notice={t("academicStructureSubtitle")} />

      <div className="tabsContainer">
        <div className="tabList">
          <Button
            type="button"
            className={`tabButton ${activeTab === "programs" ? "active" : ""}`}
            onClick={() => onTabChange?.("programs")}
          >
            {t("programsHeading")}
          </Button>
          <Button
            type="button"
            className={`tabButton ${activeTab === "classes" ? "active" : ""}`}
            onClick={() => onTabChange?.("classes")}
          >
            {t("classesHeading")}
          </Button>
          <Button
            type="button"
            className={`tabButton ${activeTab === "courses" ? "active" : ""}`}
            onClick={() => onTabChange?.("courses")}
          >
            {t("coursesHeading")}
          </Button>
          <Button
            type="button"
            className={`tabButton ${activeTab === "sessions" ? "active" : ""}`}
            onClick={() => onTabChange?.("sessions")}
          >
            {t("sessionsHeading")}
          </Button>
        </div>

        <div className="tabPanel">
          {isLoading && <LoadingState />}
          {!isLoading && loadError && <ErrorState message={loadError} />}
          {!isLoading && !loadError && activeTab === "programs" && (
            <>
              <h3>{t("programsHeading")}</h3>
              <Button className="primaryAction" type="button" onClick={() => setCreateModal("program")}><Plus size={16} /> {t("addProgramBtn")}</Button>
              {createModal === "program" && <FormModal
                            title={t("addProgramBtn")} onClose={() => setCreateModal(null)}
                            onSubmit={async (e) => {
                                            e.preventDefault();
                                            await academicsApi.createProgram(programName);
                                            setProgramName("");
                                            setCreateModal(null);
                                            await refreshAll();
                                          }}
                            submitLabel={t("addProgramBtn")}
                            submitIcon={<Plus size={16} />}
                          >
                            <label>
                                            {t("programNameLabel")}
                                            <Input required value={programName} onChange={(e) => setProgramName(e.target.value)} placeholder={t("programExample")} />
                                          </label>
                          </FormModal>}
              <div className="dataTable">
                <div className="dataRow header"><span>{t("nameLabel")}</span><span>{t("actionsCol")}</span></div>
                {programs.length === 0 && <p className="emptyState">{t("noProgramsYet")}</p>}
                {programs.map((p) => (
                  <div className="dataRow" key={p.id}>
                    {editingProgram?.id === p.id && (
                      <FormModal
                        title={t("editBtn")}
                        onClose={() => setEditingProgram(null)}
                        submitLabel={t("saveBtn")}
                        onSubmit={async (e) => {
                          e.preventDefault();
                          try {
                            await academicsApi.updateProgram(p.id, { name: editingProgram.name });
                            setEditingProgram(null);
                            await refreshAll();
                          } catch (err) { handleError(err); }
                        }}
                      >
                        <label>
                          {t("nameLabel")}
                          <Input autoFocus value={editingProgram.name} onChange={e => setEditingProgram({ ...editingProgram, name: e.target.value })} />
                        </label>
                      </FormModal>
                    )}
                    <span>{p.name}</span>
                    <span className="actions">
                          <Button className="iconBtn" title={t("editBtn")} onClick={() => setEditingProgram(p)}><Edit2 size={16} /></Button>
                          <Button className="iconBtn" title={t("deleteBtn")} onClick={() => handleDelete(() => academicsApi.deleteProgram(p.id))}><Trash2 size={16} /></Button>
                        </span>
                  </div>
                ))}
              </div>
            </>
          )}

          {!isLoading && !loadError && activeTab === "classes" && (
            <>
              <h3>{t("classesHeading")}</h3>
              <Button className="primaryAction" type="button" onClick={() => setCreateModal("class")}><Plus size={16} /> {t("addClassBtn")}</Button>
              {createModal === "class" && <FormModal
                            title={t("addClassBtn")} onClose={() => setCreateModal(null)}
                            onSubmit={async (e) => {
                                            e.preventDefault();
                                            if (!classProgramId) return;
                                            await academicsApi.createClass(classProgramId, className, classPortalEnabled);
                                            setClassName("");
                                            setClassPortalEnabled(true);
                                            setCreateModal(null);
                                            await refreshAll();
                                          }}
                            submitLabel={t("addClassBtn")}
                            submitIcon={<Plus size={16} />}
                          >
                            <label>
                                            {t("programLabel")}
                                            <Select required value={classProgramId} onChange={(e) => setClassProgramId(e.target.value)}>
                                              <option value="">{t("selectEllipsis")}</option>
                                              {programs.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                                            </Select>
                                          </label>

                          <label>
                                            {t("classNameLabel")}
                                            <Input required value={className} onChange={(e) => setClassName(e.target.value)} placeholder={t("classExample")} />
                                          </label>

                          <label style={{ flexDirection: "row", alignItems: "center", gap: 8 }} title={t("classPortalEnabledHint") ?? ""}>
                                            <Input type="checkbox" checked={classPortalEnabled} onChange={(e) => setClassPortalEnabled(e.target.checked)} />
                                            {t("classPortalEnabledLabel")}
                                          </label>
                          </FormModal>}
              <div className="moduleToolbar">
                <Input placeholder={t("searchClassesPlaceholder") ?? ""} value={classSearch} onChange={(e) => setClassSearch(e.target.value)} />
                <Select value={classFilterProgram} onChange={(e) => setClassFilterProgram(e.target.value)}>
                  <option value="">{t("allPrograms")}</option>
                  {programs.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </Select>
                <Select value={classSortBy} onChange={(e) => setClassSortBy(e.target.value as "name" | "program")}>
                  <option value="name">{t("sortByNameLabel")}</option>
                  <option value="program">{t("sortByProgramLabel")}</option>
                </Select>
              </div>
              <div className="dataTable">
                <div className="dataRow header"><span>{t("nameLabel")}</span><span>{t("programLabel")}</span><span>{t("portalCol")}</span><span>{t("actionsCol")}</span></div>
                {classesToShow.length === 0 && <p className="emptyState">{t("noClassesYet")}</p>}
                {classesToShow.map((c) => (
                  <div className="dataRow" key={c.id}>
                    {editingClass?.id === c.id ? (
                    {editingClass?.id === c.id && (
                      <FormModal
                        title={t("editBtn")}
                        onClose={() => setEditingClass(null)}
                        submitLabel={t("saveBtn")}
                        onSubmit={async (e) => {
                          e.preventDefault();
                          try {
                            await academicsApi.updateClass(c.id, {
                              name: editingClass.name,
                              program_id: editingClass.program_id,
                              default_portal_enabled: editingClass.default_portal_enabled,
                            });
                            setEditingClass(null);
                            await refreshAll();
                          } catch (err) { handleError(err); }
                        }}
                      >
                        <label>
                          {t("nameLabel")}
                          <Input autoFocus value={editingClass.name} onChange={e => setEditingClass({ ...editingClass, name: e.target.value })} />
                        </label>
                        <label>
                          {t("programLabel")}
                          <Select value={editingClass.program_id} onChange={e => setEditingClass({ ...editingClass, program_id: e.target.value })}>
                            {programs.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                          </Select>
                        </label>
                        <label style={{ flexDirection: "row", alignItems: "center", gap: 6 }} title={t("classPortalEnabledHint") ?? ""}>
                          <Input
                            type="checkbox"
                            checked={editingClass.default_portal_enabled}
                            onChange={(e) => setEditingClass({ ...editingClass, default_portal_enabled: e.target.checked })}
                          />
                          {t("classPortalEnabledLabel")}
                        </label>
                      </FormModal>
                    )}
                        <span>{c.name}</span>
                        <span>{programs.find((p) => p.id === c.program_id)?.name ?? "—"}</span>
                        <span>{c.default_portal_enabled ? t("yesLabel") : t("noLabel")}</span>
                        <span className="actions">
                          <Button className="iconBtn" title={t("editBtn")} onClick={() => setEditingClass(c)}><Edit2 size={16} /></Button>
                          <Button className="iconBtn" title={t("deleteBtn")} onClick={() => handleDelete(() => academicsApi.deleteClass(c.id))}><Trash2 size={16} /></Button>
                        </span>
                  </div>
                ))}
              </div>
            </>
          )}

          {!isLoading && !loadError && activeTab === "courses" && (
            <>
              <h3>{t("coursesHeading")}</h3>
              <Button className="primaryAction" type="button" onClick={() => setCreateModal("course")}><Plus size={16} /> {t("addCourseBtn")}</Button>
              {createModal === "course" && <FormModal
                            title={t("addCourseBtn")} onClose={() => setCreateModal(null)}
                            onSubmit={async (e) => {
                                            e.preventDefault();
                                            await academicsApi.createCourse(courseName);
                                            setCourseName("");
                                            setCreateModal(null);
                                            await refreshAll();
                                          }}
                            submitLabel={t("addCourseBtn")}
                            submitIcon={<Plus size={16} />}
                          >
                            <label>
                                            {t("courseNameLabel")}
                                            <Input required value={courseName} onChange={(e) => setCourseName(e.target.value)} placeholder={t("courseExample")} />
                                          </label>
                          </FormModal>}
              <div className="dataTable">
                <div className="dataRow header"><span>{t("nameLabel")}</span><span>{t("actionsCol")}</span></div>
                {allCourses.length === 0 && <p className="emptyState">{t("noCoursesYet")}</p>}
                {allCourses.map((c) => (
                  <div className="dataRow" key={c.id}>
                    {editingCourse?.id === c.id ? (
                    {editingCourse?.id === c.id && (
                      <FormModal
                        title={t("editBtn")}
                        onClose={() => setEditingCourse(null)}
                        submitLabel={t("saveBtn")}
                        onSubmit={async (e) => {
                          e.preventDefault();
                          try {
                            await academicsApi.updateCourse(c.id, { name: editingCourse.name });
                            setEditingCourse(null);
                            await refreshAll();
                          } catch (err) { handleError(err); }
                        }}
                      >
                        <label>
                          {t("nameLabel")}
                          <Input autoFocus value={editingCourse.name} onChange={e => setEditingCourse({ ...editingCourse, name: e.target.value })} />
                        </label>
                      </FormModal>
                    )}
                        <span>{c.name}</span>
                        <span className="actions">
                          <Button className="iconBtn" title={t("editBtn")} onClick={() => setEditingCourse(c)}><Edit2 size={16} /></Button>
                          <Button className="iconBtn" title={t("deleteBtn")} onClick={() => handleDelete(() => academicsApi.deleteCourse(c.id))}><Trash2 size={16} /></Button>
                        </span>
                  </div>
                ))}
              </div>
            </>
          )}

          {!isLoading && !loadError && activeTab === "classes" && (
            <>
              <h3 style={{ marginTop: 24 }}>{t("sectionsCoursesHeading")}</h3>
              <Button className="primaryAction" type="button" onClick={() => setCreateModal("section")}><Plus size={16} /> {t("addSectionBtn")}</Button>
              {createModal === "section" && <FormModal
                            title={t("addSectionBtn")} onClose={() => setCreateModal(null)}
                            onSubmit={async (e) => {
                                            e.preventDefault();
                                            if (!sectionClassId) return;
                                            await academicsApi.createSection(sectionClassId, sectionName);
                                            setSectionName("");
                                            setCreateModal(null);
                                            await refreshAll();
                                          }}
                            submitLabel={t("addSectionBtn")}
                            submitIcon={<Plus size={16} />}
                          >
                            <label>
                                            {t("classLabel")}
                                            <Select required value={sectionClassId} onChange={(e) => setSectionClassId(e.target.value)}>
                                              <option value="">{t("selectEllipsis")}</option>
                                              {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                                            </Select>
                                          </label>

                          <label>
                                            {t("sectionNameLabel")}
                                            <Input required value={sectionName} onChange={(e) => setSectionName(e.target.value)} placeholder={t("sectionExample")} />
                                          </label>
                          </FormModal>}
              <div className="moduleToolbar">
                <Input placeholder={t("searchClassesPlaceholder") ?? ""} value={courseMapSearch} onChange={(e) => setCourseMapSearch(e.target.value)} />
                <Select value={courseMapFilterClass} onChange={(e) => setCourseMapFilterClass(e.target.value)}>
                  <option value="">{t("filterByClassLabel")}</option>
                  {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </Select>
              </div>
              <div className="dataTable">
                <div className="dataRow header"><span>{t("classLabel")}</span><span>{t("sectionsCol")}</span><span>{t("coursesCol")}</span></div>
                {classesForCourseMap.length === 0 && <p className="emptyState">{t("noClassesYet")}</p>}
                {classesForCourseMap.map((c) => (
                  <div className="dataRow" key={c.id} style={{ alignItems: "flex-start", gap: "1rem" }}>
                    <span><strong>{c.name}</strong></span>
                    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                      {(sections[c.id] ?? []).map((s) => (
                        <div key={s.id} style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          {editingSection?.id === s.id ? (
                          {editingSection?.id === s.id && (
                            <FormModal
                              title={t("editBtn")}
                              onClose={() => setEditingSection(null)}
                              submitLabel={t("saveBtn")}
                              onSubmit={async (e) => {
                                e.preventDefault();
                                try {
                                  await academicsApi.updateSection(c.id, s.id, { name: editingSection.name });
                                  setEditingSection(null);
                                  await refreshAll();
                                } catch (err) { handleError(err); }
                              }}
                            >
                              <label>
                                {t("nameLabel")}
                                <Input autoFocus value={editingSection.name} onChange={e => setEditingSection({ ...editingSection, name: e.target.value })} />
                              </label>
                            </FormModal>
                          )}
                              <span>{s.name}</span>
                              <span className="actions" style={{ marginLeft: "auto" }}>
                                <Button className="iconBtn" title={t("editBtn")} onClick={() => setEditingSection(s)}><Edit2 size={14} /></Button>
                                <Button className="iconBtn" title={t("deleteBtn")} onClick={() => handleDelete(() => academicsApi.deleteSection(c.id, s.id))}><Trash2 size={14} /></Button>
                              </span>
                        </div>
                      ))}
                      {!(sections[c.id]?.length > 0) && "—"}
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: "8px" }}>
                      <span
                        className="badge"
                        style={{ background: "var(--surface-2, #f1f5f9)", color: "var(--muted, #475569)" }}
                      >
                        {t("coursesCountLabel", { count: (courses[c.id] ?? []).length })}
                      </span>
                      <Button
                        className="tableAction"
                        type="button"
                        onClick={() => setCourseMapModalClassId(c.id)}
                      >
                        {t("manageCoursesBtn")}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {!isLoading && !loadError && activeTab === "sessions" && (
            <>
              <h3>{t("sessionsHeading")}</h3>
              <Button className="primaryAction" type="button" onClick={() => setCreateModal("session")}><Plus size={16} /> {t("addSessionBtn")}</Button>
              {createModal === "session" && <FormModal
                            title={t("addSessionBtn")} onClose={() => setCreateModal(null)}
                            onSubmit={async (e) => {
                                            e.preventDefault();
                                            await academicsApi.createSession(sessionForm);
                                            setSessionForm({ name: "", gregorian_start: "", gregorian_end: "", hijri_span: "" });
                                            setCreateModal(null);
                                            await refreshAll();
                                          }}
                            submitLabel={t("addSessionBtn")}
                            submitIcon={<Plus size={16} />}
                          >
                            <label>{t("nameLabel")}<Input required value={sessionForm.name} onChange={(e) => setSessionForm({ ...sessionForm, name: e.target.value })} placeholder="2026" /></label>

                          <label>{t("startLabel")}<Input required type="date" value={sessionForm.gregorian_start} onChange={(e) => setSessionForm({ ...sessionForm, gregorian_start: e.target.value })} /></label>

                          <label>{t("endLabel")}<Input required type="date" value={sessionForm.gregorian_end} onChange={(e) => setSessionForm({ ...sessionForm, gregorian_end: e.target.value })} /></label>

                          <label>{t("hijriSpanLabel")}<Input required value={sessionForm.hijri_span} onChange={(e) => setSessionForm({ ...sessionForm, hijri_span: e.target.value })} placeholder="1447-1448" /></label>
                          </FormModal>}
              <div className="dataTable">
                <div className="dataRow header"><span>{t("nameLabel")}</span><span>{t("spanCol")}</span><span>{t("activeCol")}</span><span>{t("actionsCol")}</span></div>
                {sessions.length === 0 && <p className="emptyState">{t("noSessionsYet")}</p>}
                {sessions.map((s) => (
                  <div className="dataRow" key={s.id}>
                    {editingSession?.id === s.id ? (
                    {editingSession?.id === s.id && (
                      <FormModal
                        title={t("editBtn")}
                        onClose={() => setEditingSession(null)}
                        submitLabel={t("saveBtn")}
                        onSubmit={async (e) => {
                          e.preventDefault();
                          try {
                            await academicsApi.updateSession(s.id, {
                              name: editingSession.name, gregorian_start: editingSession.gregorian_start,
                              gregorian_end: editingSession.gregorian_end, hijri_span: editingSession.hijri_span
                            });
                            setEditingSession(null);
                            await refreshAll();
                          } catch (err) { handleError(err); }
                        }}
                      >
                        <label>
                          {t("nameLabel")}
                          <Input autoFocus value={editingSession.name} onChange={e => setEditingSession({ ...editingSession, name: e.target.value })} />
                        </label>
                        <label>
                          {t("startDateCol")}
                          <Input type="date" value={editingSession.gregorian_start} onChange={e => setEditingSession({ ...editingSession, gregorian_start: e.target.value })} />
                        </label>
                        <label>
                          {t("endDateCol")}
                          <Input type="date" value={editingSession.gregorian_end} onChange={e => setEditingSession({ ...editingSession, gregorian_end: e.target.value })} />
                        </label>
                        <label>
                          {t("hijriSpanCol")}
                          <Input value={editingSession.hijri_span} onChange={e => setEditingSession({ ...editingSession, hijri_span: e.target.value })} />
                        </label>
                      </FormModal>
                    )}
                        <span>{s.name}</span>
                        <span>{s.gregorian_start} → {s.gregorian_end}</span>
                        <span>{s.is_active ? <CheckCircle2 size={16} color="var(--leaf)" /> : "—"}</span>
                        <span className="actions" style={{ gap: "8px" }}>
                          {!s.is_active && (
                            <Button className="tableAction" type="button" onClick={async () => { await academicsApi.activateSession(s.id); await refreshAll(); }}>
                              {t("activateBtn")}
                            </Button>
                          )}
                          {s.is_active && (
                            <Button className="tableAction" type="button" onClick={() => setRolloverSourceSession(s)} style={{ color: "var(--brand-deep)" }}>
                              Year-End Rollover
                            </Button>
                          )}
                          <Button className="iconBtn" title={t("editBtn")} onClick={() => setEditingSession(s)}><Edit2 size={16} /></Button>
                          {!s.is_active && <Button className="iconBtn" title={t("deleteBtn")} onClick={() => handleDelete(() => academicsApi.deleteSession(s.id))}><Trash2 size={16} /></Button>}
                        </span>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* Teacher assignments are managed on the Timetable screen (§4). */}
        </div>
      </div>
      
      {rolloverSourceSession && (
        <RolloverWizard
          sourceSession={rolloverSourceSession}
          classes={classes}
          onClose={() => setRolloverSourceSession(null)}
          onSuccess={async () => {
            setRolloverSourceSession(null);
            await refreshAll();
          }}
        />
      )}

      {courseMapModalClassId && (() => {
        const cls = classes.find((c) => c.id === courseMapModalClassId);
        if (!cls) return null;
        return (
          <CourseMappingModal
            cls={cls}
            assignedCourses={courses[cls.id] ?? []}
            allCourses={allCourses}
            onAssign={async (courseId) => {
              try {
                await academicsApi.assignCourseToClass(cls.id, courseId);
                await refreshAll();
              } catch (err) { handleError(err); }
            }}
            onUnassign={async (courseId) => {
              if (!(await confirm(t("deleteRecordConfirm")))) return;
              try {
                await academicsApi.unassignCourseFromClass(cls.id, courseId);
                await refreshAll();
              } catch (err) { handleError(err); }
            }}
            onClose={() => setCourseMapModalClassId(null)}
          />
        );
      })()}
    </PageSection>
  );
}

/**
 * B7(e): dedicated course↔class mapping layout — a two-column assigned/
 * available picker in a modal (same `modalOverlay`/`modalCard` idiom as
 * `DelegateButton.tsx`), replacing the cramped inline courses column.
 * Same `assignCourseToClass`/`unassignCourseFromClass` calls as before.
 */
function CourseMappingModal({
  cls,
  assignedCourses,
  allCourses,
  onAssign,
  onUnassign,
  onClose,
}: Readonly<{
  cls: AcademicClass;
  assignedCourses: Course[];
  allCourses: Course[];
  onAssign: (courseId: string) => Promise<void>;
  onUnassign: (courseId: string) => Promise<void>;
  onClose: () => void;
}>) {
  const { t } = useTranslation();
  const assignedIds = new Set(assignedCourses.map((co) => co.id));
  const available = allCourses.filter((co) => !assignedIds.has(co.id));

  return (
    <div className="modalOverlay" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="modalCard" style={{ width: "min(680px, 92vw)" }} onClick={(e) => e.stopPropagation()}>
        <div className="moduleHeader" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h3>{t("manageCoursesTitle", { class: cls.name })}</h3>
          <Button className="tableAction" type="button" onClick={onClose}><X size={16} /></Button>
        </div>
        <div className="courseMapColumns">
          <div>
            <h4>{t("assignedCoursesLabel")}</h4>
            <div className="courseMapList">
              {assignedCourses.length === 0 && <p className="emptyState">{t("noCoursesAssignedYet")}</p>}
              {assignedCourses.map((co) => (
                <div className="courseMapItem" key={co.id}>
                  <span>{co.name}</span>
                  <Button className="iconBtn" title={t("unassignBtn")} type="button" onClick={() => void onUnassign(co.id)}>
                    <Trash2 size={14} />
                  </Button>
                </div>
              ))}
            </div>
          </div>
          <div>
            <h4>{t("availableCoursesLabel")}</h4>
            <div className="courseMapList">
              {available.length === 0 && <p className="emptyState">{t("noCoursesAvailableLabel")}</p>}
              {available.map((co) => (
                <div className="courseMapItem" key={co.id}>
                  <span>{co.name}</span>
                  <Button className="iconBtn" title={t("assignCourseBtn")} type="button" onClick={() => void onAssign(co.id)}>
                    <Plus size={14} />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
