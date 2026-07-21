import { Button } from "./ui/Button";
import { Fragment, useEffect, useMemo, useState } from "react";
import { BookOpen, ClipboardList, FileDown, Pencil, Plus, Send, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useDialog } from "../lib/DialogContext";

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
import { Input, Select, Checkbox } from "./ui/Field";
import { ErrorState, LoadingState } from "./ui/AsyncState";
import { DataTable } from "./ui/DataTable";
import { DEFAULT_PAGE_SIZE, pageParams, PaginationControls, recoverEmptyPage, type PageState } from "./ui/Pagination";
import { useSessionReadOnly } from "./SessionSwitcher";
import { Modal, FormModal } from "./ui/Modal";
import { PageSection, PageHeader } from "./ui/Layout";

export type AssessmentTab = "assignments" | "grading" | "results" | "setup";

export function AssessmentsView({ tab = "assignments", onTabChange }: Readonly<{ tab?: AssessmentTab; onTabChange?: (tab: AssessmentTab) => void }>) {
  const { t } = useTranslation();
  const { confirm, alert } = useDialog();
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
    <PageSection>
      <PageHeader title={t("assessmentsTitle")} notice={t("assessmentsSubtitle")} />
      <div className="formActions" style={{ marginBottom: 16 }}>
        {(isTeacher || hasPermission("assignments.create")) && <Button className={tab === "assignments" ? "primaryAction" : "secondaryAction"} type="button" onClick={() => onTabChange?.("assignments")}>
          <ClipboardList size={16} /> {t("assignmentsTab")}
        </Button>}
        {(isTeacher || hasPermission("assessments.marks.enter")) && <Button className={tab === "grading" ? "primaryAction" : "secondaryAction"} type="button" onClick={() => onTabChange?.("grading")}>
          <BookOpen size={16} /> {t("gradingTab")}
        </Button>}
        {(hasPermission("grading.schemes.manage") || hasPermission("assessments.exam_types.manage")) && <Button className={tab === "setup" ? "primaryAction" : "secondaryAction"} type="button" onClick={() => onTabChange?.("setup")}>
          <BookOpen size={16} /> {t("gradingSetupBtn")}
        </Button>}
        {(isTeacher || hasPermission("assessments.marks.enter")) && <Button className={tab === "results" ? "primaryAction" : "secondaryAction"} type="button" onClick={() => onTabChange?.("results")}>
          <Send size={16} /> {t("resultsTab")}
        </Button>}
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
    </PageSection>
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
          <Button className="primaryAction" type="button" onClick={() => setShowCreate((v) => !v)}>
            <Plus size={16} /> {t("createAssignmentBtn")}
          </Button>
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
          onClose={() => setShowCreate(false)}
        />
      )}

      {error && <p className="notice" style={{ color: "var(--rose)" }}>{error}</p>}
      <DataTable<Assignment>
        columns={[
          { header: t("titleCol"), render: (a) => a.title },
          { header: t("categoryCol"), render: (a) => a.category ?? "—" },
          { header: t("classSectionCol"), render: (a) => `${a.class_name ?? "—"}${a.section_name ? ` / ${a.section_name}` : ""}` },
          { header: t("courseCol"), render: (a) => a.course_name ?? "—" },
          { header: t("teacherCol"), render: (a) => a.teacher_name ?? "—" },
          { header: t("dueCol"), render: (a) => new Date(a.due_date).toLocaleDateString() },
          { header: t("actionsCol"), render: (a) => (
            <>
              {a.attachment_key && (
                <Button
                  className="tableAction"
                  type="button"
                  onClick={async () => {
                    const { url } = await filesApi.presignDownload(a.attachment_key!);
                    window.open(url, "_blank", "noreferrer");
                  }}
                >
                  <FileDown size={14} />
                </Button>
              )}
              <Button className="tableAction" type="button" onClick={() => openSubmissions(a)}>{t("submissionsBtn")}</Button>
              {canCreate && (
                <>
                  <Button className="tableAction" type="button" title={t("editBtn")} onClick={() => setEditing(a)}>
                    <Pencil size={14} />
                  </Button>
                  <Button
                    className="tableAction"
                    type="button"
                    title={t("deleteBtn")}
                    onClick={async () => {
                      const wholeBatch = a.batch_id !== null && (await confirm(t("deleteBatchConfirm")));
                      if (a.batch_id === null && !(await confirm(t("deleteConfirm")))) return;
                      try {
                        await assessmentsApi.deleteAssignment(a.id, wholeBatch);
                        await load();
                      } catch (err: any) {
                        setError(err.response?.data?.detail ?? t("failedDelete"));
                      }
                    }}
                  >
                    <Trash2 size={14} />
                  </Button>
                </>
              )}
            </>
          )},
        ]}
        data={assignments}
        keyExtractor={(a) => a.id}
        renderBeforeRow={(a, index, arr) => (
          filters.sort === "teacher" && (index === 0 || arr[index - 1].teacher_name !== a.teacher_name) ? (
            <div className="dataRow sectionRow"><strong>{a.teacher_name ?? t("unassignedLabel")}</strong></div>
          ) : null
        )}
        emptyMessage={t("noAssignmentsYet")}
      />
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
        <PageSection style={{ marginTop: 16 }}>
          <h3>{t("submissionsHeading", { title: selected.title })}</h3>
          <div className="dataTable">
            <div className="dataRow header"><span>{t("studentCol")}</span><span>{t("submittedCol")}</span><span>{t("lateCol")}</span><span>{t("markCol")}</span><span>{t("actionsCol")}</span></div>
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
        </PageSection>
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
  onClose,
}: Readonly<{ classes: AcademicClass[]; courses: Course[]; teacherSlots: TimetableSlot[] | null; canPublishAll: boolean; onCreated: () => void; onClose: () => void; }>) {
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
    <FormModal
      title={t("createAssignmentBtn")}
      onClose={onClose}
      submitLabel={t("createAssignmentBtn")}
      submitIcon={<Plus size={16} />}
      error={error}
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
      <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      {canPublishAll && (
        <label className="checkboxLabel">
          <Checkbox
            
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
              <Checkbox  checked={sectionIds.includes(s.id)} onChange={() => toggleSection(s.id)} />
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
      </div>
    </FormModal>
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
    <FormModal
      title={t("editAssignmentHeading", { title: assignment.title })}
      onClose={onCancel}
      submitLabel={t("saveBtn")}
      error={error}
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
      <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      <label>{t("titleLabel")}<Input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></label>
      <label>{t("categoryLabel")}<Input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} /></label>
      <label>{t("instructionsLabel")}<Input required value={form.instructions} onChange={(e) => setForm({ ...form, instructions: e.target.value })} /></label>
      <label>{t("dueDateLabel")}<Input required type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} /></label>
      {assignment.batch_id && (
        <label className="checkboxLabel">
          <Checkbox  checked={form.apply_to_batch} onChange={(e) => setForm({ ...form, apply_to_batch: e.target.checked })} />
          {t("applyToBatchLabel")}
        </label>
      )}
      </div>
    </FormModal>
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
        <Button
          className="tableAction"
          type="button"
          onClick={async () => {
            const { url } = await filesApi.presignDownload(submission.file_key);
            window.open(url, "_blank", "noreferrer");
          }}
        >
          <FileDown size={14} /> {t("downloadBtn")}
        </Button>
        <Button
          className="tableAction"
          type="button"
          onClick={async () => {
            await assessmentsApi.gradeSubmission(submission.id, { mark: Number(mark) });
            onGraded();
          }}
        >
          {t("saveBtn")}
        </Button>
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
            <Button
              key={s.section_id}
              type="button"
              className={s.section_id === sectionId ? "primaryAction" : "secondaryAction"}
              onClick={() => setSectionId(s.section_id)}
            >
              {s.section_name}
            </Button>
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
  type EditableBand = { label: string; min_score: string; max_score: string };
  const defaultBands: EditableBand[] = [];
  const [schemes, setSchemes] = useState<GradingScheme[]>([]);
  const [examTypes, setExamTypes] = useState<ExamType[]>([]);
  const [schemeForm, setSchemeForm] = useState({ name: "", bands: defaultBands });
  const [examForm, setExamForm] = useState({ course_id: "", name: "", weightage: "", grading_scheme_id: "" });
  const [editingScheme, setEditingScheme] = useState<GradingScheme | null>(null);
  const [editingExam, setEditingExam] = useState<ExamType | null>(null);
  const [showSchemeForm, setShowSchemeForm] = useState(false);
  const [showExamForm, setShowExamForm] = useState(false);
  const [error, setError] = useState("");

  const load = async () => {
    setSchemes(await assessmentsApi.listGradingSchemes());
    setExamTypes(await assessmentsApi.listExamTypes());
  };
  useEffect(() => {
    void load();
  }, []);

  return (
    <PageSection style={{ marginBottom: 16 }}>
      <h3>{t("setupGradingSchemeTitle")}</h3>
      <div className="formActions" style={{ marginBottom: 12 }}>
        {canCreateScheme && <Button className="primaryAction" type="button" onClick={() => {
          setEditingScheme(null);
          setSchemeForm({ name: "", bands: defaultBands });
          setShowSchemeForm(true);
        }}><Plus size={16} /> {t("addSchemeBtn")}</Button>}
        {canCreateExamType && <Button className="primaryAction" type="button" onClick={() => {
          setEditingExam(null);
          setExamForm({ course_id: "", name: "", weightage: "", grading_scheme_id: "" });
          setShowExamForm(true);
        }}><Plus size={16} /> {t("addExamTypeBtn")}</Button>}
      </div>
      {showSchemeForm && <FormModal
            title={editingScheme ? t("editBtn") : t("addSchemeBtn")} onClose={() => setShowSchemeForm(false)}
            onSubmit={async (e) => {
                    e.preventDefault();
                    setError("");
                    try {
                      const payload = {
                        name: schemeForm.name,
                        bands: schemeForm.bands.map((band) => ({
                          label: band.label,
                          min_score: Number(band.min_score),
                          max_score: Number(band.max_score),
                        })),
                      };
                      if (editingScheme) await assessmentsApi.updateGradingScheme(editingScheme.id, payload);
                      else await assessmentsApi.createGradingScheme(payload);
                      setSchemeForm({ name: "", bands: defaultBands });
                      setEditingScheme(null);
                      setShowSchemeForm(false);
                      await load();
                    } catch (err: any) {
                      setError(err.response?.data?.detail ?? t("failedCreateScheme"));
                    }
                  }}
            submitLabel={t("addSchemeBtn")}
            submitIcon={<Plus size={16} />}
            submitDisabled={schemeForm.bands.length === 0}
          >
            <label>{t("schemeNameLabel")}<Input required value={schemeForm.name} onChange={(e) => setSchemeForm({ ...schemeForm, name: e.target.value })} /></label>

          <div style={{ gridColumn: "1 / -1", display: "grid", gap: 8 }}>
                    <strong>{t("bandsLabel")}</strong>
                    {schemeForm.bands.map((band, index) => <div style={{ display: "flex", gap: "1rem", alignItems: "flex-end", margin: 0 }} key={index}>
                      <label>{t("nameLabel")}<Input required value={band.label} onChange={(event) => setSchemeForm({ ...schemeForm, bands: schemeForm.bands.map((item, itemIndex) => itemIndex === index ? { ...item, label: event.target.value } : item) })} /></label>
                      <label>{t("minimumLabel")}<Input required type="number" value={band.min_score} onChange={(event) => setSchemeForm({ ...schemeForm, bands: schemeForm.bands.map((item, itemIndex) => itemIndex === index ? { ...item, min_score: event.target.value } : item) })} /></label>
                      <label>{t("maximumLabel")}<Input required type="number" value={band.max_score} onChange={(event) => setSchemeForm({ ...schemeForm, bands: schemeForm.bands.map((item, itemIndex) => itemIndex === index ? { ...item, max_score: event.target.value } : item) })} /></label>
                      <Button className="tableAction" type="button" onClick={() => setSchemeForm({ ...schemeForm, bands: schemeForm.bands.filter((_, itemIndex) => itemIndex !== index) })}><Trash2 size={14} /></Button>
                    </div>)}
                    <Button className="secondaryAction" type="button" onClick={() => setSchemeForm({ ...schemeForm, bands: [...schemeForm.bands, { label: "", min_score: "", max_score: "" }] })}><Plus size={14} /> {t("addFieldBtn")}</Button>
                  </div>
          </FormModal>}
      <DataTable<GradingScheme>
        columns={[
          { header: t("schemeCol"), render: (s) => s.name },
          { header: t("bandsCol"), render: (s) => s.bands.map((b) => `${b.label} (${b.min_score}-${b.max_score})`).join(", ") },
          { header: t("actionsCol"), render: (s) => (
            <span className="actions">
              {canCreateScheme && <Button className="iconBtn" type="button" title={t("editBtn")} onClick={() => {
                setEditingScheme(s);
                setSchemeForm({ name: s.name, bands: s.bands.map((band) => ({ label: band.label, min_score: String(band.min_score), max_score: String(band.max_score) })) });
                setShowSchemeForm(true);
              }}><Pencil size={15} /></Button>}
              {canCreateScheme && <Button className="iconBtn" type="button" title={t("deleteBtn")} onClick={async () => {
                if (!(await confirm(t("deleteRecordConfirm")))) return;
                try { await assessmentsApi.deleteGradingScheme(s.id); await load(); }
                catch (err: any) { setError(err.response?.data?.detail ?? t("genericError")); }
              }}><Trash2 size={15} /></Button>}
            </span>
          )},
        ]}
        data={schemes}
        keyExtractor={(s) => s.id}
      />

      {showExamForm && <FormModal
            title={editingExam ? t("editBtn") : t("addExamTypeBtn")} onClose={() => setShowExamForm(false)}
            onSubmit={async (e) => {
                    e.preventDefault();
                    setError("");
                    try {
                      const payload = {
                        course_id: examForm.course_id,
                        name: examForm.name,
                        weightage: Number(examForm.weightage),
                        grading_scheme_id: examForm.grading_scheme_id,
                      };
                      if (editingExam) await assessmentsApi.updateExamType(editingExam.id, payload);
                      else await assessmentsApi.createExamType(payload);
                      setExamForm({ course_id: "", name: "", weightage: "", grading_scheme_id: "" });
                      setEditingExam(null);
                      setShowExamForm(false);
                      await load();
                    } catch (err: any) {
                      setError(err.response?.data?.detail ?? t("failedCreateExamType"));
                    }
                  }}
            submitLabel={t("addExamTypeBtn")}
            submitIcon={<Plus size={16} />}
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
          </FormModal>}
      <DataTable<ExamType>
        columns={[
          { header: t("courseCol"), render: (et) => courses.find((c) => c.id === et.course_id)?.name ?? "—" },
          { header: t("examCol"), render: (et) => et.name },
          { header: t("weightageCol"), render: (et) => `${et.weightage}%` },
          { header: t("actionsCol"), render: (et) => (
            <span className="actions">
              {canCreateExamType && <Button className="iconBtn" type="button" title={t("editBtn")} onClick={() => {
                setEditingExam(et);
                setExamForm({ course_id: et.course_id, name: et.name, weightage: String(et.weightage), grading_scheme_id: et.grading_scheme_id });
                setShowExamForm(true);
              }}><Pencil size={15} /></Button>}
              {canCreateExamType && <Button className="iconBtn" type="button" title={t("deleteBtn")} onClick={async () => {
                if (!(await confirm(t("deleteRecordConfirm")))) return;
                try { await assessmentsApi.deleteExamType(et.id); await load(); }
                catch (err: any) { setError(err.response?.data?.detail ?? t("genericError")); }
              }}><Trash2 size={15} /></Button>}
            </span>
          )},
        ]}
        data={examTypes}
        keyExtractor={(et) => et.id}
      />
      {error && <p className="notice" style={{ color: "var(--rose)" }}>{error}</p>}
    </PageSection>
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
      if (link.url) window.open(link.url, "_blank", "noopener,noreferrer");
      else if (link.direct_sent) setNotice(t("whatsappDocumentSent"));
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
            <Button className="secondaryAction" type="button" onClick={() => void assessmentsApi.exportResults({ class_id: classId }, "csv")}>
              <FileDown size={16} /> CSV
            </Button>
            <Button className="secondaryAction" type="button" onClick={() => void assessmentsApi.exportResults({ class_id: classId }, "pdf")}>
              <FileDown size={16} /> PDF
            </Button>
          </>
        )}
      </div>

      {matrix && uniqueCourses.length > 0 && (
        <div className="formActions" style={{ marginBottom: 8, flexWrap: "wrap" }}>
          <small className="notice">{t("toggleColumnsHint")}</small>
          {uniqueCourses.map((c) => (
            <label key={c.course_id} className="checkboxLabel">
              <Checkbox  checked={!hiddenCourses.has(c.course_id)} onChange={() => toggleCourse(c.course_id)} />
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
          <PageSection key={section.section_id} style={{ marginTop: 16 }}>
            <PageHeader title={`${section.class_name} / ${section.section_name}`}>
              {canPublish && (
                <Button className="primaryAction" type="button" onClick={() => void publishSection(section)}>
                  <Send size={16} /> {t("publishSectionBtn")}
                </Button>
              )}
            </PageHeader>
            <div className="sheetWrap">
              <table className="sheet">
                <thead>
                  <tr>
                    <th>{t("studentCol")}</th>
                    <th>{t("admissionNoCol")}</th>
                    {visibleCourses.map((c) => <th key={c.course_id}>{c.course_name}</th>)}
                    <th>{t("overallLabel")}</th>
                    <th>{t("actionsCol")}</th>
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
                        <Button
                          className="tableAction"
                          type="button"
                          title={t("downloadResultCardBtn")}
                          onClick={() => void assessmentsApi.downloadResultCard(student.student_id, matrix.session_id)}
                        >
                          <FileDown size={14} />
                        </Button>
                        {canMessage && (
                          <Button className="tableAction" type="button" title={t("sendToParentsBtn")} onClick={() => void sendReport(student.student_id)}>
                            <Send size={14} />
                          </Button>
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
          </PageSection>
        );
      })}
    </>
  );
}
