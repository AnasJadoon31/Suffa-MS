import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  GraduationCap,
  Save,
  Search,
  Users,
} from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { AppShell } from "@/components/app/AppShell";
import { Card, EmptyState, Field, Pill, SectionTitle, SkeletonList, TextInput } from "@/components/app/Primitives";
import { useAuth } from "@/lib/mms/auth";
import { academicsApi, operationsApi, peopleApi, type TimetableSlot } from "@/lib/mms/endpoints";
import {
  academicsExtraApi,
  dailyReportApi,
  type DailyReportConfig,
  type DailyReportEntry,
  type DailyReportFieldDefinition,
} from "@/lib/mms/more-endpoints";
import { api, apiErrorMessage } from "@/lib/mms/api";
import { cn } from "@/lib/utils";
import {
  addMonths,
  monthRange,
  startOfMonth,
  toDateKey,
} from "@/components/app/AttendanceCalendar";

export const Route = createFileRoute("/daily-reports")({
  head: () => ({
    meta: [
      { title: "Daily Reports — Suffa MS" },
      { name: "description", content: "Daily student reports" },
    ],
  }),
  component: DailyReportsPage,
});

function DailyReportsPage() {
  const { user } = useAuth();

  if (["teacher", "principal", "super_admin"].includes(user?.role ?? "")) return <TeacherDailyReports />;
  if (user?.role === "student") return <StudentDailyReports />;
  if (user?.role === "parent") return <GuardianDailyReports />;
  return <EmptyState title="Daily reports are not available for your role." />;
}

// ----------------------------------------------------------- Teacher View

function TeacherDailyReports() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const client = useQueryClient();
  const [selectedClassId, setSelectedClassId] = useState("");
  const [selectedSectionId, setSelectedSectionId] = useState("");
  const [selectedDate, setSelectedDate] = useState(toDateKey(new Date()));
  const [search, setSearch] = useState("");
  const [studentValues, setStudentValues] = useState<Record<string, Record<string, unknown>>>({});
  const [savedFlash, setSavedFlash] = useState(false);
  const isAdmin = ["principal", "super_admin"].includes(user?.role ?? "");

  const myTimetable = useQuery({
    queryKey: ["my-timetable"],
    queryFn: () => operationsApi.listMyTimetable(),
    enabled: Boolean(user) && !isAdmin,
  });

  const allClasses = useQuery({
    queryKey: ["all-classes-daily-reports"],
    queryFn: () => academicsApi.listClassesWithDailyReports(),
    enabled: isAdmin,
  });

  const classOptions = useMemo(() => {
    if (isAdmin) {
      return (allClasses.data ?? []).map((c) => ({ id: c.id, name: c.name }));
    }
    const map = new Map<string, string>();
    for (const slot of myTimetable.data ?? []) {
      if (slot.class_id) map.set(slot.class_id, slot.class_name ?? "—");
    }
    return Array.from(map, ([id, name]) => ({ id, name }));
  }, [isAdmin, allClasses.data, myTimetable.data]);

  const adminSections = useQuery({
    queryKey: ["class-sections", selectedClassId],
    queryFn: () => academicsExtraApi.listSections(selectedClassId),
    enabled: isAdmin && Boolean(selectedClassId),
  });

  const sectionOptions = useMemo(() => {
    if (!selectedClassId) return [];
    if (isAdmin) {
      return (adminSections.data ?? []).map((s) => ({ id: s.id, name: s.name }));
    }
    const map = new Map<string, string>();
    for (const slot of myTimetable.data ?? []) {
      if (slot.class_id === selectedClassId && slot.section_id) {
        map.set(slot.section_id, slot.section_name ?? "—");
      }
    }
    return Array.from(map, ([id, name]) => ({ id, name }));
  }, [isAdmin, selectedClassId, adminSections.data, myTimetable.data]);

  const configQuery = useQuery({
    queryKey: ["daily-report-config", selectedClassId],
    queryFn: () => dailyReportApi.getConfig(selectedClassId),
    enabled: Boolean(selectedClassId),
  });

  const studentsQuery = useQuery({
    queryKey: ["daily-report-students", selectedClassId, selectedSectionId, selectedDate],
    queryFn: async () => {
      const params = { section_id: selectedSectionId, date: selectedDate };
      const [studentsRes, entriesRes] = await Promise.all([
        peopleApi.listStudentsPage({ section_id: selectedSectionId, limit: 200, offset: 0 }),
        api.get<DailyReportEntry[]>(`/api/v1/academics/classes/${selectedClassId}/daily-report-entries`, { params }),
      ]);
      const entriesByStudent = new Map<string, DailyReportEntry>();
      for (const e of entriesRes.data) entriesByStudent.set(e.student_id, e);
      return {
        students: studentsRes.items,
        entriesByStudent,
      };
    },
    enabled: Boolean(selectedClassId && selectedSectionId),
  });

  const config = configQuery.data;
  const fields = config?.fields_definition ?? [];
  const students = studentsQuery.data?.students ?? [];
  const entriesByStudent = studentsQuery.data?.entriesByStudent ?? new Map();

  const filteredStudents = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return students;
    return students.filter((s) => s.name.toLowerCase().includes(term));
  }, [students, search]);

  const handleFieldChange = (studentId: string, fieldKey: string, value: unknown) => {
    setStudentValues((prev) => ({
      ...prev,
      [studentId]: { ...(prev[studentId] ?? {}), [fieldKey]: value },
    }));
    setSavedFlash(false);
  };

  const getFieldValue = (studentId: string, field: DailyReportFieldDefinition): unknown => {
    const key = field.key || field.id || "";
    const saved = entriesByStudent.get(studentId);
    if (saved && saved.values[key] !== undefined) return saved.values[key];
    return studentValues[studentId]?.[key] ?? defaultValueForField(field);
  };

  const saveMutation = useMutation({
    mutationFn: async (studentId: string) => {
      const values = studentValues[studentId] ?? {};
      return dailyReportApi.saveEntry(selectedClassId, studentId, selectedSectionId, selectedDate, values);
    },
    onSuccess: () => {
      setSavedFlash(true);
      void client.invalidateQueries({ queryKey: ["daily-report-students"] });
    },
    onError: (error) => apiErrorMessage(error, "Failed to save"),
  });

  if (!selectedClassId) {
    return (
      <AppShell title={t("Daily Reports")} subtitle={t("Select a class to begin")}>
        <SectionTitle icon={GraduationCap} title={t("Your classes")} />
        {(myTimetable.isLoading || allClasses.isLoading) ? (
          <SkeletonList count={4} />
        ) : classOptions.length === 0 ? (
          <EmptyState title={t("No classes with daily reports enabled")} />
        ) : (
          <div className="space-y-2">
            {classOptions.map((cls) => (
              <Card
                key={cls.id}
                className="grid cursor-pointer grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 p-3.5"
                onClick={() => { setSelectedClassId(cls.id); setSelectedSectionId(""); }}
              >
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary">
                  <GraduationCap className="h-5 w-5" />
                </span>
                <p className="font-semibold">{cls.name}</p>
                <ChevronRight className="h-5 w-5 text-muted-foreground" />
              </Card>
            ))}
          </div>
        )}
      </AppShell>
    );
  }

  if (!selectedSectionId) {
    return (
      <AppShell title={t("Daily Reports")} subtitle={t("Select a section")} onBack={() => setSelectedClassId("")}>
        <SectionTitle icon={Users} title={t("Sections")} />
        {adminSections.isLoading ? <SkeletonList count={4} /> : null}
        <div className="space-y-2">
          {sectionOptions.map((sec) => (
            <Card
              key={sec.id}
              className="grid cursor-pointer grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 p-3.5"
              onClick={() => setSelectedSectionId(sec.id)}
            >
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary">
                <Users className="h-5 w-5" />
              </span>
              <p className="font-semibold">{sec.name}</p>
              <ChevronRight className="h-5 w-5 text-muted-foreground" />
            </Card>
          ))}
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell
      title={t("Daily Reports")}
      subtitle={classOptions.find((c) => c.id === selectedClassId)?.name}
      onBack={() => setSelectedSectionId("")}
    >
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <button
            className="rounded-xl bg-muted px-3 py-2 text-xs font-semibold"
            onClick={() => { setSelectedClassId(""); setSelectedSectionId(""); }}
          >
            {t("Change class")}
          </button>
          <button
            className="rounded-xl bg-muted px-3 py-2 text-xs font-semibold"
            onClick={() => setSelectedSectionId("")}
          >
            {t("Change section")}
          </button>
          <Field label="" className="flex-1">
            <TextInput
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
            />
          </Field>
        </div>

        {config && !config.enabled ? (
          <Pill tone="warning">{t("Daily reports not enabled for this class")}</Pill>
        ) : null}

        {config?.enabled && fields.length > 0 ? (
          <>
            <Field label={t("Search students")}>
              <TextInput
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t("Type a name...")}
                icon={<Search className="h-4 w-4" />}
              />
            </Field>

            {studentsQuery.isLoading ? (
              <SkeletonList count={5} />
            ) : filteredStudents.length === 0 ? (
              <EmptyState title={t("No students found")} />
            ) : (
              <div className="space-y-2">
                {filteredStudents.map((student) => {
                  const hasSaved = entriesByStudent.has(student.id);
                  return (
                    <Card key={student.id} className="space-y-3 p-3.5">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-semibold">{student.name}</p>
                          <p className="text-xs text-muted-foreground">#{student.admission_number}</p>
                        </div>
                        {hasSaved ? (
                          <Pill tone="success">{t("Saved")}</Pill>
                        ) : null}
                      </div>
                      <div className="grid gap-3 sm:grid-cols-2">
                        {fields
                          .filter((f) => f.type !== "label" && f.enabled !== false)
                          .map((field) => {
                            const fieldKey = field.key || field.id || "";
                            return (
                              <Field key={fieldKey} label={field.label}>
                                <ReportFieldInput
                                  field={field}
                                  value={getFieldValue(student.id, field)}
                                  onChange={(v) => handleFieldChange(student.id, fieldKey, v)}
                                />
                              </Field>
                            );
                          })}
                      </div>
                      <button
                        className="flex items-center gap-1.5 self-end rounded-xl bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground"
                        onClick={() => saveMutation.mutate(student.id)}
                        disabled={saveMutation.isPending}
                      >
                        <Save className="h-3.5 w-3.5" />
                        {savedFlash && saveMutation.isSuccess ? t("Saved!") : t("Save")}
                      </button>
                    </Card>
                  );
                })}
              </div>
            )}
          </>
        ) : (
          <EmptyState title={t("No report fields configured for this class")} />
        )}
      </div>
    </AppShell>
  );
}

function ReportFieldInput({
  field,
  value,
  onChange,
}: {
  field: DailyReportFieldDefinition;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  const { t } = useTranslation();
  switch (field.type) {
    case "textarea":
      return (
        <textarea
          className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
          rows={2}
          value={String(value ?? "")}
          onChange={(e) => onChange(e.target.value)}
        />
      );
    case "boolean":
      return (
        <label className="flex cursor-pointer items-center gap-2">
          <input
            type="checkbox"
            checked={Boolean(value)}
            onChange={(e) => onChange(e.target.checked)}
            className="h-4 w-4 rounded border-border"
          />
          <span className="text-sm">{field.label}</span>
        </label>
      );
    case "dropdown":
    case "radio":
      return (
        <select
          className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
          value={String(value ?? "")}
          onChange={(e) => onChange(e.target.value)}
        >
          <option value="">{t("Select...")}</option>
          {field.options.map((opt) => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </select>
      );
    case "checkbox_group":
      return (
        <div className="flex flex-wrap gap-2">
          {field.options.map((opt) => {
            const selected = Array.isArray(value) ? value.includes(opt) : false;
            return (
              <label key={opt} className="flex items-center gap-1.5">
                <input
                  type="checkbox"
                  checked={selected}
                  onChange={(e) => {
                    const current = Array.isArray(value) ? [...value] : [];
                    if (e.target.checked) current.push(opt);
                    else current.splice(current.indexOf(opt), 1);
                    onChange(current);
                  }}
                  className="h-4 w-4 rounded border-border"
                />
                <span className="text-xs">{opt}</span>
              </label>
            );
          })}
        </div>
      );
    case "phone":
      return (
        <input
          type="tel"
          className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
          value={String(value ?? "")}
          onChange={(e) => onChange(e.target.value)}
        />
      );
    case "file":
    case "image":
      return (
        <input
          type="file"
          accept={field.type === "image" ? "image/*" : undefined}
          className="w-full text-sm"
          onChange={(e) => {
            const file = e.target.files?.[0];
            onChange(file ? file.name : "");
          }}
        />
      );
    default:
      return (
        <input
          type="text"
          className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
          value={String(value ?? "")}
          onChange={(e) => onChange(e.target.value)}
        />
      );
  }
}

function defaultValueForField(field: DailyReportFieldDefinition): unknown {
  if (field.type === "boolean") return false;
  if (field.type === "checkbox_group") return [];
  return "";
}

// ----------------------------------------------------------- Student View

function StudentDailyReports() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [month, setMonth] = useState(startOfMonth(new Date()));
  const [selectedDate, setSelectedDate] = useState<string | null>(toDateKey(new Date()));

  const profileQuery = useQuery({
    queryKey: ["student-me"],
    queryFn: () => api.get<{ id: string; name: string; admission_number: string | null; class_id: string | null; section_id: string | null }>("/api/v1/people/students/me").then((r) => r.data),
    enabled: Boolean(user),
  });

  const studentId = profileQuery.data?.id;
  const range = monthRange(month);

  const entriesQuery = useQuery({
    queryKey: ["student-daily-reports", studentId, range.start_date, range.end_date],
    queryFn: () => dailyReportApi.listStudentEntries(studentId!, { start_date: range.start_date, end_date: range.end_date }),
    enabled: Boolean(studentId),
  });

  const dayStatuses = useMemo(() => {
    const map: Record<string, boolean> = {};
    for (const entry of entriesQuery.data ?? []) {
      map[entry.date] = true;
    }
    return map;
  }, [entriesQuery.data]);

  const selectedEntry = useMemo(() => {
    if (!selectedDate) return null;
    return (entriesQuery.data ?? []).find((e) => e.date === selectedDate) ?? null;
  }, [selectedDate, entriesQuery.data]);

  const selectedConfigQuery = useQuery({
    queryKey: ["daily-report-config-for-entry", selectedEntry?.class_id],
    queryFn: () => dailyReportApi.getConfig(selectedEntry!.class_id),
    enabled: Boolean(selectedEntry?.class_id),
  });

  return (
    <AppShell title={t("Daily Reports")} subtitle={t("Your daily reports calendar")}>
      <div className="space-y-3">
        <ReportCalendar month={month} onMonthChange={setMonth} selectedDate={selectedDate} onSelectDate={setSelectedDate} dayMarkers={dayStatuses} />

        {selectedDate ? (
          <Card className="p-3.5">
            <SectionTitle icon={CalendarDays} title={selectedDate} />
            {selectedEntry ? (
              <div className="mt-2 space-y-2">
                {(selectedConfigQuery.data?.fields_definition ?? [])
                  .filter((f) => f.type !== "label" && f.enabled !== false)
                  .map((field) => {
                    const fieldKey = field.key || field.id || "";
                    const val = selectedEntry.values[fieldKey];
                    return (
                      <div key={fieldKey} className="flex flex-col gap-0.5">
                        <span className="text-xs font-semibold text-muted-foreground">{field.label}</span>
                        <span className="text-sm">
                          {field.type === "boolean" ? (val ? t("Yes") : t("No")) :
                           field.type === "checkbox_group" ? (Array.isArray(val) ? val.join(", ") : "") :
                           String(val ?? "—")}
                        </span>
                      </div>
                    );
                  })}
              </div>
            ) : (
              <p className="mt-2 text-sm text-muted-foreground">{t("No report for this day")}</p>
            )}
          </Card>
        ) : null}
      </div>
    </AppShell>
  );
}

// ----------------------------------------------------------- Guardian View

function GuardianDailyReports() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [month, setMonth] = useState(startOfMonth(new Date()));
  const [expandedChild, setExpandedChild] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<Record<string, string | null>>({});
  const [search, setSearch] = useState("");

  const range = monthRange(month);

  const childrenQuery = useQuery({
    queryKey: ["guardian-children"],
    queryFn: async () => {
      const res = await api.get<GuardianChild[]>("/api/v1/people/guardians/me/children");
      return res.data;
    },
    enabled: Boolean(user),
  });

  const children = childrenQuery.data ?? [];
  const filteredChildren = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return children;
    return children.filter((c) => c.name.toLowerCase().includes(term));
  }, [children, search]);

  return (
    <AppShell title={t("Daily Reports")} subtitle={t("Your children's daily reports")}>
      <div className="space-y-3">
        <Field label={t("Search child")}>
          <TextInput
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("Type a name...")}
            icon={<Search className="h-4 w-4" />}
          />
        </Field>

        {childrenQuery.isLoading ? (
          <SkeletonList count={3} />
        ) : filteredChildren.length === 0 ? (
          <EmptyState title={t("No children found")} />
        ) : (
          <div className="space-y-2.5">
            {filteredChildren.map((child) => {
              const isOpen = expandedChild === child.id;
              return (
                <Card key={child.id} className="overflow-hidden p-0">
                  <button
                    onClick={() => setExpandedChild(isOpen ? null : child.id)}
                    className="flex w-full items-center justify-between gap-3 p-3.5 text-left"
                  >
                    <div>
                      <p className="font-display text-sm font-extrabold">{child.name}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {[child.current_class?.name, child.current_class?.section_name].filter(Boolean).join(" · ")}
                      </p>
                    </div>
                    <ChevronDown className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", isOpen && "rotate-180")} />
                  </button>
                  {isOpen ? (
                    <div className="border-t border-border px-3.5 pb-3.5 pt-2">
                      <GuardianChildReports
                        child={child}
                        month={month}
                        onMonthChange={setMonth}
                        selectedDate={selectedDate[child.id] ?? null}
                        onSelectDate={(date) => setSelectedDate((prev) => ({ ...prev, [child.id]: date }))}
                      />
                    </div>
                  ) : null}
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </AppShell>
  );
}

function GuardianChildReports({
  child,
  month,
  onMonthChange,
  selectedDate,
  onSelectDate,
}: {
  child: GuardianChild;
  month: Date;
  onMonthChange: (m: Date) => void;
  selectedDate: string | null;
  onSelectDate: (date: string) => void;
}) {
  const { t } = useTranslation();
  const range = monthRange(month);

  const entriesQuery = useQuery({
    queryKey: ["guardian-child-daily-reports", child.id, range.start_date, range.end_date],
    queryFn: () => dailyReportApi.listStudentEntries(child.id, { start_date: range.start_date, end_date: range.end_date }),
    enabled: Boolean(child.id),
  });

  const dayStatuses = useMemo(() => {
    const map: Record<string, boolean> = {};
    for (const entry of entriesQuery.data ?? []) {
      map[entry.date] = true;
    }
    return map;
  }, [entriesQuery.data]);

  const selectedEntry = useMemo(() => {
    if (!selectedDate) return null;
    return (entriesQuery.data ?? []).find((e) => e.date === selectedDate) ?? null;
  }, [selectedDate, entriesQuery.data]);

  const configQuery = useQuery({
    queryKey: ["daily-report-config-for-entry", selectedEntry?.class_id],
    queryFn: () => dailyReportApi.getConfig(selectedEntry!.class_id),
    enabled: Boolean(selectedEntry?.class_id),
  });

  return (
    <div className="space-y-3">
      <ReportCalendar month={month} onMonthChange={onMonthChange} selectedDate={selectedDate} onSelectDate={onSelectDate} dayMarkers={dayStatuses} />

      {selectedDate ? (
        <Card className="p-3">
          <p className="mb-2 text-xs font-semibold text-muted-foreground">{selectedDate}</p>
          {selectedEntry ? (
            <div className="space-y-2">
              {(configQuery.data?.fields_definition ?? [])
                .filter((f) => f.type !== "label" && f.enabled !== false)
                .map((field) => {
                  const fieldKey = field.key || field.id || "";
                  const val = selectedEntry.values[fieldKey];
                  return (
                    <div key={fieldKey} className="flex flex-col gap-0.5">
                      <span className="text-xs font-semibold text-muted-foreground">{field.label}</span>
                      <span className="text-sm">
                        {field.type === "boolean" ? (val ? t("Yes") : t("No")) :
                         field.type === "checkbox_group" ? (Array.isArray(val) ? val.join(", ") : "") :
                         String(val ?? "—")}
                      </span>
                    </div>
                  );
                })}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">{t("No report for this day")}</p>
          )}
        </Card>
      ) : null}
    </div>
  );
}

// ----------------------------------------------------------- Shared Calendar

function ReportCalendar({
  month,
  onMonthChange,
  selectedDate,
  onSelectDate,
  dayMarkers,
}: {
  month: Date;
  onMonthChange: (m: Date) => void;
  selectedDate: string | null;
  onSelectDate: (date: string) => void;
  dayMarkers: Record<string, boolean>;
}) {
  const todayKey = toDateKey(new Date());
  const monthStart = startOfMonth(month);
  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const leading = (monthStart.getDay() + 6) % 7;
  const cells: (string | null)[] = [
    ...Array.from({ length: leading }, () => null),
    ...Array.from({ length: daysInMonth }, (_, index) =>
      toDateKey(new Date(month.getFullYear(), month.getMonth(), index + 1)),
    ),
  ];
  const WEEKDAYS = ["M", "T", "W", "T", "F", "S", "S"];

  return (
    <div className="card-surface p-3">
      <div className="mb-2 grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2">
        <button
          aria-label="Previous month"
          onClick={() => onMonthChange(addMonths(month, -1))}
          className="grid h-9 w-9 place-items-center rounded-xl bg-muted text-muted-foreground"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <p className="text-center font-display text-sm font-extrabold">
          {month.toLocaleDateString(undefined, { month: "long", year: "numeric" })}
        </p>
        <button
          aria-label="Next month"
          onClick={() => onMonthChange(addMonths(month, 1))}
          className="grid h-9 w-9 place-items-center rounded-xl bg-muted text-muted-foreground"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-[0.6rem] font-bold uppercase tracking-wide text-muted-foreground">
        {WEEKDAYS.map((day, index) => (
          <span key={`${day}-${index}`}>{day}</span>
        ))}
      </div>
      <div className="mt-1 grid grid-cols-7 gap-1">
        {cells.map((key, index) => {
          if (!key) return <span key={`empty-${index}`} />;
          const day = Number(key.slice(-2));
          const isFuture = key > todayKey;
          const hasReport = dayMarkers[key];
          return (
            <button
              key={key}
              disabled={isFuture}
              onClick={() => onSelectDate(key)}
              className={cn(
                "relative grid aspect-square place-items-center rounded-xl text-xs font-bold transition-transform active:scale-95",
                hasReport ? "bg-success text-success-foreground" : "bg-muted/60 text-muted-foreground",
                isFuture && "opacity-35",
                key === todayKey && "ring-1 ring-primary",
                key === selectedDate && "ring-2 ring-primary ring-offset-1 ring-offset-card",
              )}
            >
              {day}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ----------------------------------------------------------- Types

interface GuardianChild {
  id: string;
  name: string;
  admission_number: string | null;
  current_class: {
    id: string;
    name: string;
    section_id: string | null;
    section_name: string | null;
  } | null;
}
