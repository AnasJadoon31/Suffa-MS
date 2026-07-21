import { Button } from "./ui/Button";
import { Fragment, useEffect, useMemo, useState } from "react";
import { FileDown, LayoutGrid, List, Plus, Trash2, Upload, Users } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useDialog } from "../lib/DialogContext";

import {
  academicsApi,
  operationsApi,
  peopleApi,
  type AcademicClass,
  type Course,
  type Section,
  type Teacher,
  type TimetableImportResponse,
  type TimetableImportRow,
  type TimetableSlot,
} from "../lib/endpoints";
import { useAuth } from "../lib/AuthContext";
import { Input, Select } from "./ui/Field";
import { ErrorState, LoadingState } from "./ui/AsyncState";
import { DataTable } from "./ui/DataTable";
import { useSessionReadOnly } from "./SessionSwitcher";
import { Modal, FormModal } from "./ui/Modal";
import { PageSection, PageHeader } from "./ui/Layout";

const DAY_KEYS = ["dayMon", "dayTue", "dayWed", "dayThu", "dayFri", "daySat", "daySun"] as const;

export type TimetableMode = "grid" | "list" | "teachers" | "import";

export function TimetableView({ mode = "grid", onModeChange }: Readonly<{ mode?: TimetableMode; onModeChange?: (mode: TimetableMode) => void }>) {
  const { t } = useTranslation();
  const { alert, confirm } = useDialog();
  const { hasPermission, user } = useAuth();
  const readOnly = useSessionReadOnly();
  const canManage = !readOnly && hasPermission("timetable.manage");
  const isTeacher = user?.role === "teacher";

  const [slots, setSlots] = useState<TimetableSlot[]>([]);
  const [classes, setClasses] = useState<AcademicClass[]>([]);
  const [sections, setSections] = useState<Record<string, Section[]>>({});
  const [courses, setCourses] = useState<Record<string, Course[]>>({});
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  // Teachers get the grid of their own sections only (audit: Teacher-4).
  const viewMode = mode;
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const load = async () => setSlots(await (isTeacher ? operationsApi.listMyTimetable() : operationsApi.listTimetable()));

  useEffect(() => {
    void (async () => {
      setIsLoading(true);
      setLoadError("");
      try {
        await load();
        const c = await academicsApi.listClasses();
        setClasses(c);
        const secByClass: Record<string, Section[]> = {};
        const courseByClass: Record<string, Course[]> = {};
        for (const cls of c) {
          secByClass[cls.id] = await academicsApi.listSections(cls.id);
          courseByClass[cls.id] = await academicsApi.listCourses(cls.id);
        }
        setSections(secByClass);
        setCourses(courseByClass);
        if (!isTeacher) setTeachers(await peopleApi.listTeachers());
      } catch (err: any) {
        setLoadError(err.response?.data?.detail ?? t("failedLoadTimetable"));
      } finally {
        setIsLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const visibleSlots = slots;

  return (
    <PageSection>
      <PageHeader title={t("timetable")} notice={t("descTimetable")} />

      <div className="formActions" style={{ marginBottom: 16 }}>
        <Button className={viewMode === "grid" ? "primaryAction" : "secondaryAction"} type="button" onClick={() => onModeChange?.("grid")}>
          <LayoutGrid size={16} /> {t("weeklyGridTab")}
        </Button>
        {!isTeacher && (
          <Button className={viewMode === "list" ? "primaryAction" : "secondaryAction"} type="button" onClick={() => onModeChange?.("list")}>
            <List size={16} /> {t("listTab")}
          </Button>
        )}
        {!isTeacher && (
          <Button className={viewMode === "teachers" ? "primaryAction" : "secondaryAction"} type="button" onClick={() => onModeChange?.("teachers")}>
            <Users size={16} /> {t("byTeacherTab")}
          </Button>
        )}
        {canManage && (
          <Button className={viewMode === "import" ? "primaryAction" : "secondaryAction"} type="button" onClick={() => onModeChange?.("import")}>
            <Upload size={16} /> {t("importTab")}
          </Button>
        )}
        {canManage && (
          <Button className="secondaryAction" type="button" onClick={() => void operationsApi.exportTimetablePdf()}>
            <FileDown size={16} /> {t("exportTimetablePdfBtn")}
          </Button>
        )}
      </div>

      {isLoading && <LoadingState />}
      {!isLoading && loadError && <ErrorState message={loadError} />}

      {!isLoading && !loadError && (
        <>
          {error && <p className="notice" style={{ color: "var(--rose)" }}>{error}</p>}

          {viewMode === "grid" && (
            <GridView slots={visibleSlots} classes={classes} sections={sections} lockToOwn={isTeacher} />
          )}
          {viewMode === "list" && !isTeacher && (
            <ListView
              slots={slots}
              classes={classes}
              sections={sections}
              courses={courses}
              teachers={teachers}
              canManage={canManage}
              onChanged={() => void load()}
              onError={setError}
            />
          )}
          {viewMode === "teachers" && !isTeacher && <ByTeacherView slots={slots} />}
          {viewMode === "import" && canManage && <ImportView onDone={() => void load()} />}
        </>
      )}
    </PageSection>
  );
}

// ---------------------------------------------------------------- Weekly grid

function GridView({
  slots,
  classes,
  sections,
  lockToOwn,
}: Readonly<{
  slots: TimetableSlot[];
  classes: AcademicClass[];
  sections: Record<string, Section[]>;
  lockToOwn: boolean;
}>) {
  const { t } = useTranslation();
  const [classId, setClassId] = useState("");
  const [sectionId, setSectionId] = useState("");

  // Teachers: pick from only the class/sections they actually teach.
  const teachableSectionIds = useMemo(() => new Set(slots.map((s) => s.section_id)), [slots]);
  const pickableClasses = lockToOwn
    ? classes.filter((c) => (sections[c.id] ?? []).some((s) => teachableSectionIds.has(s.id)))
    : classes;
  const pickableSections = (sections[classId] ?? []).filter((s) => !lockToOwn || teachableSectionIds.has(s.id));

  const gridSlots = useMemo(
    () => slots.filter((s) => s.class_id === classId && s.section_id === sectionId),
    [slots, classId, sectionId]
  );
  const gridPeriods = useMemo(
    () => Array.from(new Set(gridSlots.map((s) => s.period))).sort((a, b) => a - b),
    [gridSlots]
  );

  return (
    <section className="timetableGridSection">
      <div className="filterBar">
        <Select value={classId} onChange={(e) => { setClassId(e.target.value); setSectionId(""); }}>
          <option value="">{t("chooseClassEllipsis")}</option>
          {pickableClasses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
        <Select value={sectionId} onChange={(e) => setSectionId(e.target.value)} disabled={!classId}>
          <option value="">{t("allSections")}</option>
          {pickableSections.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </Select>
      </div>

      {!classId || !sectionId ? (
        <p className="emptyState">{t("pickClassSectionPrompt")}</p>
      ) : gridPeriods.length === 0 ? (
        <p className="emptyState">{t("noSlotsForSection")}</p>
      ) : (
        <div className="timetableGrid" style={{ gridTemplateColumns: `auto repeat(${DAY_KEYS.length}, 1fr)` }}>
          <div className="timetableGridCell timetableGridCorner" />
          {DAY_KEYS.map((day) => (
            <div className="timetableGridCell timetableGridHeader" key={day}>{t(day)}</div>
          ))}
          {gridPeriods.map((period) => {
            const timeForPeriod = gridSlots.find((s) => s.period === period);
            return (
              <Fragment key={period}>
                <div className="timetableGridCell timetableGridHeader">
                  <strong>{t("periodLabel", { period })}</strong>
                  {timeForPeriod && <small>{timeForPeriod.start_time}–{timeForPeriod.end_time}</small>}
                </div>
                {DAY_KEYS.map((_, dayIndex) => {
                  const slot = gridSlots.find((s) => s.day_of_week === dayIndex && s.period === period);
                  return (
                    <div className="timetableGridCell" key={`${period}-${dayIndex}`}>
                      {slot ? (
                        <>
                          <strong>{slot.course_name ?? "—"}</strong>
                          <small>{slot.teacher_name ?? "—"}</small>
                        </>
                      ) : (
                        <span className="timetableGridEmpty">—</span>
                      )}
                    </div>
                  );
                })}
              </Fragment>
            );
          })}
        </div>
      )}
    </section>
  );
}

// ----------------------------------------------------------------------- List

function ListView({
  slots,
  classes,
  sections,
  courses,
  teachers,
  canManage,
  onChanged,
  onError,
}: Readonly<{
  slots: TimetableSlot[];
  classes: AcademicClass[];
  sections: Record<string, Section[]>;
  courses: Record<string, Course[]>;
  teachers: Teacher[];
  canManage: boolean;
  onChanged: () => void;
  onError: (message: string) => void;
}>) {
  const { t } = useTranslation();
  const [filters, setFilters] = useState({ class_id: "", section_id: "", course_id: "", teacher_id: "", day: "" });
  const [form, setForm] = useState({
    class_id: "", section_id: "", course_id: "", teacher_id: "", day_of_week: "0", start_time: "", end_time: "",
  });
  const [showCreate, setShowCreate] = useState(false);

  const allCourses = useMemo(() => {
    const unique = new Map(Object.values(courses).flat().map((c) => [c.id, c]));
    return [...unique.values()];
  }, [courses]);

  const filtered = slots.filter(
    (s) =>
      (!filters.class_id || s.class_id === filters.class_id) &&
      (!filters.section_id || s.section_id === filters.section_id) &&
      (!filters.course_id || s.course_id === filters.course_id) &&
      (!filters.teacher_id || s.teacher_id === filters.teacher_id) &&
      (filters.day === "" || s.day_of_week === Number(filters.day))
  );

  return (
    <>
      {canManage && <Button className="primaryAction" type="button" onClick={() => setShowCreate(true)}><Plus size={16} /> {t("addSlotBtn")}</Button>}
      {canManage && showCreate && (
        <FormModal
                title={t("addSlotBtn")} onClose={() => setShowCreate(false)}
                onSubmit={async (e) => {
                          e.preventDefault();
                          onError("");
                          const { class_id, section_id, course_id, teacher_id, day_of_week, start_time, end_time } = form;
                          if (!class_id || !section_id || !course_id || !teacher_id || !start_time || !end_time) return;
                          try {
                            // Period auto-derived server-side from the start time (§4).
                            await operationsApi.createTimetableSlot({
                              class_id, section_id, course_id, teacher_id,
                              day_of_week: Number(day_of_week), start_time, end_time,
                            });
                            setForm({ ...form, start_time: "", end_time: "" });
                            setShowCreate(false);
                            onChanged();
                          } catch (err: any) {
                            onError(err.response?.data?.detail ?? t("failedCreateSlot"));
                          }
                        }}
                submitLabel={t("addSlotBtn")}
                submitIcon={<Plus size={16} />}
              >
                <label>
                          {t("classLabel")}
                          <Select required value={form.class_id} onChange={(e) => setForm({ ...form, class_id: e.target.value, section_id: "", course_id: "" })}>
                            <option value="">{t("selectEllipsis")}</option>
                            {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                          </Select>
                        </label>

              <label>
                          {t("sectionLabel")}
                          <Select required value={form.section_id} onChange={(e) => setForm({ ...form, section_id: e.target.value })}>
                            <option value="">{t("selectEllipsis")}</option>
                            {(sections[form.class_id] ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                          </Select>
                        </label>

              <label>
                          {t("courseLabel")}
                          <Select required value={form.course_id} onChange={(e) => setForm({ ...form, course_id: e.target.value })}>
                            <option value="">{t("selectEllipsis")}</option>
                            {(courses[form.class_id] ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                          </Select>
                        </label>

              <label>
                          {t("teacherLabel")}
                          <Select required value={form.teacher_id} onChange={(e) => setForm({ ...form, teacher_id: e.target.value })}>
                            <option value="">{t("selectEllipsis")}</option>
                            {teachers.map((teacher) => <option key={teacher.id} value={teacher.id}>{teacher.name}</option>)}
                          </Select>
                        </label>

              <label>
                          {t("dayLabel")}
                          <Select value={form.day_of_week} onChange={(e) => setForm({ ...form, day_of_week: e.target.value })}>
                            {DAY_KEYS.map((d, i) => <option key={d} value={i}>{t(d)}</option>)}
                          </Select>
                        </label>

              <label>
                          {t("startTimeLabel")}
                          <Input required type="time" value={form.start_time} onChange={(e) => setForm({ ...form, start_time: e.target.value })} />
                        </label>

              <label>
                          {t("endTimeLabel")}
                          <Input required type="time" value={form.end_time} onChange={(e) => setForm({ ...form, end_time: e.target.value })} />
                        </label>
              </FormModal>
      )}

      <div className="filterBar">
        <Select value={filters.class_id} onChange={(e) => setFilters({ ...filters, class_id: e.target.value, section_id: "" })}>
          <option value="">{t("allClasses")}</option>
          {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
        <Select value={filters.section_id} onChange={(e) => setFilters({ ...filters, section_id: e.target.value })} disabled={!filters.class_id}>
          <option value="">{t("allSections")}</option>
          {(sections[filters.class_id] ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </Select>
        <Select value={filters.course_id} onChange={(e) => setFilters({ ...filters, course_id: e.target.value })}>
          <option value="">{t("allCourses")}</option>
          {allCourses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
        <Select value={filters.teacher_id} onChange={(e) => setFilters({ ...filters, teacher_id: e.target.value })}>
          <option value="">{t("allTeachers")}</option>
          {teachers.map((teacher) => <option key={teacher.id} value={teacher.id}>{teacher.name}</option>)}
        </Select>
        <Select value={filters.day} onChange={(e) => setFilters({ ...filters, day: e.target.value })}>
          <option value="">{t("allDays")}</option>
          {DAY_KEYS.map((d, i) => <option key={d} value={i}>{t(d)}</option>)}
        </Select>
      </div>

      <DataTable<TimetableSlot>
        columns={[
          { header: t("dayLabel"), render: (s) => t(DAY_KEYS[s.day_of_week]) },
          { header: t("periodCol"), render: (s) => s.period },
          { header: t("timeCol"), render: (s) => `${s.start_time}–${s.end_time}` },
          { header: t("classSectionCol"), render: (s) => `${s.class_name ?? "—"} / ${s.section_name ?? "—"}` },
          { header: t("courseCol"), render: (s) => s.course_name ?? "—" },
          { header: t("teacherCol"), render: (s) => s.teacher_name ?? "—" },
          { header: t("actionsCol"), render: (s) => (
            canManage ? (
              <Button
                className="tableAction"
                type="button"
                onClick={async () => {
                  if (!(await confirm(t("deleteSlotConfirm")))) return;
                  onError("");
                  try {
                    await operationsApi.deleteTimetableSlot(s.id);
                    onChanged();
                  } catch (err: any) {
                    onError(err.response?.data?.detail ?? t("failedDeleteSlot"));
                  }
                }}
              >
                <Trash2 size={14} />
              </Button>
            ) : null
          )},
        ]}
        data={filtered}
        keyExtractor={(s) => s.id}
        emptyMessage={t("noSlotsYet")}
      />
    </>
  );
}

// ------------------------------------------------- Who teaches what (B7-j)

function ByTeacherView({ slots }: Readonly<{ slots: TimetableSlot[] }>) {
  const { t } = useTranslation();

  const byTeacher = useMemo(() => {
    const grouped = new Map<string, { teacher: string; pairs: Map<string, { course: string; klass: string; section: string }> }>();
    for (const slot of slots) {
      const teacher = slot.teacher_name ?? "—";
      const entry = grouped.get(slot.teacher_id) ?? { teacher, pairs: new Map() };
      entry.pairs.set(`${slot.course_id}:${slot.section_id}`, {
        course: slot.course_name ?? "—",
        klass: slot.class_name ?? "—",
        section: slot.section_name ?? "—",
      });
      grouped.set(slot.teacher_id, entry);
    }
    return [...grouped.values()].sort((a, b) => a.teacher.localeCompare(b.teacher));
  }, [slots]);

  if (byTeacher.length === 0) return <p className="emptyState">{t("noSlotsYet")}</p>;

  return (
    <div className="teacherAssignments">
      {byTeacher.map((entry) => (
        <PageSection key={entry.teacher} style={{ marginBottom: 12 }}>
          <h3>{entry.teacher}</h3>
          <ul>
            {[...entry.pairs.values()]
              .sort((a, b) => `${a.klass}${a.section}`.localeCompare(`${b.klass}${b.section}`))
              .map((pair, index) => (
                <li key={index}>
                  {t("teachesLine", { course: pair.course, klass: pair.klass, section: pair.section })}
                </li>
              ))}
          </ul>
        </PageSection>
      ))}
    </div>
  );
}

// -------------------------------------------------------------- CSV import

function ImportView({ onDone }: Readonly<{ onDone: () => void }>) {
  const { t } = useTranslation();
  const [text, setText] = useState("");
  const [result, setResult] = useState<TimetableImportResponse | null>(null);
  const [error, setError] = useState("");

  const parseRows = (): TimetableImportRow[] => {
    const lines = text.split("\n").map((line) => line.trim()).filter(Boolean);
    return lines.map((line) => {
      const [class_name, section_name, course_name, teacher_code, day, start_time, end_time] = line
        .split(",")
        .map((cell) => cell.trim());
      return { class_name, section_name, course_name, teacher_code, day_of_week: Number(day), start_time, end_time };
    });
  };

  const run = async (dryRun: boolean) => {
    setError("");
    try {
      const rows = parseRows();
      if (rows.length === 0) {
        setError(t("importEmpty"));
        return;
      }
      const response = await operationsApi.importTimetable(rows, dryRun);
      setResult(response);
      if (!dryRun && response.created > 0) onDone();
    } catch (err: any) {
      setError(err.response?.data?.detail ?? t("importFailed"));
    }
  };

  const allOk = result !== null && result.results.every((row) => row.ok);

  return (
    <div>
      <p className="notice">{t("importHint")}</p>
      <pre className="importExample">Class 1, Alif, Nazra, TCH-0001, 0, 08:00, 08:40</pre>
      <textarea
        className="importTextarea"
        rows={8}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={t("importPlaceholder")}
      />
      {error && <p className="notice" style={{ color: "var(--rose)" }}>{error}</p>}
      <div className="formActions">
        <Button className="secondaryAction" type="button" onClick={() => run(true)}>{t("dryRunBtn")}</Button>
        <Button className="primaryAction" type="button" disabled={!allOk} onClick={() => run(false)}>
          <Upload size={16} /> {t("importCommitBtn")}
        </Button>
      </div>
      {result && (
        <div className="dataTable" style={{ marginTop: 12 }}>
          <div className="dataRow header"><span>{t("rowCol")}</span><span>{t("statusCol")}</span><span>{t("errorCol")}</span></div>
          {result.results.map((row) => (
            <div className="dataRow" key={row.row}>
              <span>{row.row}</span>
              <span>{row.ok ? "✓" : "✗"}</span>
              <span>{row.error ?? ""}</span>
            </div>
          ))}
          {result.created > 0 && <p className="notice">{t("importCreated", { count: result.created })}</p>}
        </div>
      )}
    </div>
  );
}
