import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import {
  CalendarDays,
  Clock,
  FileDown,
  LayoutGrid,
  List,
  Trash2,
  Upload,
  Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

import { AppShell } from "@/components/app/AppShell";
import { FormSheet } from "@/components/app/FormSheet";
import {
  ActionButton,
  Card,
  EmptyState,
  Field,
  Pill,
  SectionTitle,
  CustomDropdown,
  SkeletonList,
  TextArea,
  TextInput,
} from "@/components/app/Primitives";
import { useAuth } from "@/lib/mms/auth";
import { academicsApi, operationsApi, peopleApi, type TimetableSlot } from "@/lib/mms/endpoints";
import {
  academicsExtraApi,
  timetableApi,
  type TimetableImportResponse,
  type TimetableImportRow,
} from "@/lib/mms/more-endpoints";
import { useTranslation } from "react-i18next";

export const Route = createFileRoute("/timetable")({
  head: () => ({
    meta: [
      { title: "Timetable — Suffa MS" },
      {
        name: "description",
        content: "Weekly periods, class and section schedules, and timetable management.",
      },
      { property: "og:title", content: "Timetable — Suffa MS" },
      { property: "og:description", content: "Weekly periods, classes and courses." },
    ],
  }),
  component: TimetablePage,
});

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const SHORT_DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

type Tab = "mine" | "grid" | "list" | "teachers" | "import";

function TimetablePage() {
    const { t } = useTranslation();
  const { user, hasPermission } = useAuth();
  const isTeacher = user?.role === "teacher";
  const isStudentish = user?.role === "student" || user?.role === "guardian";
  const canManage = hasPermission("timetable.manage");
  const canBrowseAll = !isStudentish;

  const [tab, setTab] = useState<Tab>(isStudentish || isTeacher ? "mine" : "grid");

  const tabs: { key: Tab; label: string; icon: LucideIcon }[] = [
    { key: "mine", label: "Mine", icon: CalendarDays },
    ...(canBrowseAll
      ? [
          { key: "grid" as Tab, label: "Grid", icon: LayoutGrid },
          { key: "list" as Tab, label: "List", icon: List },
          { key: "teachers" as Tab, label: "Teachers", icon: Users },
        ]
      : []),
    ...(canManage ? [{ key: "import" as Tab, label: "Import", icon: Upload }] : []),
  ];

  return (
    <AppShell title={t("Timetable")} subtitle={t("Weekly periods and schedules")}>
      <div className="mb-3 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
        <div
          className="grid min-w-0 gap-1 rounded-2xl bg-muted p-1"
          style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}
        >
          {tabs.map((item) => (
            <button
              key={item.key}
              onClick={() => setTab(item.key)}
              title={item.label}
              className={cn(
                "flex min-w-0 items-center justify-center gap-1.5 rounded-xl px-1 py-2 text-[0.7rem] font-bold transition-colors",
                tab === item.key
                  ? "gradient-emerald text-primary-foreground shadow-[var(--shadow-raised)]"
                  : "text-muted-foreground",
              )}
            >
              <item.icon className="h-4 w-4 shrink-0" />
              <span className="hidden truncate sm:inline">{item.label}</span>
            </button>
          ))}
        </div>

        {canManage ? (
          <button
            onClick={() => void timetableApi.exportPdf()}
            aria-label="Export timetable PDF"
            className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-muted text-muted-foreground"
          >
            <FileDown className="h-4 w-4" />
          </button>
        ) : null}
      </div>

      {tab === "mine" ? <MineView /> : null}
      {tab === "grid" ? <GridView lockToOwn={isTeacher} /> : null}
      {tab === "list" ? <ListView canManage={canManage} /> : null}
      {tab === "teachers" ? <ByTeacherView /> : null}
      {tab === "import" ? <ImportView /> : null}
    </AppShell>
  );
}

/* ------------------------------------------------------------------ shared */

function useClasses() {
  return useQuery({ queryKey: ["academics", "classes"], queryFn: academicsApi.listClasses });
}

function useSections(classId: string) {
  return useQuery({
    queryKey: ["academics", "sections", classId],
    queryFn: () => academicsExtraApi.listSections(classId),
    enabled: Boolean(classId),
  });
}

function useClassCourses(classId: string) {
  return useQuery({
    queryKey: ["academics", "class-courses", classId],
    queryFn: () => timetableApi.listClassCourses(classId),
    enabled: Boolean(classId),
  });
}

function useTeachers(enabled: boolean) {
  return useQuery({
    queryKey: ["people", "teachers", "all"],
    queryFn: peopleApi.listTeachers,
    enabled,
  });
}

function SlotRow({ slot, onDelete }: { slot: TimetableSlot; onDelete?: () => void }) {
    const { t } = useTranslation();
  return (
    <Card className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 p-3.5">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary-soft font-display text-sm font-extrabold text-primary">
        {slot.period}
      </span>
      <div className="min-w-0">
        <p className="truncate font-semibold">{slot.course_name ?? "Course"}</p>
        <p className="truncate text-xs text-muted-foreground">
          {[slot.class_name, slot.section_name, slot.teacher_name].filter(Boolean).join(" · ")}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <span className="flex items-center gap-1 text-xs font-bold text-muted-foreground">
          <Clock className="h-3.5 w-3.5" />
          {slot.start_time?.slice(0, 5)}
        </span>
        {onDelete ? (
          <button
            aria-label="Delete slot"
            onClick={onDelete}
            className="grid h-8 w-8 place-items-center rounded-xl bg-destructive/10 text-destructive"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        ) : null}
      </div>
    </Card>
  );
}

/* -------------------------------------------------------------------- mine */

function MineView() {
    const { t } = useTranslation();
  const query = useQuery({
    queryKey: ["timetable", "me"],
    queryFn: () => operationsApi.listMyTimetable(),
  });
  const [classId, setClassId] = useState("");

  const slots = query.data ?? [];
  const classOptions = [
    ...new Map(slots.map((slot) => [slot.class_id, slot.class_name ?? "Class"])).entries(),
  ];
  const visible = classId ? slots.filter((slot) => slot.class_id === classId) : slots;
  const todayIndex = (new Date().getDay() + 6) % 7;

  const byDay = DAYS.map((day, index) => ({
    day,
    index,
    slots: visible
      .filter((slot) => Number(slot.day_of_week) === index)
      .sort((a, b) => a.period - b.period),
  })).filter((group) => group.slots.length > 0);

  return (
    <>
      {classOptions.length > 1 ? (
        <div className="mb-3">
          <Field label={t("Class")}>
            <CustomDropdown value={classId} onChange={(e) => setClassId(e.target.value)}>
              <option value="">{t("All classes")}</option>
              {classOptions.map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </CustomDropdown>
          </Field>
        </div>
      ) : null}

      {query.isLoading ? <SkeletonList rows={6} /> : null}
      {!query.isLoading && byDay.length === 0 ? (
        <EmptyState
          title={t("No periods scheduled")}
          hint="Your timetable will appear once it is published."
        />
      ) : null}

      {byDay.map((group) => (
        <div key={group.day}>
          <SectionTitle
            action={group.index === todayIndex ? <Pill tone="gold">{t("Today")}</Pill> : undefined}
          >
            {group.day}
          </SectionTitle>
          <div className="space-y-2">
            {group.slots.map((slot) => (
              <SlotRow key={slot.id} slot={slot} />
            ))}
          </div>
        </div>
      ))}
    </>
  );
}

/* -------------------------------------------------------------------- grid */

function GridView({ lockToOwn }: { lockToOwn: boolean }) {
    const { t } = useTranslation();
  const [classId, setClassId] = useState("");
  const [sectionId, setSectionId] = useState("");

  const classes = useClasses();
  const sections = useSections(classId);
  const slots = useQuery({
    queryKey: ["timetable", "all", lockToOwn, classId, sectionId],
    queryFn: () =>
      lockToOwn
        ? operationsApi.listMyTimetable()
        : operationsApi.listTimetable({ class_id: classId, section_id: sectionId }),
    enabled: Boolean(classId && sectionId),
  });

  const gridSlots = (slots.data ?? []).filter(
    (slot) => slot.class_id === classId && slot.section_id === sectionId,
  );
  const periods = [...new Set(gridSlots.map((slot) => slot.period))].sort((a, b) => a - b);

  return (
    <>
      <div className="mb-3 grid grid-cols-2 gap-2">
        <Field label={t("Class")}>
          <CustomDropdown
            value={classId}
            onChange={(e) => {
              setClassId(e.target.value);
              setSectionId("");
            }}
          >
            <option value="">{t("Choose class…")}</option>
            {(classes.data ?? []).map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </CustomDropdown>
        </Field>
        <Field label={t("Section")}>
          <CustomDropdown
            value={sectionId}
            disabled={!classId}
            onChange={(e) => setSectionId(e.target.value)}
          >
            <option value="">{t("Choose section…")}</option>
            {(sections.data ?? []).map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </CustomDropdown>
        </Field>
      </div>

      {!classId || !sectionId ? (
        <EmptyState title={t("Pick a class and section")} hint="The weekly grid loads after both." />
      ) : slots.isLoading ? (
        <SkeletonList rows={5} />
      ) : periods.length === 0 ? (
        <EmptyState title={t("No periods for this section")} />
      ) : (
        <div className="space-y-3">
          {periods.map((period) => {
            const sample = gridSlots.find((slot) => slot.period === period);
            return (
              <Card key={period} className="p-3.5">
                <div className="mb-2 flex items-center justify-between">
                  <p className="font-display text-sm font-extrabold">{t("Period")}{period}</p>
                  <span className="text-xs font-bold text-muted-foreground">
                    {sample?.start_time?.slice(0, 5)}–{sample?.end_time?.slice(0, 5)}
                  </span>
                </div>
                <div className="space-y-1.5">
                  {DAYS.map((day, index) => {
                    const slot = gridSlots.find(
                      (item) => item.day_of_week === index && item.period === period,
                    );
                    return (
                      <div
                        key={day}
                        className="flex items-center justify-between gap-3 rounded-xl bg-muted px-3 py-2"
                      >
                        <span className="text-xs font-bold text-muted-foreground">
                          {SHORT_DAYS[index]}
                        </span>
                        <div className="min-w-0 text-right">
                          <p className="truncate text-sm font-semibold">
                            {slot?.course_name ?? "—"}
                          </p>
                          {slot?.teacher_name ? (
                            <p className="truncate text-xs text-muted-foreground">
                              {slot.teacher_name}
                            </p>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}

/* -------------------------------------------------------------------- list */

function ListView({ canManage }: { canManage: boolean }) {
    const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [filters, setFilters] = useState({
    class_id: "",
    section_id: "",
    course_id: "",
    teacher_id: "",
    day: "",
  });

  const classes = useClasses();
  const sections = useSections(filters.class_id);
  const teachers = useTeachers(true);
  const allCourses = useQuery({
    queryKey: ["academics", "courses"],
    queryFn: academicsExtraApi.listCourses,
  });

  const slots = useQuery({
    queryKey: ["timetable", "list", filters],
    queryFn: () =>
      operationsApi.listTimetable({
        class_id: filters.class_id || undefined,
        section_id: filters.section_id || undefined,
      }),
  });

  const filtered = (slots.data ?? []).filter(
    (slot) =>
      (!filters.course_id || slot.course_id === filters.course_id) &&
      (!filters.teacher_id || slot.teacher_id === filters.teacher_id) &&
      (filters.day === "" || slot.day_of_week === Number(filters.day)),
  );

  const remove = useMutation({
    mutationFn: (id: string) => timetableApi.deleteSlot(id),
    onSuccess: () => {
      toast.success("Slot deleted");
      void queryClient.invalidateQueries({ queryKey: ["timetable"] });
    },
  });

  return (
    <>
      {canManage ? (
        <div className="mb-3">
          <AddSlotSheet />
        </div>
      ) : null}

      <div className="mb-3 grid grid-cols-2 gap-2">
        <Field label={t("Class")}>
          <CustomDropdown
            value={filters.class_id}
            onChange={(e) => setFilters({ ...filters, class_id: e.target.value, section_id: "" })}
          >
            <option value="">{t("All classes")}</option>
            {(classes.data ?? []).map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </CustomDropdown>
        </Field>
        <Field label={t("Section")}>
          <CustomDropdown
            value={filters.section_id}
            disabled={!filters.class_id}
            onChange={(e) => setFilters({ ...filters, section_id: e.target.value })}
          >
            <option value="">{t("All sections")}</option>
            {(sections.data ?? []).map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </CustomDropdown>
        </Field>
        <Field label={t("Course")}>
          <CustomDropdown
            value={filters.course_id}
            onChange={(e) => setFilters({ ...filters, course_id: e.target.value })}
          >
            <option value="">{t("All courses")}</option>
            {(allCourses.data ?? []).map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </CustomDropdown>
        </Field>
        <Field label={t("Teacher")}>
          <CustomDropdown
            value={filters.teacher_id}
            onChange={(e) => setFilters({ ...filters, teacher_id: e.target.value })}
          >
            <option value="">{t("All teachers")}</option>
            {(teachers.data ?? []).map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </CustomDropdown>
        </Field>
        <Field label={t("Day")}>
          <CustomDropdown
            value={filters.day}
            onChange={(e) => setFilters({ ...filters, day: e.target.value })}
          >
            <option value="">{t("All days")}</option>
            {DAYS.map((day, index) => (
              <option key={day} value={index}>
                {day}
              </option>
            ))}
          </CustomDropdown>
        </Field>
      </div>

      {slots.isLoading ? <SkeletonList rows={6} /> : null}
      {!slots.isLoading && filtered.length === 0 ? (
        <EmptyState title={t("No slots yet")} hint="Add a slot or relax the filters." />
      ) : null}

      <div className="space-y-2">
        {filtered
          .slice()
          .sort((a, b) => a.day_of_week - b.day_of_week || a.period - b.period)
          .map((slot) => (
            <div key={slot.id}>
              <p className="mb-1 text-[0.65rem] font-bold uppercase tracking-wide text-muted-foreground">
                {DAYS[slot.day_of_week] ?? "—"} · {slot.start_time?.slice(0, 5)}–
                {slot.end_time?.slice(0, 5)}
              </p>
              <SlotRow
                slot={slot}
                onDelete={canManage ? () => remove.mutate(slot.id) : undefined}
              />
            </div>
          ))}
      </div>
    </>
  );
}

function AddSlotSheet() {
    const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    class_id: "",
    section_id: "",
    course_id: "",
    teacher_id: "",
    day_of_week: "0",
    start_time: "",
    end_time: "",
  });

  const classes = useClasses();
  const sections = useSections(form.class_id);
  const courses = useClassCourses(form.class_id);
  const teachers = useTeachers(true);

  async function submit() {
    if (
      !form.class_id ||
      !form.section_id ||
      !form.course_id ||
      !form.teacher_id ||
      !form.start_time ||
      !form.end_time
    ) {
      toast.error("Fill every field first");
      throw new Error("incomplete");
    }
    await timetableApi.createSlot({
      class_id: form.class_id,
      section_id: form.section_id,
      course_id: form.course_id,
      teacher_id: form.teacher_id,
      day_of_week: Number(form.day_of_week),
      start_time: form.start_time,
      end_time: form.end_time,
    });
    toast.success("Slot added");
    setForm({ ...form, start_time: "", end_time: "" });
    void queryClient.invalidateQueries({ queryKey: ["timetable"] });
  }

  return (
    <FormSheet
      title={t("Add timetable slot")}
      triggerLabel="Add slot"
      submitLabel="Add slot"
      onSubmit={submit}
    >
      <Field label={t("Class")}>
        <CustomDropdown
          value={form.class_id}
          onChange={(e) =>
            setForm({ ...form, class_id: e.target.value, section_id: "", course_id: "" })
          }
        >
          <option value="">{t("Select…")}</option>
          {(classes.data ?? []).map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </CustomDropdown>
      </Field>
      <Field label={t("Section")}>
        <CustomDropdown
          value={form.section_id}
          disabled={!form.class_id}
          onChange={(e) => setForm({ ...form, section_id: e.target.value })}
        >
          <option value="">{t("Select…")}</option>
          {(sections.data ?? []).map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </CustomDropdown>
      </Field>
      <Field label={t("Course")}>
        <CustomDropdown
          value={form.course_id}
          disabled={!form.class_id}
          onChange={(e) => setForm({ ...form, course_id: e.target.value })}
        >
          <option value="">{t("Select…")}</option>
          {(courses.data ?? []).map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </CustomDropdown>
      </Field>
      <Field label={t("Teacher")}>
        <CustomDropdown
          value={form.teacher_id}
          onChange={(e) => setForm({ ...form, teacher_id: e.target.value })}
        >
          <option value="">{t("Select…")}</option>
          {(teachers.data ?? []).map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </CustomDropdown>
      </Field>
      <Field label={t("Day")}>
        <CustomDropdown
          value={form.day_of_week}
          onChange={(e) => setForm({ ...form, day_of_week: e.target.value })}
        >
          {DAYS.map((day, index) => (
            <option key={day} value={index}>
              {day}
            </option>
          ))}
        </CustomDropdown>
      </Field>
      <Field label={t("Start time")}>
        <TextInput
          type="time"
          value={form.start_time}
          onChange={(e) => setForm({ ...form, start_time: e.target.value })}
        />
      </Field>
      <Field label={t("End time")}>
        <TextInput
          type="time"
          value={form.end_time}
          onChange={(e) => setForm({ ...form, end_time: e.target.value })}
        />
      </Field>
    </FormSheet>
  );
}

/* -------------------------------------------------------------- by teacher */

function ByTeacherView() {
    const { t } = useTranslation();
  const classes = useClasses();
  const classList = classes.data ?? [];

  const slots = useQuery({
    queryKey: ["timetable", "all"],
    queryFn: () => operationsApi.listTimetable(),
  });

  const grouped = useMemo(() => {
    const map = new Map<string, { teacher: string; pairs: Map<string, string> }>();
    for (const slot of slots.data ?? []) {
      const key = slot.teacher_id ?? "unassigned";
      const entry = map.get(key) ?? {
        teacher: slot.teacher_name ?? "Unassigned",
        pairs: new Map(),
      };
      entry.pairs.set(
        `${slot.course_id}:${slot.section_id}`,
        `${slot.course_name ?? "—"} · ${slot.class_name ?? "—"} ${slot.section_name ?? ""}`.trim(),
      );
      map.set(key, entry);
    }
    return [...map.values()].sort((a, b) => a.teacher.localeCompare(b.teacher));
  }, [slots.data]);

  void classList;

  if (slots.isLoading) return <SkeletonList rows={6} />;
  if (grouped.length === 0) return <EmptyState title={t("No slots yet")} />;

  return (
    <div className="space-y-3">
      {grouped.map((entry) => (
        <Card key={entry.teacher} className="p-3.5">
          <p className="mb-2 font-display text-sm font-extrabold">{entry.teacher}</p>
          <ul className="space-y-1">
            {[...entry.pairs.values()].sort().map((line) => (
              <li key={line} className="text-xs text-muted-foreground">
                {line}
              </li>
            ))}
          </ul>
        </Card>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ import */

function ImportView() {
    const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [text, setText] = useState("");
  const [result, setResult] = useState<TimetableImportResponse | null>(null);

  function parseRows(): TimetableImportRow[] {
    return text
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const cells = line.split(",").map((cell) => cell.trim());
        return {
          class_name: cells[0] ?? "",
          section_name: cells[1] ?? "",
          course_name: cells[2] ?? "",
          teacher_code: cells[3] ?? "",
          day_of_week: Number(cells[4] ?? 0),
          start_time: cells[5] ?? "",
          end_time: cells[6] ?? "",
        };
      });
  }

  const run = useMutation({
    mutationFn: (dryRun: boolean) => {
      const rows = parseRows();
      if (rows.length === 0) throw new Error("Paste at least one row first");
      return timetableApi.importRows(rows, dryRun);
    },
    onSuccess: (data) => {
      setResult(data);
      if (!data.dry_run && data.created > 0) {
        toast.success(`Imported ${data.created} slots`);
        void queryClient.invalidateQueries({ queryKey: ["timetable"] });
      }
    },
    onError: (error: Error) => toast.error(error.message || "Import failed"),
  });

  const allOk = result !== null && result.results.every((row) => row.ok);

  return (
    <div className="space-y-3">
      <Card className="p-3.5">
        <p className="text-xs text-muted-foreground">
          {t("One slot per line: class, section, course, teacher code, day (0=Mon), start, end.")}</p>
        <pre className="mt-2 overflow-x-auto rounded-xl bg-muted px-3 py-2 text-[0.7rem]">
          {t("Class 1, Alif, Nazra, TCH-0001, 0, 08:00, 08:40")}</pre>
      </Card>

      <Field label={t("Rows")}>
        <TextArea rows={8} value={text} onChange={(e) => setText(e.target.value)} />
      </Field>

      <div className="flex gap-2">
        <ActionButton variant="soft" onClick={() => run.mutate(true)} className="flex-1">
          {t("Dry run")}</ActionButton>
        <ActionButton disabled={!allOk} onClick={() => run.mutate(false)} className="flex-1">
          <Upload className="h-4 w-4" /> {t("Import")}</ActionButton>
      </div>

      {result ? (
        <Card className="space-y-1.5 p-3.5">
          {result.results.map((row) => (
            <div key={row.row} className="flex items-start justify-between gap-3 text-xs">
              <span className="font-bold">{t("Row")}{row.row}</span>
              <span className={row.ok ? "text-primary" : "text-destructive"}>
                {row.ok ? "OK" : (row.error ?? "Failed")}
              </span>
            </div>
          ))}
          {result.created > 0 ? (
            <p className="text-xs text-muted-foreground">{t("Created")}{result.created} {t("slots.")}</p>
          ) : null}
        </Card>
      ) : null}
    </div>
  );
}
