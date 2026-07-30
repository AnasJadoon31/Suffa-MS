import { Button, PrimaryButton, SecondaryButton, DangerButton, IconButton, TableAction } from "./ui/Button";
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
import { RolloverWizard } from "./RolloverWizard";
import { Input, Select, CheckboxField } from "./ui/Field";
import { ErrorState, LoadingState } from "./ui/AsyncState";
import { useSessionReadOnly } from "./SessionSwitcher";
import { Modal, FormModal } from "./ui/Modal";
import { PageSection, PageHeader } from "./ui/Layout";
import { InlineFilter } from "./ui/InlineFilter";
import { ActionMenu } from "./ui/ActionMenu";
import { FormStack, FormRow, FormField } from "./ui/FormLayout";
import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";
import Chip from "@mui/material/Chip";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import { styled } from "@mui/material/styles";

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

const TabButton = styled(Button, {
  shouldForwardProp: (prop) => prop !== "active",
})<{ active?: boolean }>(({ theme, active }) => ({
  ...(active && {
    backgroundColor: theme.palette.primary.main,
    color: theme.palette.primary.contrastText,
    "&:hover": {
      backgroundColor: theme.palette.primary.dark,
    },
  }),
}));

const Badge = styled(Chip)(({ theme }) => ({
  backgroundColor: theme.palette.mode === "dark" ? theme.palette.saffron.light : theme.palette.saffron.light,
  color: theme.palette.saffron.contrastText,
  fontWeight: 600,
  fontSize: "0.75rem",
}));

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
  const [pendingDeleteKey, setPendingDeleteKey] = useState<string | null>(null);

  const refreshAll = async () => {
    try {
      const [p, c, s, ac] = await Promise.all([
        academicsApi.listPrograms(),
        academicsApi.listClasses(),
        academicsApi.listSessions(),
        academicsApi.listAllCourses(),
      ]);
      setPrograms(p);
      setClasses(c);
      setSessions(s);
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
  const handleDelete = async (key: string, targetName: string, action: () => Promise<void>) => {
    if (pendingDeleteKey) return;
    if (!(await confirm(t("deleteNamedRecordConfirm", { name: targetName })))) return;
    setPendingDeleteKey(key);
    try {
      await action();
      await refreshAll();
    } catch (e) {
      handleError(e);
    } finally {
      setPendingDeleteKey(null);
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

      <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
          <TabButton
            active={activeTab === "programs"}
            type="button"
            onClick={() => onTabChange?.("programs")}
          >
            {t("programsHeading")}
          </TabButton>
          <TabButton
            active={activeTab === "classes"}
            type="button"
            onClick={() => onTabChange?.("classes")}
          >
            {t("classesHeading")}
          </TabButton>
          <TabButton
            active={activeTab === "courses"}
            type="button"
            onClick={() => onTabChange?.("courses")}
          >
            {t("coursesHeading")}
          </TabButton>
          <TabButton
            active={activeTab === "sessions"}
            type="button"
            onClick={() => onTabChange?.("sessions")}
          >
            {t("sessionsHeading")}
          </TabButton>
        </Box>

        <Box>
          {isLoading && <LoadingState />}
          {!isLoading && loadError && <ErrorState message={loadError} />}
          {!isLoading && !loadError && activeTab === "programs" && (
            <>
              <Typography variant="h6" sx={{ mb: 1 }}>{t("programsHeading")}</Typography>
              <PrimaryButton type="button" onClick={() => setCreateModal("program")}><Plus size={16} /> {t("addProgramBtn")}</PrimaryButton>
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
                            <FormStack>
                              <FormField label={t("programNameLabel")}>
                                <Input required value={programName} onChange={(e) => setProgramName(e.target.value)} placeholder={t("programExample")} />
                              </FormField>
                            </FormStack>
                          </FormModal>}
              <StyledTableContainer>
                <Table size="small">
                  <TableHead>
                    <HeaderTableRow>
                      <TableCell>{t("nameLabel")}</TableCell>
                      <TableCell>{t("actionsCol")}</TableCell>
                    </HeaderTableRow>
                  </TableHead>
                  <TableBody>
                    {programs.length === 0 && (
                      <DataTableRow><TableCell colSpan={2}><Typography color="text.secondary">{t("noProgramsYet")}</Typography></TableCell></DataTableRow>
                    )}
                    {programs.map((p) => (
                      <DataTableRow key={p.id}>
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
                        <TableCell>{p.name}</TableCell>
                        <TableCell>
                          <Box sx={{ display: "flex", gap: 0.5 }}>
                            <ActionMenu ariaLabel={`${t("actionsCol")}: ${p.name}`} items={[
                              { label: t("editBtn"), icon: <Edit2 size={14} />, onClick: () => setEditingProgram(p) },
                              { label: t("deleteBtn"), icon: <Trash2 size={14} />, destructive: true, disabled: pendingDeleteKey === `program:${p.id}`, onClick: () => handleDelete(`program:${p.id}`, p.name, () => academicsApi.deleteProgram(p.id)) },
                            ]} />
                          </Box>
                        </TableCell>
                      </DataTableRow>
                    ))}
                  </TableBody>
                </Table>
              </StyledTableContainer>
            </>
          )}

          {!isLoading && !loadError && activeTab === "classes" && (
            <>
              <Typography variant="h6" sx={{ mb: 1 }}>{t("classesHeading")}</Typography>
              <PrimaryButton type="button" onClick={() => setCreateModal("class")}><Plus size={16} /> {t("addClassBtn")}</PrimaryButton>
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
                            <FormStack>
                              <FormField label={t("programLabel")}>
                                <Select required value={classProgramId} onChange={(e) => setClassProgramId(e.target.value)}>
                                  <option value="">{t("selectEllipsis")}</option>
                                  {programs.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                                </Select>
                              </FormField>
                              <FormField label={t("classNameLabel")}>
                                <Input required value={className} onChange={(e) => setClassName(e.target.value)} placeholder={t("classExample")} />
                              </FormField>
                              <CheckboxField
                                title={t("classPortalEnabledHint") ?? ""}
                                checked={classPortalEnabled}
                                onChange={(e) => setClassPortalEnabled(e.target.checked)}
                                label={t("classPortalEnabledLabel")}
                              />
                            </FormStack>
                          </FormModal>}
              <InlineFilter filters={[
                { key: "class-search", type: "input", inputType: "search", ariaLabel: t("searchLabel"), placeholder: t("searchClassesPlaceholder"), value: classSearch, onChange: setClassSearch },
                { key: "program", type: "select", ariaLabel: t("programLabel"), placeholder: t("allPrograms"), value: classFilterProgram, options: programs.map((p) => ({ value: p.id, label: p.name })), onChange: setClassFilterProgram },
                { key: "sort", type: "select", ariaLabel: t("sortByNameLabel"), value: classSortBy, options: [
                  { value: "name", label: t("sortByNameLabel") },
                  { value: "program", label: t("sortByProgramLabel") },
                ], onChange: (value) => setClassSortBy(value as "name" | "program") },
              ]} />
              <StyledTableContainer>
                <Table size="small">
                  <TableHead>
                    <HeaderTableRow>
                      <TableCell>{t("nameLabel")}</TableCell>
                      <TableCell>{t("programLabel")}</TableCell>
                      <TableCell>{t("portalCol")}</TableCell>
                      <TableCell>{t("actionsCol")}</TableCell>
                    </HeaderTableRow>
                  </TableHead>
                  <TableBody>
                    {classesToShow.length === 0 && (
                      <DataTableRow><TableCell colSpan={4}><Typography color="text.secondary">{t("noClassesYet")}</Typography></TableCell></DataTableRow>
                    )}
                    {classesToShow.map((c) => (
                      <DataTableRow key={c.id}>
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
                            <CheckboxField
                              title={t("classPortalEnabledHint") ?? ""}
                              checked={editingClass.default_portal_enabled}
                              onChange={(e) => setEditingClass({ ...editingClass, default_portal_enabled: e.target.checked })}
                              label={t("classPortalEnabledLabel")}
                            />
                          </FormModal>
                        )}
                        <TableCell>{c.name}</TableCell>
                        <TableCell>{programs.find((p) => p.id === c.program_id)?.name ?? "—"}</TableCell>
                        <TableCell>{c.default_portal_enabled ? t("yesLabel") : t("noLabel")}</TableCell>
                        <TableCell>
                          <Box sx={{ display: "flex", gap: 0.5 }}>
                            <ActionMenu ariaLabel={`${t("actionsCol")}: ${c.name}`} items={[
                              { label: t("editBtn"), icon: <Edit2 size={14} />, onClick: () => setEditingClass(c) },
                              { label: t("deleteBtn"), icon: <Trash2 size={14} />, destructive: true, disabled: pendingDeleteKey === `class:${c.id}`, onClick: () => handleDelete(`class:${c.id}`, c.name, () => academicsApi.deleteClass(c.id)) },
                            ]} />
                          </Box>
                        </TableCell>
                      </DataTableRow>
                    ))}
                  </TableBody>
                </Table>
              </StyledTableContainer>
            </>
          )}

          {!isLoading && !loadError && activeTab === "courses" && (
            <>
              <Typography variant="h6" sx={{ mb: 1 }}>{t("coursesHeading")}</Typography>
              <PrimaryButton type="button" onClick={() => setCreateModal("course")}><Plus size={16} /> {t("addCourseBtn")}</PrimaryButton>
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
                            <FormStack>
                              <FormField label={t("courseNameLabel")}>
                                <Input required value={courseName} onChange={(e) => setCourseName(e.target.value)} placeholder={t("courseExample")} />
                              </FormField>
                            </FormStack>
                          </FormModal>}
              <StyledTableContainer>
                <Table size="small">
                  <TableHead>
                    <HeaderTableRow>
                      <TableCell>{t("nameLabel")}</TableCell>
                      <TableCell>{t("actionsCol")}</TableCell>
                    </HeaderTableRow>
                  </TableHead>
                  <TableBody>
                    {allCourses.length === 0 && (
                      <DataTableRow><TableCell colSpan={2}><Typography color="text.secondary">{t("noCoursesYet")}</Typography></TableCell></DataTableRow>
                    )}
                    {allCourses.map((c) => (
                      <DataTableRow key={c.id}>
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
                        <TableCell>{c.name}</TableCell>
                        <TableCell>
                          <Box sx={{ display: "flex", gap: 0.5 }}>
                            <ActionMenu ariaLabel={`${t("actionsCol")}: ${c.name}`} items={[
                              { label: t("editBtn"), icon: <Edit2 size={14} />, onClick: () => setEditingCourse(c) },
                              { label: t("deleteBtn"), icon: <Trash2 size={14} />, destructive: true, disabled: pendingDeleteKey === `course:${c.id}`, onClick: () => handleDelete(`course:${c.id}`, c.name, () => academicsApi.deleteCourse(c.id)) },
                            ]} />
                          </Box>
                        </TableCell>
                      </DataTableRow>
                    ))}
                  </TableBody>
                </Table>
              </StyledTableContainer>
            </>
          )}

          {!isLoading && !loadError && activeTab === "classes" && (
            <>
              <Typography variant="h6" sx={{ mt: 3, mb: 1 }}>{t("sectionsCoursesHeading")}</Typography>
              <PrimaryButton type="button" onClick={() => setCreateModal("section")}><Plus size={16} /> {t("addSectionBtn")}</PrimaryButton>
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
                            <FormStack>
                              <FormField label={t("classLabel")}>
                                <Select required value={sectionClassId} onChange={(e) => setSectionClassId(e.target.value)}>
                                  <option value="">{t("selectEllipsis")}</option>
                                  {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                                </Select>
                              </FormField>
                              <FormField label={t("sectionNameLabel")}>
                                <Input required value={sectionName} onChange={(e) => setSectionName(e.target.value)} placeholder={t("sectionExample")} />
                              </FormField>
                            </FormStack>
                          </FormModal>}
              <InlineFilter filters={[
                { key: "mapping-search", type: "input", inputType: "search", ariaLabel: t("searchLabel"), placeholder: t("searchClassesPlaceholder"), value: courseMapSearch, onChange: setCourseMapSearch },
                { key: "mapping-class", type: "select", ariaLabel: t("classLabel"), placeholder: t("filterByClassLabel"), value: courseMapFilterClass, options: classes.map((c) => ({ value: c.id, label: c.name })), onChange: setCourseMapFilterClass },
              ]} />
              <StyledTableContainer>
                <Table size="small">
                  <TableHead>
                    <HeaderTableRow>
                      <TableCell>{t("classLabel")}</TableCell>
                      <TableCell>{t("sectionsCol")}</TableCell>
                      <TableCell>{t("coursesCol")}</TableCell>
                    </HeaderTableRow>
                  </TableHead>
                  <TableBody>
                    {classesForCourseMap.length === 0 && (
                      <DataTableRow><TableCell colSpan={3}><Typography color="text.secondary">{t("noClassesYet")}</Typography></TableCell></DataTableRow>
                    )}
                    {classesForCourseMap.map((c) => (
                      <DataTableRow key={c.id}>
                        <TableCell sx={{ verticalAlign: "top" }}><strong>{c.name}</strong></TableCell>
                        <TableCell>
                          <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
                            {(sections[c.id] ?? []).map((s) => (
                              <Box key={s.id} sx={{ display: "flex", alignItems: "center", gap: 1 }}>
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
                                <Typography component="span">{s.name}</Typography>
                                <Box sx={{ ml: "auto", display: "flex", gap: 0.5 }}>
                                  <ActionMenu ariaLabel={`${t("actionsCol")}: ${s.name}`} items={[
                                    { label: t("editBtn"), icon: <Edit2 size={14} />, onClick: () => setEditingSection(s) },
                                    { label: t("deleteBtn"), icon: <Trash2 size={14} />, destructive: true, disabled: pendingDeleteKey === `section:${s.id}`, onClick: () => handleDelete(`section:${s.id}`, `${c.name} / ${s.name}`, () => academicsApi.deleteSection(c.id, s.id)) },
                                  ]} />
                                </Box>
                              </Box>
                            ))}
                            {!(sections[c.id]?.length > 0) && <Typography component="span">—</Typography>}
                          </Box>
                        </TableCell>
                        <TableCell>
                          <Box sx={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 1 }}>
                            <Badge size="small" label={t("coursesCountLabel", { count: (courses[c.id] ?? []).length })} />
                            <TableAction
                              type="button"
                              onClick={() => setCourseMapModalClassId(c.id)}
                            >
                              {t("manageCoursesBtn")}
                            </TableAction>
                          </Box>
                        </TableCell>
                      </DataTableRow>
                    ))}
                  </TableBody>
                </Table>
              </StyledTableContainer>
            </>
          )}

          {!isLoading && !loadError && activeTab === "sessions" && (
            <>
              <Typography variant="h6" sx={{ mb: 1 }}>{t("sessionsHeading")}</Typography>
              <PrimaryButton type="button" onClick={() => setCreateModal("session")}><Plus size={16} /> {t("addSessionBtn")}</PrimaryButton>
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
                            <FormStack>
                              <FormField label={t("nameLabel")}>
                                <Input required value={sessionForm.name} onChange={(e) => setSessionForm({ ...sessionForm, name: e.target.value })} placeholder="2026" />
                              </FormField>
                              <FormRow>
                                <FormField label={t("startLabel")}>
                                  <Input required type="date" value={sessionForm.gregorian_start} onChange={(e) => setSessionForm({ ...sessionForm, gregorian_start: e.target.value })} />
                                </FormField>
                                <FormField label={t("endLabel")}>
                                  <Input required type="date" value={sessionForm.gregorian_end} onChange={(e) => setSessionForm({ ...sessionForm, gregorian_end: e.target.value })} />
                                </FormField>
                              </FormRow>
                              <FormField label={t("hijriSpanLabel")}>
                                <Input required value={sessionForm.hijri_span} onChange={(e) => setSessionForm({ ...sessionForm, hijri_span: e.target.value })} placeholder="1447-1448" />
                              </FormField>
                            </FormStack>
                          </FormModal>}
              <StyledTableContainer>
                <Table size="small">
                  <TableHead>
                    <HeaderTableRow>
                      <TableCell>{t("nameLabel")}</TableCell>
                      <TableCell>{t("spanCol")}</TableCell>
                      <TableCell>{t("activeCol")}</TableCell>
                      <TableCell>{t("actionsCol")}</TableCell>
                    </HeaderTableRow>
                  </TableHead>
                  <TableBody>
                    {sessions.length === 0 && (
                      <DataTableRow><TableCell colSpan={4}><Typography color="text.secondary">{t("noSessionsYet")}</Typography></TableCell></DataTableRow>
                    )}
                    {sessions.map((s) => (
                      <DataTableRow key={s.id}>
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
                        <TableCell>{s.name}</TableCell>
                        <TableCell>{s.gregorian_start} → {s.gregorian_end}</TableCell>
                        <TableCell>{s.is_active ? <CheckCircle2 size={16} color={s.is_active ? "inherit" : "inherit"} /> : "—"}</TableCell>
                        <TableCell>
                          <Box sx={{ display: "flex", gap: 1 }}>
                            <ActionMenu ariaLabel={`${t("actionsCol")}: ${s.name}`} items={[
                              ...(!s.is_active ? [{
                                label: t("activateBtn"),
                                onClick: async () => { await academicsApi.activateSession(s.id); await refreshAll(); },
                              }] : [{
                                label: "Year-End Rollover",
                                onClick: () => setRolloverSourceSession(s),
                              }]),
                              { label: t("editBtn"), icon: <Edit2 size={14} />, onClick: () => setEditingSession(s) },
                              ...(!s.is_active ? [{
                                label: t("deleteBtn"),
                                icon: <Trash2 size={14} />,
                                destructive: true,
                                disabled: pendingDeleteKey === `session:${s.id}`,
                                onClick: () => handleDelete(`session:${s.id}`, s.name, () => academicsApi.deleteSession(s.id)),
                              }] : []),
                            ]} />
                          </Box>
                        </TableCell>
                      </DataTableRow>
                    ))}
                  </TableBody>
                </Table>
              </StyledTableContainer>
            </>
          )}

          {/* Teacher assignments are managed on the Timetable screen (§4). */}
        </Box>
      </Box>
      
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
              const course = allCourses.find((item) => item.id === courseId);
              const targetName = `${cls.name} / ${course?.name ?? t("courseLabel")}`;
              if (!(await confirm(t("deleteNamedRecordConfirm", { name: targetName })))) return;
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
 * available picker in a shared MUI-backed modal, replacing the cramped inline
 * courses column.
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
    <Modal title={t("manageCoursesTitle", { class: cls.name })} onClose={onClose} maxWidth={680}>
        <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 2 }}>
          <Box>
            <Typography variant="subtitle2" sx={{ mb: 1 }}>{t("assignedCoursesLabel")}</Typography>
            <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
              {assignedCourses.length === 0 && <Typography color="text.secondary">{t("noCoursesAssignedYet")}</Typography>}
              {assignedCourses.map((co) => (
                <Box key={co.id} sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", p: 1, border: 1, borderColor: "divider", borderRadius: 1 }}>
                  <Typography component="span">{co.name}</Typography>
                  <IconButton aria-label={t("unassignBtn")} title={t("unassignBtn")} type="button" onClick={() => onUnassign(co.id)}>
                    <Trash2 size={14} />
                  </IconButton>
                </Box>
              ))}
            </Box>
          </Box>
          <Box>
            <Typography variant="subtitle2" sx={{ mb: 1 }}>{t("availableCoursesLabel")}</Typography>
            <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
              {available.length === 0 && <Typography color="text.secondary">{t("noCoursesAvailableLabel")}</Typography>}
              {available.map((co) => (
                <Box key={co.id} sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", p: 1, border: 1, borderColor: "divider", borderRadius: 1 }}>
                  <Typography component="span">{co.name}</Typography>
                  <IconButton aria-label={t("assignCourseBtn")} title={t("assignCourseBtn")} type="button" onClick={() => onAssign(co.id)}>
                    <Plus size={14} />
                  </IconButton>
                </Box>
              ))}
            </Box>
          </Box>
        </Box>
    </Modal>
  );
}
