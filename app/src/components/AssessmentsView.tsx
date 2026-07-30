import { Button, PrimaryButton, SecondaryButton, DangerButton, IconButton, TableAction } from "./ui/Button";
import { Fragment, useEffect, useMemo, useState } from "react";
import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import useMediaQuery from "@mui/material/useMediaQuery";
import Alert from "@mui/material/Alert";
import { BookOpen, ClipboardList, FileDown, Pencil, Plus, Send, Trash2, Save } from "lucide-react";
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
import { DOCUMENT_UPLOAD_ACCEPT, getDocumentUploadContentType } from "../lib/filePolicy";
import { Input, Select, CheckboxField, Textarea } from "./ui/Field";
import { ErrorState, LoadingState } from "./ui/AsyncState";
import { DataTable } from "./ui/DataTable";
import { DEFAULT_PAGE_SIZE, pageParams, PaginationControls, recoverEmptyPage, type PageState } from "./ui/Pagination";
import { useSessionReadOnly } from "./SessionSwitcher";
import { Modal, FormModal } from "./ui/Modal";
import { PageSection, PageHeader } from "./ui/Layout";
import { ActionMenu } from "./ui/ActionMenu";
import { InlineFilter } from "./ui/InlineFilter";
import { FormStack, FormRow, FormField } from "./ui/FormLayout";
import { styled } from "@mui/material/styles";

const FormActions = styled(Box)(({ theme }) => ({
  display: "flex",
  gap: theme.spacing(1),
  marginBottom: theme.spacing(2),
  flexWrap: "wrap",
}));

const SectionPicker = styled(Paper)(({ theme }) => ({
  border: `1px solid ${theme.palette.divider}`,
  borderRadius: 12,
  padding: theme.spacing(2),
  gridColumn: "1 / -1",
}));

const GradingSetupLayout = styled(Box)(({ theme }) => ({
  display: "flex",
  flexDirection: "column",
  gap: theme.spacing(2),
}));

const GradingPlanHeader = styled(Box)(({ theme }) => ({
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: theme.spacing(2),
  flexWrap: "wrap",
}));

const WeightTotal = styled(Box, {
  shouldForwardProp: (prop) => prop !== "valid",
})<{ valid?: boolean }>(({ theme, valid }) => ({
  padding: theme.spacing(0.5, 1.5),
  borderRadius: 8,
  fontWeight: 600,
  backgroundColor: valid ? theme.palette.leaf.light : theme.palette.rose.light,
  color: valid ? theme.palette.leaf.contrastText : theme.palette.rose.contrastText,
}));

const GradingBuilderSection = styled("section")(({ theme }) => ({
  marginBottom: theme.spacing(2),
}));

const SectionTitleRow = styled(Box)(({ theme }) => ({
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  marginBottom: theme.spacing(1),
}));

const GradingRow = styled(Box)(({ theme }) => ({
  display: "flex",
  gap: theme.spacing(2),
  alignItems: "flex-end",
  marginBottom: theme.spacing(1),
  flexWrap: "wrap",
}));

const GradingBandRow = styled(Box)(({ theme }) => ({
  display: "flex",
  gap: theme.spacing(2),
  alignItems: "flex-end",
  marginBottom: theme.spacing(1),
  flexWrap: "wrap",
}));

const GradingPreview = styled(Typography)(({ theme }) => ({
  marginTop: theme.spacing(1),
  fontStyle: "italic",
  color: theme.palette.text.secondary,
}));

const StyledTableContainer = styled(TableContainer)(({ theme }) => ({
  border: `1px solid ${theme.palette.divider}`,
  borderRadius: 16,
  marginBottom: theme.spacing(2),
}));

const HeaderTableRow = styled(TableRow)(({ theme }) => ({
  "& th": {
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "0.08em",
    fontSize: "0.75rem",
    color: theme.palette.teal.main,
    borderBottom: `2px solid ${theme.palette.divider}`,
    padding: theme.spacing(1.5, 2),
  },
}));

const DataTableRow = styled(TableRow)(({ theme }) => ({
  "& td": {
    padding: theme.spacing(1.5, 2),
    borderColor: theme.palette.divider,
  },
  "&:hover": {
    backgroundColor: theme.palette.action.hover,
  },
}));

const MobileCard = styled(Paper)(({ theme }) => ({
  border: `1px solid ${theme.palette.divider}`,
  borderRadius: 12,
  padding: theme.spacing(2),
  marginBottom: theme.spacing(1.5),
}));

const MobileCardHeader = styled(Box)(({ theme }) => ({
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  marginBottom: theme.spacing(1),
}));

const MobileFields = styled(Box)(({ theme }) => ({
  display: "flex",
  flexDirection: "column",
  gap: theme.spacing(1),
}));

const MobileMetric = styled(Box)(({ theme }) => ({
  display: "flex",
  justifyContent: "space-between",
  padding: theme.spacing(0.5, 0),
}));

const MobileActions = styled(Box)(({ theme }) => ({
  display: "flex",
  gap: theme.spacing(1),
  marginTop: theme.spacing(1),
  paddingTop: theme.spacing(1),
  borderTop: `1px solid ${theme.palette.divider}`,
}));

const TeacherSummary = styled(Box)(({ theme }) => ({
  marginTop: theme.spacing(2),
  padding: theme.spacing(1.5),
  borderRadius: 8,
  border: `1px solid ${theme.palette.divider}`,
}));

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
        if (hasPermission("students.view")) {
          try {
            setStudents(await peopleApi.listStudents());
          } catch {
            setStudents([]);
          }
        } else {
          setStudents([]);
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
      <FormActions>
        {(isTeacher || hasPermission("assignments.create")) && (
          tab === "assignments" ? (
            <PrimaryButton type="button" onClick={() => onTabChange?.("assignments")}>
              <ClipboardList size={16} /> {t("assignmentsTab")}
            </PrimaryButton>
          ) : (
            <SecondaryButton type="button" onClick={() => onTabChange?.("assignments")}>
              <ClipboardList size={16} /> {t("assignmentsTab")}
            </SecondaryButton>
          )
        )}
        {(isTeacher || hasPermission("assessments.marks.enter")) && (
          tab === "grading" ? (
            <PrimaryButton type="button" onClick={() => onTabChange?.("grading")}>
              <BookOpen size={16} /> {t("gradingTab")}
            </PrimaryButton>
          ) : (
            <SecondaryButton type="button" onClick={() => onTabChange?.("grading")}>
              <BookOpen size={16} /> {t("gradingTab")}
            </SecondaryButton>
          )
        )}
        {(hasPermission("grading.schemes.manage") || hasPermission("assessments.exam_types.manage")) && (
          tab === "setup" ? (
            <PrimaryButton type="button" onClick={() => onTabChange?.("setup")}>
              <BookOpen size={16} /> {t("gradingSetupBtn")}
            </PrimaryButton>
          ) : (
            <SecondaryButton type="button" onClick={() => onTabChange?.("setup")}>
              <BookOpen size={16} /> {t("gradingSetupBtn")}
            </SecondaryButton>
          )
        )}
        {(isTeacher || hasPermission("assessments.marks.enter")) && (
          tab === "results" ? (
            <PrimaryButton type="button" onClick={() => onTabChange?.("results")}>
              <Send size={16} /> {t("resultsTab")}
            </PrimaryButton>
          ) : (
            <SecondaryButton type="button" onClick={() => onTabChange?.("results")}>
              <Send size={16} /> {t("resultsTab")}
            </SecondaryButton>
          )
        )}
      </FormActions>
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
        <GradingPlanSetup
          courses={courses}
          classes={classes}
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
  const { confirm } = useDialog();
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [filters, setFilters] = useState(() => {
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
      <InlineFilter filters={[
        { key: "class", type: "select", value: filters.class_id, placeholder: t("allClasses"), options: classes.map((c) => ({ value: c.id, label: c.name })), onChange: (value) => updateFilters({ ...filters, class_id: value, section_id: "" }) },
        { key: "section", type: "select", value: filters.section_id, placeholder: t("allSections"), disabled: !filters.class_id, options: filterSections.map((s) => ({ value: s.id, label: s.name })), onChange: (value) => updateFilters({ ...filters, section_id: value }) },
        { key: "course", type: "select", value: filters.course_id, placeholder: t("allCourses"), options: courses.map((c) => ({ value: c.id, label: c.name })), onChange: (value) => updateFilters({ ...filters, course_id: value }) },
        { key: "category", type: "select", value: filters.category, placeholder: t("allCategories"), options: categories.map((c) => ({ value: c, label: c })), onChange: (value) => updateFilters({ ...filters, category: value }) },
        ...(canPublishAll ? [{ key: "teacher", type: "select" as const, value: filters.created_by_id, placeholder: t("allTeachers"), options: teachers.map((teacher) => ({ value: teacher.id, label: teacher.name })), onChange: (value: string) => updateFilters({ ...filters, created_by_id: value }) }] : []),
        { key: "sort", type: "select", value: filters.sort, options: [
          { value: "due_date", label: t("sortByDueDate") },
          { value: "created_at", label: t("sortByNewest") },
          { value: "title", label: t("sortByTitle") },
          ...(canPublishAll ? [{ value: "teacher", label: t("sortByTeacher") }] : []),
        ], onChange: (value) => updateFilters({ ...filters, sort: value }) },
      ]}>
        {canCreate && (
          <PrimaryButton type="button" onClick={() => setShowCreate((v) => !v)}>
            <Plus size={16} /> {t("createAssignmentBtn")}
          </PrimaryButton>
        )}
      </InlineFilter>

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

      {error && <Alert severity="error" sx={{ mb: 1 }}><Typography>{error}</Typography></Alert>}
      <DataTable<Assignment>
        columns={[
          { header: t("titleCol"), render: (a) => a.title },
          { header: t("categoryCol"), render: (a) => a.category ?? "—" },
          { header: t("classSectionCol"), render: (a) => `${a.class_name ?? "—"}${a.section_name ? ` / ${a.section_name}` : ""}` },
          { header: t("courseCol"), render: (a) => a.course_name ?? "—" },
          { header: t("teacherCol"), render: (a) => a.teacher_name ?? "—" },
          { header: t("dueCol"), render: (a) => new Date(a.due_date).toLocaleDateString() },
          { header: t("actionsCol"), render: (a) => (
            <ActionMenu items={[
              ...(a.attachment_key ? [{
                label: t("downloadBtn"),
                icon: <FileDown size={14} />,
                onClick: async () => {
                    const { url } = await filesApi.presignDownload(a.attachment_key!);
                    window.open(url, "_blank", "noreferrer");
                },
              }] : []),
              { label: t("submissionsBtn"), onClick: () => openSubmissions(a) },
              ...(canCreate ? [{
                label: t("editBtn"),
                icon: <Pencil size={14} />,
                onClick: () => setEditing(a),
              }, {
                label: t("deleteBtn"),
                icon: <Trash2 size={14} />,
                destructive: true,
                onClick: async () => {
                  const wholeBatch = a.batch_id !== null && (await confirm(t("deleteBatchConfirm")));
                  if (a.batch_id === null && !(await confirm(t("deleteConfirm")))) return;
                  try {
                    await assessmentsApi.deleteAssignment(a.id, wholeBatch);
                    await load();
                  } catch (err: any) {
                    setError(err.response?.data?.detail ?? t("failedDelete"));
                  }
                },
              }] : []),
            ]} ariaLabel={`${t("actionsCol")}: ${a.title}`} />
          )},
        ]}
        data={assignments}
        keyExtractor={(a) => a.id}
        renderBeforeRow={(a, index, arr) => (
          filters.sort === "teacher" && (index === 0 || arr[index - 1].teacher_name !== a.teacher_name) ? (
            <Box sx={{ p: 1, bgcolor: "action.hover", fontWeight: 600 }}><strong>{a.teacher_name ?? t("unassignedLabel")}</strong></Box>
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
        <PageSection sx={{ marginTop: 16 }}>
          <Typography variant="h6">{t("submissionsHeading", { title: selected.title })}</Typography>
          <StyledTableContainer>
            <Table size="small">
              <TableHead>
                <HeaderTableRow>
                  <TableCell>{t("studentCol")}</TableCell>
                  <TableCell>{t("submittedCol")}</TableCell>
                  <TableCell>{t("lateCol")}</TableCell>
                  <TableCell>{t("markCol")}</TableCell>
                  <TableCell>{t("actionsCol")}</TableCell>
                </HeaderTableRow>
              </TableHead>
              <TableBody>
                {submissions.length === 0 && (
                  <DataTableRow><TableCell colSpan={5}><Typography color="text.secondary">{t("noSubmissionsYet")}</Typography></TableCell></DataTableRow>
                )}
                {submissions.map((s) => (
                  <SubmissionRow
                    key={s.id}
                    submission={s}
                    studentName={s.student_name ?? students.find((st) => st.id === s.student_id)?.name ?? t("unknownPersonLabel")}
                    onGraded={() => void openSubmissions(selected)}
                  />
                ))}
              </TableBody>
            </Table>
          </StyledTableContainer>
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
  const [form, setForm] = useState({ class_id: "", course_id: "", title: "", category: "", instructions: "", due_date: "", max_marks: "", weightage: "" });
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
            const contentType = getDocumentUploadContentType(attachmentFile);
            if (!contentType) {
              setError(t("unsupportedDocumentFile"));
              return;
            }
            const { object_key, upload_url } = await filesApi.presignUpload({
              category: "assignments", filename: attachmentFile.name, content_type: contentType, size_bytes: attachmentFile.size,
            });
            await fetch(upload_url, { method: "PUT", body: attachmentFile, headers: { "Content-Type": contentType } });
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
            max_marks: form.max_marks ? Number(form.max_marks) : undefined,
            weightage: form.weightage ? Number(form.weightage) : undefined,
            attachment_key,
          });
          onCreated();
        } catch (err: any) {
          setError(err.response?.data?.detail ?? t("failedCreateAssignment"));
        }
      }}
    >
      <FormStack>
        {canPublishAll && (
          <CheckboxField
            checked={allClasses}
            onChange={(e) => {
              setAllClasses(e.target.checked);
              if (e.target.checked) {
                setForm({ ...form, class_id: "" });
                setSectionIds([]);
              }
            }}
            label={t("publishAllClassesLabel")}
          />
        )}
        {allClasses && <Alert severity="info" sx={{ mb: 1 }}><Typography>{t("publishAllClassesHint")}</Typography></Alert>}
        {!allClasses && (
          <FormField label={t("classLabel")}>
            <Select required value={form.class_id} onChange={(e) => setForm({ ...form, class_id: e.target.value })}>
              <option value="">{t("selectEllipsis")}</option>
              {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </FormField>
        )}
        <FormField label={t("courseLabel")}>
          <Select required value={form.course_id} onChange={(e) => setForm({ ...form, course_id: e.target.value })}>
            <option value="">{t("selectEllipsis")}</option>
            {courses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </FormField>
        {!allClasses && sections.length > 0 && (
          <SectionPicker>
            <legend>{t("sectionsLegend")}</legend>
            <Alert severity="info" sx={{ mb: 1 }}><Typography>{t("sectionsHint")}</Typography></Alert>
            {sections.map((s) => (
              <CheckboxField
                key={s.id}
                checked={sectionIds.includes(s.id)}
                onChange={() => toggleSection(s.id)}
                label={s.name}
              />
            ))}
          </SectionPicker>
        )}
        <FormField label={t("titleLabel")}>
          <Input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
        </FormField>
        <FormField label={t("categoryLabel")}>
          <Input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder={t("categoryPlaceholder")} />
        </FormField>
        <FormField label={t("instructionsLabel")}>
          <Input required value={form.instructions} onChange={(e) => setForm({ ...form, instructions: e.target.value })} />
        </FormField>
        <FormRow>
          <FormField label={t("dueDateLabel")}>
            <Input required type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} />
          </FormField>
          <FormField label="Max Marks">
            <Input type="number" step="any" min="0" value={form.max_marks} onChange={(e) => setForm({ ...form, max_marks: e.target.value })} placeholder="e.g. 100" />
          </FormField>
        </FormRow>
        <FormRow>
          <FormField label="Weightage (%)">
            <Input type="number" step="any" min="0" max="100" value={form.weightage} onChange={(e) => setForm({ ...form, weightage: e.target.value })} placeholder="e.g. 20" />
          </FormField>
          <FormField label={t("attachmentLabel")}>
            <Input type="file" accept={DOCUMENT_UPLOAD_ACCEPT} onChange={(e) => setAttachmentFile(e.target.files?.[0] ?? null)} />
          </FormField>
        </FormRow>
      </FormStack>
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
    max_marks: assignment.max_marks?.toString() ?? "",
    weightage: assignment.weightage?.toString() ?? "",
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
            max_marks: form.max_marks ? Number(form.max_marks) : undefined,
            weightage: form.weightage ? Number(form.weightage) : undefined,
            apply_to_batch: form.apply_to_batch,
          });
          onDone();
        } catch (err: any) {
          setError(err.response?.data?.detail ?? t("failedUpdate"));
        }
      }}
    >
      <FormStack>
        <FormField label={t("titleLabel")}>
          <Input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
        </FormField>
        <FormField label={t("categoryLabel")}>
          <Input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
        </FormField>
        <FormField label={t("instructionsLabel")}>
          <Input required value={form.instructions} onChange={(e) => setForm({ ...form, instructions: e.target.value })} />
        </FormField>
        <FormRow>
          <FormField label={t("dueDateLabel")}>
            <Input required type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} />
          </FormField>
          <FormField label="Max Marks">
            <Input type="number" step="any" min="0" value={form.max_marks} onChange={(e) => setForm({ ...form, max_marks: e.target.value })} placeholder="e.g. 100" />
          </FormField>
        </FormRow>
        <FormRow>
          <FormField label="Weightage (%)">
            <Input type="number" step="any" min="0" max="100" value={form.weightage} onChange={(e) => setForm({ ...form, weightage: e.target.value })} placeholder="e.g. 20" />
          </FormField>
          <Box sx={{ display: "flex", alignItems: "center" }}>
            {assignment.batch_id && (
              <CheckboxField
                checked={form.apply_to_batch}
                onChange={(e) => setForm({ ...form, apply_to_batch: e.target.checked })}
                label={t("applyToBatchLabel")}
              />
            )}
          </Box>
        </FormRow>
      </FormStack>
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
  const [feedback, setFeedback] = useState(submission.feedback ?? "");
  return (
    <DataTableRow>
      <TableCell>{studentName}</TableCell>
      <TableCell>{new Date(submission.submitted_at).toLocaleString()}</TableCell>
      <TableCell>{submission.is_late ? t("lateLabel") : t("onTimeLabel")}</TableCell>
      <TableCell>
        <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}>
          <Input placeholder={t("markCol")} value={mark} onChange={(e) => setMark(e.target.value)} />
          <Textarea placeholder={t("feedbackLabel", "Feedback")} rows={2} value={feedback} onChange={(e) => setFeedback(e.target.value)} />
        </Box>
      </TableCell>
      <TableCell>
        <Box sx={{ display: "flex", gap: 0.5 }}>
          <TableAction
            type="button"
            onClick={async () => {
              const { url } = await filesApi.presignDownload(submission.file_key);
              window.open(url, "_blank", "noreferrer");
            }}
          >
            <FileDown size={14} /> {t("downloadBtn")}
          </TableAction>
          <TableAction
            type="button"
            onClick={async () => {
              await assessmentsApi.gradeSubmission(submission.id, { mark: Number(mark), feedback: feedback || undefined });
              onGraded();
            }}
          >
            {t("saveBtn")}
          </TableAction>
        </Box>
      </TableCell>
    </DataTableRow>
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
  const renderCards = useMediaQuery("(max-width: 768px)");

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
      <InlineFilter filters={[
        { key: "class", type: "select", value: classId, placeholder: t("chooseClassEllipsis"), options: classes.map((c) => ({ value: c.id, label: c.name })), onChange: setClassId },
        ...(matrix && section ? [{ key: "course", type: "select" as const, value: courseId, options: section.courses.map((c) => ({ value: c.course_id, label: c.course_name })), onChange: setCourseId }] : []),
      ]} />
      {error && <Alert severity="error" sx={{ mb: 1 }}><Typography>{error}</Typography></Alert>}

      {matrix && (
        <FormActions>
          {matrix.sections.map((s) => (
            s.section_id === sectionId ? (
              <PrimaryButton
                key={s.section_id}
                type="button"
                onClick={() => setSectionId(s.section_id)}
              >
                {s.section_name}
              </PrimaryButton>
            ) : (
              <SecondaryButton
                key={s.section_id}
                type="button"
                onClick={() => setSectionId(s.section_id)}
              >
                {s.section_name}
              </SecondaryButton>
            )
          ))}
        </FormActions>
      )}

      {section && course && (
        <>
          <Alert severity="info" sx={{ mb: 1 }}>
            <Typography>
              {t("gradingContext", {
                course: course.course_name,
                section: section.section_name,
                teacher: course.teacher_name ?? "—",
              })}
            </Typography>
          </Alert>
          {course.exam_types.length === 0 ? (
            <Typography color="text.secondary">{t("noExamTypesForCourse")}</Typography>
          ) : renderCards ? (
            <Box role="list" aria-label={t("gradingTab")}>
              {section.students.map((student) => {
                const cell = student.courses.find((c) => c.course_id === course.course_id);
                return (
                  <MobileCard role="listitem" key={student.student_id}>
                    <MobileCardHeader>
                      <strong>{student.name}</strong>
                      <Typography component="span">{student.admission_number}</Typography>
                    </MobileCardHeader>
                    <MobileFields>
                      {course.exam_types.map((et) => (
                        <Box key={et.id} sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}>
                          <Typography component="span">{et.name} <small>({et.weightage})</small></Typography>
                          <MarkCell
                            examTypeId={et.id}
                            studentId={student.student_id}
                            initial={cell?.marks.find((m) => m.exam_type_id === et.id)?.score ?? null}
                            onSaved={() => void load(classId)}
                          />
                        </Box>
                      ))}
                      <MobileMetric>
                        <Typography component="span">{t("scoreCol")}</Typography>
                        <strong>{cell?.raw_score ?? "—"}</strong>
                      </MobileMetric>
                      <MobileMetric>
                        <Typography component="span">{t("bandCol")}</Typography>
                        <strong>{cell?.band ?? "—"}</strong>
                      </MobileMetric>
                    </MobileFields>
                  </MobileCard>
                );
              })}
            </Box>
          ) : (
            <StyledTableContainer>
              <Table size="small">
                <TableHead>
                  <HeaderTableRow>
                    <TableCell>{t("studentCol")}</TableCell>
                    <TableCell>{t("admissionNoCol")}</TableCell>
                    {course.exam_types.map((et) => (
                      <TableCell key={et.id}>{et.name} <small>({et.weightage})</small></TableCell>
                    ))}
                    <TableCell>{t("scoreCol")}</TableCell>
                    <TableCell>{t("bandCol")}</TableCell>
                  </HeaderTableRow>
                </TableHead>
                <TableBody>
                  {section.students.map((student) => {
                    const cell = student.courses.find((c) => c.course_id === course.course_id);
                    return (
                      <DataTableRow key={student.student_id}>
                        <TableCell>{student.name}</TableCell>
                        <TableCell>{student.admission_number}</TableCell>
                        {course.exam_types.map((et) => (
                          <TableCell key={et.id}>
                            <MarkCell
                              examTypeId={et.id}
                              studentId={student.student_id}
                              initial={cell?.marks.find((m) => m.exam_type_id === et.id)?.score ?? null}
                              onSaved={() => void load(classId)}
                            />
                          </TableCell>
                        ))}
                        <TableCell>{cell?.raw_score ?? "—"}</TableCell>
                        <TableCell>{cell?.band ?? "—"}</TableCell>
                      </DataTableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </StyledTableContainer>
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
  const { t } = useTranslation();
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
    <Box sx={{ display: "flex", gap: 0.5, alignItems: "center" }}>
      <Input
        value={value}
        disabled={saving}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            (e.target as HTMLInputElement).blur();
            void save();
          }
        }}
      />
      {value !== (initial?.toString() ?? "") && (
        <IconButton onClick={() => save()} disabled={saving} type="button" aria-label={t("saveBtn")} title={t("saveBtn")}>
          <Save size={14} />
        </IconButton>
      )}
    </Box>
  );
}

function GradingPlanSetup({
  courses,
  classes,
  canCreateScheme,
  canCreateExamType,
}: Readonly<{ courses: Course[]; classes: AcademicClass[]; canCreateScheme: boolean; canCreateExamType: boolean }>) {
  const { t } = useTranslation();
  const { confirm } = useDialog();
  type EditableBand = { label: string; min_score: string; max_score: string };
  type EditableComponent = { id?: string | null; name: string; weightage: string };
  const defaults: EditableBand[] = [
    { label: "A", min_score: "80", max_score: "100" },
    { label: "B", min_score: "60", max_score: "79.99" },
    { label: "C", min_score: "0", max_score: "59.99" },
  ];
  const [courseId, setCourseId] = useState("");
  const [classId, setClassId] = useState("");
  const [name, setName] = useState("");
  const [assignmentWeight, setAssignmentWeight] = useState("0");
  const [components, setComponents] = useState<EditableComponent[]>([{ name: t("examComponentDefault"), weightage: "100" }]);
  const [bands, setBands] = useState<EditableBand[]>(defaults);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [limitClassId, setLimitClassId] = useState("");
  const [assignmentLimit, setAssignmentLimit] = useState("");

  useEffect(() => {
    if (!courseId) return;
    setIsLoading(true);
    setError("");
    void assessmentsApi.getGradingPlan(courseId, classId || undefined).then((plan) => {
      setName(plan.name);
      setAssignmentWeight(String(plan.assignment_weightage));
      setComponents(plan.components.map((item) => ({ id: item.id, name: item.name, weightage: String(item.weightage) })));
      setBands(plan.bands.map((item) => ({ label: item.label, min_score: String(item.min_score), max_score: String(item.max_score) })));
    }).catch((err: any) => {
      if (err.response?.status === 404) {
        setName(t("gradingPlanDefaultName", { course: courses.find((item) => item.id === courseId)?.name ?? "" }));
        setAssignmentWeight("0");
        setComponents([{ name: t("examComponentDefault"), weightage: "100" }]);
        setBands(defaults);
      } else setError(err.response?.data?.detail ?? t("failedLoadGradingPlan"));
    }).finally(() => setIsLoading(false));
  }, [courseId, classId, courses, t]);

  const totalWeight = Number(assignmentWeight || 0) + components.reduce((sum, item) => sum + Number(item.weightage || 0), 0);
  const canSave = canCreateScheme && canCreateExamType && !!courseId && !!name.trim() && components.length > 0 && Math.abs(totalWeight - 100) < 0.01 && bands.length > 0;
  const previewBand = bands.find((item) => 75 >= Number(item.min_score) && 75 <= Number(item.max_score))?.label ?? "—";

  return (
    <GradingSetupLayout>
      <PageSection>
        <GradingPlanHeader>
          <Box>
            <Typography variant="h6">{t("gradingPlanHeading")}</Typography>
            <Alert severity="info" sx={{ mt: 0.5 }}><Typography>{t("gradingPlanHint")}</Typography></Alert>
          </Box>
          <WeightTotal valid={Math.abs(totalWeight - 100) < 0.01}>{t("totalWeightLabel")}: {totalWeight}%</WeightTotal>
        </GradingPlanHeader>
        <InlineFilter filters={[
          { key: "course", type: "select", label: t("courseLabel"), value: courseId, placeholder: t("selectEllipsis"), options: courses.map((item) => ({ value: item.id, label: item.name })), onChange: setCourseId },
          { key: "class", type: "select", label: t("classOverrideLabel"), value: classId, placeholder: t("courseDefaultOption"), options: classes.map((item) => ({ value: item.id, label: item.name })), onChange: setClassId, disabled: !courseId },
        ]} />
        {isLoading ? <LoadingState /> : <>
          <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5, mb: 1 }}>
            <Typography component="span" sx={{ fontWeight: 600 }}>{t("schemeNameLabel")}</Typography>
            <Input value={name} onChange={(event) => setName(event.target.value)} />
          </Box>
          <GradingBuilderSection>
            <SectionTitleRow>
              <Box>
                <Typography variant="subtitle2">{t("gradeComponentsHeading")}</Typography>
                <Typography>{t("gradeComponentsHint")}</Typography>
              </Box>
              <SecondaryButton type="button" onClick={() => setComponents([...components, { name: "", weightage: "" }])}><Plus size={14} /> {t("addComponentBtn")}</SecondaryButton>
            </SectionTitleRow>
            <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
              {components.map((component, index) => (
                <GradingRow key={component.id ?? index}>
                  <label>{t("componentNameLabel")}<Input required value={component.name} onChange={(event) => setComponents(components.map((item, i) => i === index ? { ...item, name: event.target.value } : item))} /></label>
                  <label>{t("weightageLabel")}<Input required type="number" min="0.01" max="100" step="0.01" value={component.weightage} onChange={(event) => setComponents(components.map((item, i) => i === index ? { ...item, weightage: event.target.value } : item))} /></label>
                  <IconButton color="error" type="button" aria-label={t("removeComponentBtn")} onClick={() => setComponents(components.filter((_, i) => i !== index))}><Trash2 size={14} /></IconButton>
                </GradingRow>
              ))}
              <GradingRow>
                <label>{t("assignmentPoolLabel")}<Input value={t("assignmentsCol")} disabled /></label>
                <label>{t("weightageLabel")}<Input type="number" min="0" max="100" step="0.01" value={assignmentWeight} onChange={(event) => setAssignmentWeight(event.target.value)} /></label>
              </GradingRow>
            </Box>
          </GradingBuilderSection>
          <GradingBuilderSection>
            <SectionTitleRow>
              <Box>
                <Typography variant="subtitle2">{t("gradeBandsHeading")}</Typography>
                <Typography>{t("gradeBandsHint")}</Typography>
              </Box>
              <SecondaryButton type="button" onClick={() => setBands([...bands, { label: "", min_score: "", max_score: "" }])}><Plus size={14} /> {t("addBandBtn")}</SecondaryButton>
            </SectionTitleRow>
            <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
              {bands.map((band, index) => (
                <GradingBandRow key={index}>
                  <label>{t("bandCol")}<Input value={band.label} onChange={(event) => setBands(bands.map((item, i) => i === index ? { ...item, label: event.target.value } : item))} /></label>
                  <label>{t("minimumLabel")}<Input type="number" min="0" max="100" step="0.01" value={band.min_score} onChange={(event) => setBands(bands.map((item, i) => i === index ? { ...item, min_score: event.target.value } : item))} /></label>
                  <label>{t("maximumLabel")}<Input type="number" min="0" max="100" step="0.01" value={band.max_score} onChange={(event) => setBands(bands.map((item, i) => i === index ? { ...item, max_score: event.target.value } : item))} /></label>
                  <IconButton color="error" type="button" aria-label={t("removeBandBtn")} onClick={() => setBands(bands.filter((_, i) => i !== index))}><Trash2 size={14} /></IconButton>
                </GradingBandRow>
              ))}
            </Box>
            <GradingPreview>{t("gradingPreviewLabel", { score: 75, band: previewBand })}</GradingPreview>
          </GradingBuilderSection>
          {error && <Alert severity="error" sx={{ mb: 1 }}><Typography>{error}</Typography></Alert>}
          {notice && <Alert severity="success" sx={{ mb: 1 }}><Typography>{notice}</Typography></Alert>}
          <FormActions>
            <PrimaryButton type="button" disabled={!canSave} loading={isLoading} onClick={async () => { setError(""); setNotice(""); setIsLoading(true); try { await assessmentsApi.saveGradingPlan({ course_id: courseId, class_id: classId || null, name: name.trim(), assignment_weightage: Number(assignmentWeight || 0), components: components.map((item) => ({ id: item.id, name: item.name.trim(), weightage: Number(item.weightage) })), bands: bands.map((item) => ({ label: item.label.trim(), min_score: Number(item.min_score), max_score: Number(item.max_score) })) }); setNotice(t("gradingPlanSaved")); } catch (err: any) { setError(err.response?.data?.detail ?? t("failedSaveGradingPlan")); } finally { setIsLoading(false); } }}><Save size={16} /> {t("saveGradingPlanBtn")}</PrimaryButton>
          </FormActions>
        </>}
      </PageSection>
      {canCreateScheme && (
        <PageSection>
          <Typography variant="h6">{t("assignmentPolicyHeading")}</Typography>
          <Alert severity="info" sx={{ mb: 1 }}><Typography>{t("assignmentPolicyHint")}</Typography></Alert>
          <label>{t("classLabel")}<Select value={limitClassId} onChange={(event) => { setLimitClassId(event.target.value); setAssignmentLimit(String(classes.find((item) => item.id === event.target.value)?.assignment_limit ?? "")); }}><option value="">{t("chooseClassEllipsis")}</option>{classes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</Select></label>
          <label>{t("assignmentLimitLabel")}<Input type="number" min="1" value={assignmentLimit} onChange={(event) => setAssignmentLimit(event.target.value)} /></label>
          <SecondaryButton type="button" disabled={!limitClassId} onClick={async () => { await academicsApi.updateClass(limitClassId, { assignment_limit: assignmentLimit ? Number(assignmentLimit) : null }); setNotice(t("assignmentPolicySaved")); }}><Save size={16} /> {t("saveBtn")}</SecondaryButton>
        </PageSection>
      )}
    </GradingSetupLayout>
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
  const renderCards = useMediaQuery("(max-width: 768px)");

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
      <InlineFilter filters={[
        { key: "class", type: "select", value: classId, placeholder: t("chooseClassEllipsis"), options: classes.map((c) => ({ value: c.id, label: c.name })), onChange: setClassId },
      ]}>
        {matrix && (
          <>
            <SecondaryButton type="button" onClick={() => assessmentsApi.exportResults({ class_id: classId }, "csv")}>
              <FileDown size={16} /> CSV
            </SecondaryButton>
            <SecondaryButton type="button" onClick={() => assessmentsApi.exportResults({ class_id: classId }, "pdf")}>
              <FileDown size={16} /> PDF
            </SecondaryButton>
          </>
        )}
      </InlineFilter>

      {matrix && uniqueCourses.length > 0 && (
        <FormActions>
          <Alert severity="info" sx={{ flex: 1 }}><Typography>{t("toggleColumnsHint")}</Typography></Alert>
          {uniqueCourses.map((c) => (
            <CheckboxField
              key={c.course_id}
              checked={!hiddenCourses.has(c.course_id)}
              onChange={() => toggleCourse(c.course_id)}
              label={c.course_name}
            />
          ))}
        </FormActions>
      )}

      {error && <Alert severity="error" sx={{ mb: 1 }}><Typography>{error}</Typography></Alert>}
      {notice && <Alert severity="success" sx={{ mb: 1 }}><Typography>{notice}</Typography></Alert>}

      {matrix?.sections.map((section) => {
        const visibleCourses = section.courses.filter((c) => !hiddenCourses.has(c.course_id));
        return (
          <PageSection key={section.section_id} sx={{ marginTop: 16 }}>
            <PageHeader title={`${section.class_name} / ${section.section_name}`}>
              {canPublish && (
                <PrimaryButton type="button" onClick={() => publishSection(section)}>
                  <Send size={16} /> {t("publishSectionBtn")}
                </PrimaryButton>
              )}
            </PageHeader>
            {renderCards ? (
              <Box role="list" aria-label={`${section.class_name} / ${section.section_name}`}>
                {section.students.length === 0 && <Typography color="text.secondary">{t("noStudentsInSection")}</Typography>}
                {section.students.map((student) => (
                  <MobileCard role="listitem" key={student.student_id}>
                    <MobileCardHeader>
                      <strong>{student.name}</strong>
                      <Typography component="span">{student.admission_number}</Typography>
                    </MobileCardHeader>
                    <MobileFields>
                      {visibleCourses.map((c) => {
                        const cell = student.courses.find((x) => x.course_id === c.course_id);
                        return (
                          <MobileMetric key={c.course_id}>
                            <Typography component="span">{c.course_name}</Typography>
                            <strong>
                              {cell?.raw_score !== null && cell?.raw_score !== undefined
                                ? `${cell.raw_score}${cell.band ? ` (${cell.band})` : ""}`
                                : "—"}
                            </strong>
                          </MobileMetric>
                        );
                      })}
                      <MobileMetric>
                        <Typography component="span">{t("overallLabel")}</Typography>
                        <strong>{student.overall_score ?? "—"}</strong>
                      </MobileMetric>
                    </MobileFields>
                    <MobileActions aria-label={t("actionsCol")}>
                      <TableAction
                        type="button"
                        aria-label={t("downloadResultCardBtn")}
                        title={t("downloadResultCardBtn")}
                        onClick={() => assessmentsApi.downloadResultCard(student.student_id, matrix.session_id)}
                      >
                        <FileDown size={14} />
                      </TableAction>
                      {canMessage && (
                        <TableAction type="button" aria-label={t("sendToParentsBtn")} title={t("sendToParentsBtn")} onClick={() => sendReport(student.student_id)}>
                          <Send size={14} />
                        </TableAction>
                      )}
                    </MobileActions>
                  </MobileCard>
                ))}
              </Box>
            ) : (
              <StyledTableContainer>
                <Table size="small">
                  <TableHead>
                    <HeaderTableRow>
                      <TableCell>{t("studentCol")}</TableCell>
                      <TableCell>{t("admissionNoCol")}</TableCell>
                      {visibleCourses.map((c) => <TableCell key={c.course_id}>{c.course_name}</TableCell>)}
                      <TableCell>{t("overallLabel")}</TableCell>
                      <TableCell>{t("actionsCol")}</TableCell>
                    </HeaderTableRow>
                  </TableHead>
                  <TableBody>
                    {section.students.length === 0 && (
                      <DataTableRow><TableCell colSpan={visibleCourses.length + 4}><Typography color="text.secondary">{t("noStudentsInSection")}</Typography></TableCell></DataTableRow>
                    )}
                    {section.students.map((student) => (
                      <DataTableRow key={student.student_id}>
                        <TableCell>{student.name}</TableCell>
                        <TableCell>{student.admission_number}</TableCell>
                        {visibleCourses.map((c) => {
                          const cell = student.courses.find((x) => x.course_id === c.course_id);
                          return (
                            <TableCell key={c.course_id}>
                              {cell?.raw_score !== null && cell?.raw_score !== undefined
                                ? `${cell.raw_score}${cell.band ? ` (${cell.band})` : ""}`
                                : "—"}
                            </TableCell>
                          );
                        })}
                        <TableCell><strong>{student.overall_score ?? "—"}</strong></TableCell>
                        <TableCell>
                          <Box sx={{ display: "flex", gap: 0.5 }}>
                            <TableAction
                              type="button"
                              aria-label={t("downloadResultCardBtn")}
                              title={t("downloadResultCardBtn")}
                              onClick={() => assessmentsApi.downloadResultCard(student.student_id, matrix.session_id)}
                            >
                              <FileDown size={14} />
                            </TableAction>
                            {canMessage && (
                              <TableAction type="button" aria-label={t("sendToParentsBtn")} title={t("sendToParentsBtn")} onClick={() => sendReport(student.student_id)}>
                                <Send size={14} />
                              </TableAction>
                            )}
                          </Box>
                        </TableCell>
                      </DataTableRow>
                    ))}
                  </TableBody>
                </Table>
              </StyledTableContainer>
            )}
            <TeacherSummary>
              <strong>{t("courseTeachersHeading")}</strong>
              <ul>
                {section.courses.map((c) => (
                  <li key={c.course_id}>{c.course_name} — {c.teacher_name ?? "—"}</li>
                ))}
              </ul>
            </TeacherSummary>
          </PageSection>
        );
      })}
    </>
  );
}
