import { Fragment, useEffect, useMemo, useState } from "react";
import { BookOpen, ClipboardList, FileDown, Pencil, Plus, Send, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";

import {
  academicsApi,
  assessmentsApi,
  filesApi,
  messagingApi,
  operationsApi,
  peopleApi,
  type AcademicClass,
  type Assignment,
  type Course,
  type ExamType,
  type GradingScheme,
  type ResultsMatrixResponse,
  type Section,
  type SectionResultMatrix,
  type Student,
  type Submission,
  type Teacher,
  type TimetableSlot,
} from "../lib/endpoints";
import { useAuth } from "../lib/AuthContext";
import { consumePendingClassNav } from "../lib/pendingNav";
import { Input, Select } from "./ui/Field";
import { ErrorState, LoadingState } from "./ui/AsyncState";
import { DEFAULT_PAGE_SIZE, pageParams, PaginationControls, recoverEmptyPage, type PageState } from "./ui/Pagination";
import { useSessionReadOnly } from "./SessionSwitcher";

export type AssessmentTab = "assignments" | "grading" | "results" | "setup";

export function AssessmentsView({ tab = "assignments", onTabChange }: Readonly<{ tab?: AssessmentTab; onTabChange?: (tab: AssessmentTab) => void }>) {
  const { t } = useTranslation();
  const { hasPermission, user } = useAuth();
  const isTeacher = user?.role === 'teacher';
  const readOnly = useSessionReadOnly();
  const [classes, setClasses] = useState<AcademicClass[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [teacherSlots, setTeacherSlots] = useState<TimetableSlot[] | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    void (async () => {
      setIsLoading(true);
      setLoadError("");
      try {
        const [allClasses, ownSlots] = await Promise.all([
          academicsApi.listClasses(),
          isTeacher ? operationsApi.listMyTimetable() : Promise.resolve(null),
        ]);
        setTeacherSlots(ownSlots);
        const taughtClassIds = ownSlots ? new Set(ownSlots.map((slot) => slot.class_id)) : null;
        const c = taughtClassIds ? allClasses.filter((cls) => taughtClassIds.has(cls.id)) : allClasses;
        setClasses(c);
        const allCourses = (await Promise.all(c.map((cls) => academicsApi.listCourses(cls.id)))).flat();
        const taughtCourseIds = ownSlots ? new Set(ownSlots.map((slot) => slot.course_id)) : null;
        const unique = new Map(allCourses.map((course) => [course.id, course]));
        setCourses([...unique.values()].filter((course) => !taughtCourseIds || taughtCourseIds.has(course.id)));
        try {
          setStudents(await peopleApi.listStudents());
        } catch {
          setStudents([]); // teachers without students.view still get the rest
        }
        if (hasPermission("assignments.manage_all")) {
          try {
            setTeachers(await peopleApi.listTeachers());
          } catch {
            setTeachers([]);
          }
        }
      } catch (err: any) {
        setLoadError(err.response?.data?.detail ?? t("failedLoadAssessments"));
      } finally {
        setIsLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <section className="modulePanel">
      <div className="moduleHeader">
        <h2>{t("assessmentsTitle")}</h2>
        <p className="notice">{t("assessmentsSubtitle")}</p>
      </div>
      <div className="formActions" style={{ marginBottom: 16 }}>
        {(isTeacher || hasPermission("assignments.create")) && <button className={tab === "assignments" ? "primaryAction" : "secondaryAction"} type="button" onClick={() => onTabChange?.("assignments")}>
          <ClipboardList size={16} /> {t("assignmentsTab")}
        </button>}
        {(isTeacher || hasPermission("assessments.marks.enter")) && <button className={tab === "grading" ? "primaryAction" : "secondaryAction"} type="button" onClick={() => onTabChange?.("grading")}>
          <BookOpen size={16} /> {t("gradingTab")}
        </button>}
        {(hasPermission("grading.schemes.manage") || hasPermission("assessments.exam_types.manage")) && <button className={tab === "setup" ? "primaryAction" : "secondaryAction"} type="button" onClick={() => onTabChange?.("setup")}>
          <BookOpen size={16} /> {t("gradingSetupBtn")}
        </button>}
        {(isTeacher || hasPermission("assessments.marks.enter")) && <button className={tab === "results" ? "primaryAction" : "secondaryAction"} type="button" onClick={() => onTabChange?.("results")}>
          <Send size={16} /> {t("resultsTab")}
        </button>}
      </div>
      {isLoading && <LoadingState />}
      {!isLoading && loadError && <ErrorState message={loadError} />}
      {!isLoading && !loadError && tab === "assignments" && (
        <AssignmentsTab
          classes={classes}
          courses={courses}
          students={students}
          teachers={teachers}
          teacherSlots={teacherSlots}
          canCreate={!readOnly && (isTeacher || hasPermission("assignments.create"))}
          canPublishAll={hasPermission("assignments.manage_all")}
        />
      )}
      {!isLoading && !loadError && tab === "grading" && (
        <GradingTab classes={classes} />
      )}
      {!isLoading && !loadError && tab === "setup" && (
        <GradingSetup
          courses={courses}
          canCreateScheme={!readOnly && hasPermission("grading.schemes.manage")}
          canCreateExamType={!readOnly && hasPermission("assessments.exam_types.manage")}
        />
      )}
      {!isLoading && !loadError && tab === "results" && (
        <ResultsTab
          classes={classes}
          canPublish={!readOnly && hasPermission("assessments.results.publish")}
          canMessage={!readOnly && hasPermission("messaging.send")}
        />
      )}
    </section>
  );
}

// ---------------------------------------------------------------- Assignments

function AssignmentsTab({
  classes,
  courses,
  students,
  teachers,
  teacherSlots,
  canCreate,
  canPublishAll,
}: Readonly<{ classes: AcademicClass[]; courses: Course[]; students: Student[]; teachers: Teacher[]; teacherSlots: TimetableSlot[] | null; canCreate: boolean; canPublishAll: boolean }>) {
  const { t } = useTranslation();
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [filters, setFilters] = useState(() => {
    // Deep link from the dashboard's "open class list" button (§C).
    const pending = consumePendingClassNav();
    return {
      class_id: pending?.classId ?? "",
      section_id: pending?.sectionId ?? "",
      course_id: pending?.courseId ?? "",
      category: "",
      created_by_id: "",
      sort: "due_date",
    };
  });
  const [filterSections, setFilterSections] = useState<Section[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<Assignment | null>(null);
  const [selected, setSelected] = useState<Assignment | null>(null);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [error, setError] = useState("");
  const [pagination, setPagination] = useState<PageState>({ page: 0, pageSize: DEFAULT_PAGE_SIZE });
  const [total, setTotal] = useState(0);
  const updateFilters = (next: typeof filters) => {
    setFilters(next);
    setPagination((current) => current.page === 0 ? current : { ...current, page: 0 });
  };

  const load = async () => {
    const params: Parameters<typeof assessmentsApi.listAssignmentsPage>[0] = { sort: filters.sort, ...pageParams(pagination) };
    if (filters.class_id) params.class_id = filters.class_id;
    if (filters.section_id) params.section_id = filters.section_id;
    if (filters.course_id) params.course_id = filters.course_id;
    if (filters.category) params.category = filters.category;
    if (filters.created_by_id) params.created_by_id = filters.created_by_id;
    const result = await assessmentsApi.listAssignmentsPage(params);
    if (recoverEmptyPage(result, pagination, setPagination)) return;
    setAssignments(result.items);
    setTotal(result.total);
  };
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters, pagination]);

  useEffect(() => {
    if (!filters.class_id) {
      setFilterSections([]);
      return;
    }
    void academicsApi.listSections(filters.class_id).then((rows) => {
      if (!teacherSlots) return setFilterSections(rows);
      const allowed = new Set(
        teacherSlots.filter((slot) => slot.class_id === filters.class_id).map((slot) => slot.section_id)
      );
      setFilterSections(rows.filter((section) => allowed.has(section.id)));
    });
  }, [filters.class_id, teacherSlots]);

  const categories = useMemo(
    () => [...new Set(assignments.map((a) => a.category).filter(Boolean))] as string[],
    [assignments]
  );

  const openSubmissions = async (a: Assignment) => {
    setSelected(a);
    setSubmissions(await assessmentsApi.listSubmissions(a.id));
  };

  return (
    <>
      <div className="filterBar">
        <Select value={filters.class_id} onChange={(e) => updateFilters({ ...filters, class_id: e.target.value, section_id: "" })}>
          <option value="">{t("allClasses")}</option>
          {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
        <Select value={filters.section_id} onChange={(e) => updateFilters({ ...filters, section_id: e.target.value })} disabled={!filters.class_id}>
          <option value="">{t("allSections")}</option>
          {filterSections.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </Select>
        <Select value={filters.course_id} onChange={(e) => updateFilters({ ...filters, course_id: e.target.value })}>
          <option value="">{t("allCourses")}</option>
          {courses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
        <Select value={filters.category} onChange={(e) => updateFilters({ ...filters, category: e.target.value })}>
          <option value="">{t("allCategories")}</option>
          {categories.map((c) => <option key={c} value={c}>{c}</option>)}
        </Select>
        {canPublishAll && (
          <Select value={filters.created_by_id} onChange={(e) => updateFilters({ ...filters, created_by_id: e.target.value })}>
            <option value="">{t("allTeachers")}</option>
            {teachers.map((teacher) => <option key={teacher.id} value={teacher.id}>{teacher.name}</option>)}
          </Select>
        )}
        <Select value={filters.sort} onChange={(e) => updateFilters({ ...filters, sort: e.target.value })}>
          <option value="due_date">{t("sortByDueDate")}</option>
          <option value="created_at">{t("sortByNewest")}</option>
          <option value="title">{t("sortByTitle")}</option>
          {canPublishAll && <option value="teacher">{t("sortByTeacher")}</option>}
        </Select>
        {canCreate && (
          <button className="primaryAction" type="button" onClick={() => setShowCreate((v) => !v)}>
            <Plus size={16} /> {t("createAssignmentBtn")}
          </button>
        )}
      </div>

      {showCreate && canCreate && (
        <AssignmentCreateForm
          classes={classes}
          courses={courses}
          teacherSlots={teacherSlots}
          canPublishAll={canPublishAll}
          onCreated={() => {
            setShowCreate(false);
            void load();
          }}
        />
      )}

      {error && <p className="notice" style={{ color: "var(--rose)" }}>{error}</p>}
      <div className="dataTable">
        <div className="dataRow header">
          <span>{t("titleCol")}</span>
          <span>{t("categoryCol")}</span>
          <span>{t("classSectionCol")}</span>
          <span>{t("courseCol")}</span>
          <span>{t("teacherCol")}</span>
          <span>{t("dueCol")}</span>
          <span></span>
        </div>
        {assignments.length === 0 && <p className="emptyState">{t("noAssignmentsYet")}</p>}
        {assignments.map((a, index) => (
          <Fragment key={a.id}>
          {filters.sort === "teacher" && (index === 0 || assignments[index - 1].teacher_name !== a.teacher_name) && (
            <div className="dataRow sectionRow"><strong>{a.teacher_name ?? t("unassignedLabel")}</strong></div>
          )}
          <div className="dataRow">
            <span>{a.title}</span>
            <span>{a.category ?? "—"}</span>
            <span>{a.class_name ?? "—"}{a.section_name ? ` / ${a.section_name}` : ""}</span>
            <span>{a.course_name ?? "—"}</span>
            <span>{a.teacher_name ?? "—"}</span>
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
                  <FileDown size={14} />
                </button>
              )}
              <button className="tableAction" type="button" onClick={() => openSubmissions(a)}>{t("submissionsBtn")}</button>
              {canCreate && (
                <>
                  <button className="tableAction" type="button" title={t("editBtn")} onClick={() => setEditing(a)}>
                    <Pencil size={14} />
                  </button>
                  <button
                    className="tableAction"
                    type="button"
                    title={t("deleteBtn")}
                    onClick={async () => {
                      const wholeBatch = a.batch_id !== null && window.confirm(t("deleteBatchConfirm"));
                      if (a.batch_id === null && !window.confirm(t("deleteConfirm"))) return;
                      try {
                        await assessmentsApi.deleteAssignment(a.id, wholeBatch);
                        await load();
                      } catch (err: any) {
                        setError(err.response?.data?.detail ?? t("failedDelete"));
                      }
                    }}
                  >
                    <Trash2 size={14} />
                  </button>
                </>
              )}
            </span>
          </div>
          </Fragment>
        ))}
      </div>
      <PaginationControls state={pagination} total={total} onChange={setPagination} />

      {editing && (
        <AssignmentEditForm
          assignment={editing}
          onDone={() => {
            setEditing(null);
            void load();
          }}
          onCancel={() => setEditing(null)}
        />
      )}

      {selected && (
        <div className="modulePanel" style={{ marginTop: 16 }}>
          <h3>{t("submissionsHeading", { title: selected.title })}</h3>
          <div className="dataTable">
            <div className="dataRow header"><span>{t("studentCol")}</span><span>{t("submittedCol")}</span><span>{t("lateCol")}</span><span>{t("markCol")}</span><span></span></div>
            {submissions.length === 0 && <p className="emptyState">{t("noSubmissionsYet")}</p>}
            {submissions.map((s) => (
              <SubmissionRow
                key={s.id}
                submission={s}
                studentName={s.student_name ?? students.find((st) => st.id === s.student_id)?.name ?? t("unknownPersonLabel")}
                onGraded={() => void openSubmissions(selected)}
              />
            ))}
          </div>
        </div>
      )}
    </>
  );
}

function AssignmentCreateForm({
  classes,
  courses,
  teacherSlots,
  canPublishAll,
  onCreated,
}: Readonly<{ classes: AcademicClass[]; courses: Course[]; teacherSlots: TimetableSlot[] | null; canPublishAll: boolean; onCreated: () => void }>) {
  const { t } = useTranslation();
  const [form, setForm] = useState({ class_id: "", course_id: "", title: "", category: "", instructions: "", due_date: "" });
  const [sections, setSections] = useState<Section[]>([]);
  const [sectionIds, setSectionIds] = useState<string[]>([]);
  const [allClasses, setAllClasses] = useState(false);
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    setSectionIds([]);
    if (!form.class_id) {
      setSections([]);
      return;
    }
    void academicsApi.listSections(form.class_id).then((rows) => {
      if (!teacherSlots) return setSections(rows);
      const allowed = new Set(
        teacherSlots.filter((slot) => slot.class_id === form.class_id).map((slot) => slot.section_id)
      );
      setSections(rows.filter((section) => allowed.has(section.id)));
    });
  }, [form.class_id, teacherSlots]);

  const toggleSection = (id: string) =>
    setSectionIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  return (
    <form
      className="inlineForm"
      onSubmit={async (e) => {
        e.preventDefault();
        setError("");
        try {
          let attachment_key: string | undefined;
          if (attachmentFile) {
            const { object_key, upload_url } = await filesApi.presignUpload({
              category: "assignments", filename: attachmentFile.name, content_type: attachmentFile.type || "application/octet-stream", size_bytes: attachmentFile.size,
            });
            await fetch(upload_url, { method: "PUT", body: attachmentFile, headers: { "Content-Type": attachmentFile.type || "application/octet-stream" } });
            attachment_key = object_key;
          }
          await assessmentsApi.createAssignment({
            class_id: allClasses ? undefined : form.class_id,
            course_id: form.course_id,
            section_ids: allClasses ? undefined : sectionIds,
            all_classes: allClasses || undefined,
            title: form.title,
            category: form.category || undefined,
            instructions: form.instructions,
            due_date: new Date(form.due_date).toISOString(),
            attachment_key,
          });
          onCreated();
        } catch (err: any) {
          setError(err.response?.data?.detail ?? t("failedCreateAssignment"));
        }
      }}
    >
      {canPublishAll && (
        <label className="checkboxLabel">
          <input
            type="checkbox"
            checked={allClasses}
            onChange={(e) => {
              setAllClasses(e.target.checked);
              if (e.target.checked) {
                setForm({ ...form, class_id: "" });
                setSectionIds([]);
              }
            }}
          />
          {t("publishAllClassesLabel")}
        </label>
      )}
      {allClasses && <small className="notice">{t("publishAllClassesHint")}</small>}
      {!allClasses && (
        <label>
          {t("classLabel")}
          <Select required value={form.class_id} onChange={(e) => setForm({ ...form, class_id: e.target.value })}>
            <option value="">{t("selectEllipsis")}</option>
            {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </label>
      )}
      <label>
        {t("courseLabel")}
        <Select required value={form.course_id} onChange={(e) => setForm({ ...form, course_id: e.target.value })}>
          <option value="">{t("selectEllipsis")}</option>
          {courses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
      </label>
      {!allClasses && sections.length > 0 && (
        <fieldset className="sectionPicker">
          <legend>{t("sectionsLegend")}</legend>
          <small className="notice">{t("sectionsHint")}</small>
          {sections.map((s) => (
            <label key={s.id} className="checkboxLabel">
              <input type="checkbox" checked={sectionIds.includes(s.id)} onChange={() => toggleSection(s.id)} />
              {s.name}
            </label>
          ))}
        </fieldset>
      )}
      <label>
        {t("titleLabel")}
        <Input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
      </label>
      <label>
        {t("categoryLabel")}
        <Input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder={t("categoryPlaceholder")} />
      </label>
      <label>
        {t("instructionsLabel")}
        <Input required value={form.instructions} onChange={(e) => setForm({ ...form, instructions: e.target.value })} />
      </label>
      <label>
        {t("dueDateLabel")}
        <Input required type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} />
      </label>
      <label>
        {t("attachmentLabel")}
        <Input type="file" onChange={(e) => setAttachmentFile(e.target.files?.[0] ?? null)} />
      </label>
      {error && <p className="notice" style={{ color: "var(--rose)" }}>{error}</p>}
      <div className="formActions">
        <button className="primaryAction" type="submit"><Plus size={16} /> {t("createAssignmentBtn")}</button>
      </div>
    </form>
  );
}

function AssignmentEditForm({
  assignment,
  onDone,
  onCancel,
}: Readonly<{ assignment: Assignment; onDone: () => void; onCancel: () => void }>) {
  const { t } = useTranslation();
  const [form, setForm] = useState({
    title: assignment.title,
    category: assignment.category ?? "",
    instructions: assignment.instructions,
    due_date: assignment.due_date.slice(0, 10),
    apply_to_batch: false,
  });
  const [error, setError] = useState("");

  return (
    <form
      className="inlineForm"
      style={{ marginTop: 16 }}
      onSubmit={async (e) => {
        e.preventDefault();
        setError("");
        try {
          await assessmentsApi.updateAssignment(assignment.id, {
            title: form.title,
            category: form.category || undefined,
            instructions: form.instructions,
            due_date: new Date(form.due_date).toISOString(),
            apply_to_batch: form.apply_to_batch,
          });
          onDone();
        } catch (err: any) {
          setError(err.response?.data?.detail ?? t("failedUpdate"));
        }
      }}
    >
      <h3 style={{ gridColumn: "1 / -1" }}>{t("editAssignmentHeading", { title: assignment.title })}</h3>
      <label>{t("titleLabel")}<Input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></label>
      <label>{t("categoryLabel")}<Input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} /></label>
      <label>{t("instructionsLabel")}<Input required value={form.instructions} onChange={(e) => setForm({ ...form, instructions: e.target.value })} /></label>
      <label>{t("dueDateLabel")}<Input required type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} /></label>
      {assignment.batch_id && (
        <label className="checkboxLabel">
          <input type="checkbox" checked={form.apply_to_batch} onChange={(e) => setForm({ ...form, apply_to_batch: e.target.checked })} />
          {t("applyToBatchLabel")}
        </label>
      )}
      {error && <p className="notice" style={{ color: "var(--rose)" }}>{error}</p>}
      <div className="formActions">
        <button className="primaryAction" type="submit">{t("saveBtn")}</button>
        <button className="secondaryAction" type="button" onClick={onCancel}>{t("cancelBtn")}</button>
      </div>
    </form>
  );
}

function SubmissionRow({
  submission,
  studentName,
  onGraded,
}: Readonly<{ submission: Submission; studentName: string; onGraded: () => void }>) {
  const { t } = useTranslation();
  const [mark, setMark] = useState(submission.mark?.toString() ?? "");
  return (
    <div className="dataRow">
      <span>{studentName}</span>
      <span>{new Date(submission.submitted_at).toLocaleString()}</span>
      <span>{submission.is_late ? t("lateLabel") : t("onTimeLabel")}</span>
      <span>
        <Input style={{ width: 60 }} value={mark} onChange={(e) => setMark(e.target.value)} />
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

// ------------------------------------------------------------------- Grading

function GradingTab({
  classes,
}: Readonly<{ classes: AcademicClass[] }>) {
  const { t } = useTranslation();
  const [classId, setClassId] = useState("");
  const [matrix, setMatrix] = useState<ResultsMatrixResponse | null>(null);
  const [courseId, setCourseId] = useState("");
  const [sectionId, setSectionId] = useState("");
  const [error, setError] = useState("");

  const load = async (targetClassId: string) => {
    setError("");
    if (!targetClassId) {
      setMatrix(null);
      return;
    }
    try {
      const data = await assessmentsApi.resultsMatrix({ class_id: targetClassId });
      setMatrix(data);
      const firstSection = data.sections[0];
      setSectionId((prev) => (data.sections.some((s) => s.section_id === prev) ? prev : firstSection?.section_id ?? ""));
      const sectionCourses = firstSection?.courses ?? [];
      setCourseId((prev) => (sectionCourses.some((c) => c.course_id === prev) ? prev : sectionCourses[0]?.course_id ?? ""));
    } catch (err: any) {
      setMatrix(null);
      setError(err.response?.data?.detail ?? t("failedLoadResult"));
    }
  };

  useEffect(() => {
    void load(classId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classId]);

  const section = matrix?.sections.find((s) => s.section_id === sectionId) ?? null;
  const course = section?.courses.find((c) => c.course_id === courseId) ?? null;

  return (
    <>
      <div className="filterBar">
        <Select value={classId} onChange={(e) => setClassId(e.target.value)}>
          <option value="">{t("chooseClassEllipsis")}</option>
          {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
        {matrix && section && (
          <Select value={courseId} onChange={(e) => setCourseId(e.target.value)}>
            {section.courses.map((c) => <option key={c.course_id} value={c.course_id}>{c.course_name}</option>)}
          </Select>
        )}
      </div>
      {error && <p className="notice" style={{ color: "var(--rose)" }}>{error}</p>}

      {matrix && (
        <div className="formActions" style={{ marginBottom: 8 }}>
          {matrix.sections.map((s) => (
            <button
              key={s.section_id}
              type="button"
              className={s.section_id === sectionId ? "primaryAction" : "secondaryAction"}
              onClick={() => setSectionId(s.section_id)}
            >
              {s.section_name}
            </button>
          ))}
        </div>
      )}

      {section && course && (
        <>
          <p className="notice">
            {t("gradingContext", {
              course: course.course_name,
              section: section.section_name,
              teacher: course.teacher_name ?? "—",
            })}
          </p>
          {course.exam_types.length === 0 ? (
            <p className="emptyState">{t("noExamTypesForCourse")}</p>
          ) : (
            <div className="sheetWrap">
              <table className="sheet">
                <thead>
                  <tr>
                    <th>{t("studentCol")}</th>
                    <th>{t("admissionNoCol")}</th>
                    {course.exam_types.map((et) => (
                      <th key={et.id}>{et.name} <small>({et.weightage})</small></th>
                    ))}
                    <th>{t("scoreCol")}</th>
                    <th>{t("bandCol")}</th>
                  </tr>
                </thead>
                <tbody>
                  {section.students.map((student) => {
                    const cell = student.courses.find((c) => c.course_id === course.course_id);
                    return (
                      <tr key={student.student_id}>
                        <td>{student.name}</td>
                        <td>{student.admission_number}</td>
                        {course.exam_types.map((et) => (
                          <td key={et.id}>
                            <MarkCell
                              examTypeId={et.id}
                              studentId={student.student_id}
                              initial={cell?.marks.find((m) => m.exam_type_id === et.id)?.score ?? null}
                              onSaved={() => void load(classId)}
                            />
                          </td>
                        ))}
                        <td>{cell?.raw_score ?? "—"}</td>
                        <td>{cell?.band ?? "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </>
  );
}

function MarkCell({
  examTypeId,
  studentId,
  initial,
  onSaved,
}: Readonly<{ examTypeId: string; studentId: string; initial: number | null; onSaved: () => void }>) {
  const [value, setValue] = useState(initial?.toString() ?? "");
  const [saving, setSaving] = useState(false);

  useEffect(() => setValue(initial?.toString() ?? ""), [initial]);

  const save = async () => {
    if (value === "" || Number(value) === initial) return;
    setSaving(true);
    try {
      await assessmentsApi.enterMark({ exam_type_id: examTypeId, student_id: studentId, score: Number(value) });
      onSaved();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Input
      className="markInput"
      value={value}
      disabled={saving}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => void save()}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
      }}
    />
  );
}

function GradingSetup({
  courses,
  canCreateScheme,
  canCreateExamType,
}: Readonly<{ courses: Course[]; canCreateScheme: boolean; canCreateExamType: boolean }>) {
  const { t } = useTranslation();
  const [schemes, setSchemes] = useState<GradingScheme[]>([]);
  const [examTypes, setExamTypes] = useState<ExamType[]>([]);
  const [schemeForm, setSchemeForm] = useState({ name: "", bandsText: "Mumtaz:90-100, Jayyid:60-89.99, Rasib:0-59.99" });
  const [examForm, setExamForm] = useState({ course_id: "", name: "", weightage: "", grading_scheme_id: "" });
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
    <div className="modulePanel" style={{ marginBottom: 16 }}>
      {canCreateScheme && <form
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
        <label>{t("schemeNameLabel")}<Input required value={schemeForm.name} onChange={(e) => setSchemeForm({ ...schemeForm, name: e.target.value })} /></label>
        <label style={{ gridColumn: "span 2" }}>
          {t("bandsLabel")}
          <Input required value={schemeForm.bandsText} onChange={(e) => setSchemeForm({ ...schemeForm, bandsText: e.target.value })} />
        </label>
        <div className="formActions"><button className="primaryAction" type="submit"><Plus size={16} /> {t("addSchemeBtn")}</button></div>
      </form>}
      <div className="dataTable">
        <div className="dataRow header"><span>{t("schemeCol")}</span><span>{t("bandsCol")}</span></div>
        {schemes.map((s) => (
          <div className="dataRow" key={s.id}>
            <span>{s.name}</span>
            <span>{s.bands.map((b) => `${b.label} (${b.min_score}-${b.max_score})`).join(", ")}</span>
          </div>
        ))}
      </div>

      {canCreateExamType && <form
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
          <Select required value={examForm.course_id} onChange={(e) => setExamForm({ ...examForm, course_id: e.target.value })}>
            <option value="">{t("selectEllipsis")}</option>
            {courses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </label>
        <label>{t("examNameLabel")}<Input required value={examForm.name} onChange={(e) => setExamForm({ ...examForm, name: e.target.value })} placeholder={t("examExample")} /></label>
        <label>{t("weightageLabel")}<Input required type="number" value={examForm.weightage} onChange={(e) => setExamForm({ ...examForm, weightage: e.target.value })} placeholder="40" /></label>
        <label>
          {t("gradingSchemeLabel")}
          <Select required value={examForm.grading_scheme_id} onChange={(e) => setExamForm({ ...examForm, grading_scheme_id: e.target.value })}>
            <option value="">{t("selectEllipsis")}</option>
            {schemes.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
        </label>
        <div className="formActions"><button className="primaryAction" type="submit"><Plus size={16} /> {t("addExamTypeBtn")}</button></div>
      </form>}
      <div className="dataTable">
        <div className="dataRow header"><span>{t("courseCol")}</span><span>{t("examCol")}</span><span>{t("weightageCol")}</span></div>
        {examTypes.map((et) => (
          <div className="dataRow" key={et.id}>
            <span>{courses.find((c) => c.id === et.course_id)?.name ?? "—"}</span>
            <span>{et.name}</span>
            <span>{et.weightage}%</span>
          </div>
        ))}
      </div>
      {error && <p className="notice" style={{ color: "var(--rose)" }}>{error}</p>}
    </div>
  );
}

// ------------------------------------------------------------------- Results

function ResultsTab({
  classes,
  canPublish,
  canMessage,
}: Readonly<{ classes: AcademicClass[]; canPublish: boolean; canMessage: boolean }>) {
  const { t } = useTranslation();
  const [classId, setClassId] = useState("");
  const [matrix, setMatrix] = useState<ResultsMatrixResponse | null>(null);
  const [hiddenCourses, setHiddenCourses] = useState<Set<string>>(new Set());
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = async (targetClassId: string) => {
    setError("");
    setNotice("");
    if (!targetClassId) {
      setMatrix(null);
      return;
    }
    try {
      setMatrix(await assessmentsApi.resultsMatrix({ class_id: targetClassId }));
      setHiddenCourses(new Set());
    } catch (err: any) {
      setMatrix(null);
      setError(err.response?.data?.detail ?? t("failedLoadResult"));
    }
  };

  useEffect(() => {
    void load(classId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classId]);

  const toggleCourse = (id: string) =>
    setHiddenCourses((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const allCourses = matrix?.sections.flatMap((s) => s.courses) ?? [];
  const uniqueCourses = [...new Map(allCourses.map((c) => [c.course_id, c])).values()];

  const publishSection = async (section: SectionResultMatrix) => {
    if (!matrix) return;
    try {
      await assessmentsApi.publishResults(matrix.session_id, section.students.map((s) => s.student_id));
      setNotice(t("publishedSectionNotice", { section: section.section_name }));
    } catch (err: any) {
      setError(err.response?.data?.detail ?? t("failedPublish"));
    }
  };

  const sendReport = async (studentId: string) => {
    setNotice("");
    try {
      const link = await messagingApi.sendReport({ student_id: studentId, result_link: window.location.origin });
      window.open(link.url, "_blank", "noopener,noreferrer");
    } catch (err: any) {
      setError(err.response?.data?.detail ?? t("failedSendReport"));
    }
  };

  return (
    <>
      <div className="filterBar">
        <Select value={classId} onChange={(e) => setClassId(e.target.value)}>
          <option value="">{t("chooseClassEllipsis")}</option>
          {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
        {matrix && (
          <>
            <button className="secondaryAction" type="button" onClick={() => void assessmentsApi.exportResults({ class_id: classId }, "csv")}>
              <FileDown size={16} /> CSV
            </button>
            <button className="secondaryAction" type="button" onClick={() => void assessmentsApi.exportResults({ class_id: classId }, "pdf")}>
              <FileDown size={16} /> PDF
            </button>
          </>
        )}
      </div>

      {matrix && uniqueCourses.length > 0 && (
        <div className="formActions" style={{ marginBottom: 8, flexWrap: "wrap" }}>
          <small className="notice">{t("toggleColumnsHint")}</small>
          {uniqueCourses.map((c) => (
            <label key={c.course_id} className="checkboxLabel">
              <input type="checkbox" checked={!hiddenCourses.has(c.course_id)} onChange={() => toggleCourse(c.course_id)} />
              {c.course_name}
            </label>
          ))}
        </div>
      )}

      {error && <p className="notice" style={{ color: "var(--rose)" }}>{error}</p>}
      {notice && <p className="notice">{notice}</p>}

      {matrix?.sections.map((section) => {
        const visibleCourses = section.courses.filter((c) => !hiddenCourses.has(c.course_id));
        return (
          <div className="modulePanel" key={section.section_id} style={{ marginTop: 16 }}>
            <div className="moduleHeader" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h3>{section.class_name} / {section.section_name}</h3>
              {canPublish && (
                <button className="primaryAction" type="button" onClick={() => void publishSection(section)}>
                  <Send size={16} /> {t("publishSectionBtn")}
                </button>
              )}
            </div>
            <div className="sheetWrap">
              <table className="sheet">
                <thead>
                  <tr>
                    <th>{t("studentCol")}</th>
                    <th>{t("admissionNoCol")}</th>
                    {visibleCourses.map((c) => <th key={c.course_id}>{c.course_name}</th>)}
                    <th>{t("overallLabel")}</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {section.students.length === 0 && (
                    <tr><td colSpan={visibleCourses.length + 4}>{t("noStudentsInSection")}</td></tr>
                  )}
                  {section.students.map((student) => (
                    <tr key={student.student_id}>
                      <td>{student.name}</td>
                      <td>{student.admission_number}</td>
                      {visibleCourses.map((c) => {
                        const cell = student.courses.find((x) => x.course_id === c.course_id);
                        return (
                          <td key={c.course_id}>
                            {cell?.raw_score !== null && cell?.raw_score !== undefined
                              ? `${cell.raw_score}${cell.band ? ` (${cell.band})` : ""}`
                              : "—"}
                          </td>
                        );
                      })}
                      <td><strong>{student.overall_score ?? "—"}</strong></td>
                      <td>
                        <button
                          className="tableAction"
                          type="button"
                          title={t("downloadResultCardBtn")}
                          onClick={() => void assessmentsApi.downloadResultCard(student.student_id, matrix.session_id)}
                        >
                          <FileDown size={14} />
                        </button>
                        {canMessage && (
                          <button className="tableAction" type="button" title={t("sendToParentsBtn")} onClick={() => void sendReport(student.student_id)}>
                            <Send size={14} />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="teacherSummary">
              <strong>{t("courseTeachersHeading")}</strong>
              <ul>
                {section.courses.map((c) => (
                  <li key={c.course_id}>{c.course_name} — {c.teacher_name ?? "—"}</li>
                ))}
              </ul>
            </div>
          </div>
        );
      })}
    </>
  );
}
