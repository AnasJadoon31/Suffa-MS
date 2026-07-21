import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { academicsApi, operationsApi, peopleApi, type AcademicClass, type Course, type Scope, type Section } from "../lib/endpoints";
import { useAuth } from "../lib/AuthContext";
import { Select, Checkbox } from "./ui/Field";

type Mode = "all" | "teachers" | "students" | "classes" | "sections" | "courses" | "users";

/**
 * Shared "who sees this" control for resources/forms/announcements —
 * produces the §6 scope shape: {all} / {roles} / any-of {classes, sections,
 * courses, users}.
 */
export function AudiencePicker({
  value,
  onChange,
}: Readonly<{ value: Scope; onChange: (scope: Scope) => void }>) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [classes, setClasses] = useState<AcademicClass[]>([]);
  const [sections, setSections] = useState<Record<string, Section[]>>({});
  const [courses, setCourses] = useState<Course[]>([]);
  const [people, setPeople] = useState<{ id: string; user_id: string; name: string; role: "teacher" | "student" }[]>([]);
  const [mode, setMode] = useState<Mode>(
    value.all ? "all"
      : value.roles?.includes("teacher") ? "teachers"
      : value.roles?.includes("student") ? "students"
      : value.sections && value.sections.length > 0 ? "sections"
      : value.courses && value.courses.length > 0 ? "courses"
      : value.users && value.users.length > 0 ? "users"
      : value.classes && value.classes.length > 0 ? "classes"
      : user?.role === "teacher" ? "classes" : "all"
  );

  useEffect(() => {
    void Promise.all([
      academicsApi.listClasses(),
      user?.role === "teacher" ? operationsApi.listMyTimetable() : Promise.resolve([]),
    ]).then(async ([allClasses, slots]) => {
      const taughtClassIds = new Set(slots.map((slot) => slot.class_id));
      const list = user?.role === "teacher" ? allClasses.filter((item) => taughtClassIds.has(item.id)) : allClasses;
      setClasses(list);
      const byClass: Record<string, Section[]> = {};
      for (const cls of list) {
        const rows = await academicsApi.listSections(cls.id);
        if (user?.role !== "teacher") byClass[cls.id] = rows;
        else {
          const assigned = new Set(slots.filter((slot) => slot.class_id === cls.id).map((slot) => slot.section_id));
          byClass[cls.id] = rows.filter((section) => assigned.has(section.id));
        }
      }
      setSections(byClass);
    }).catch(() => setClasses([]));
    void Promise.all([
      academicsApi.listAllCourses(),
      user?.role === "teacher" ? operationsApi.listMyTimetable() : Promise.resolve([]),
    ]).then(([rows, slots]) => {
      const assigned = new Set(slots.map((slot) => slot.course_id));
      setCourses(user?.role === "teacher" ? rows.filter((course) => assigned.has(course.id)) : rows);
    }).catch(() => setCourses([]));
    void Promise.all([peopleApi.listTeachers(), peopleApi.listStudents()])
      .then(([teachers, students]) => {
        setPeople([
          ...teachers.map((t) => ({ id: t.id, user_id: t.user_id, name: t.name, role: "teacher" as const })),
          ...students.map((s) => ({ id: s.id, user_id: s.user_id, name: s.name, role: "student" as const })),
        ]);
      })
      .catch(() => setPeople([]));
  }, [user?.role]);

  const emptyScope: Scope = { all: false, roles: [], classes: [], sections: [], courses: [], users: [] };

  const setMode2 = (next: Mode) => {
    setMode(next);
    if (next === "all") onChange({ ...emptyScope, all: true });
    else if (next === "teachers") onChange({ ...emptyScope, roles: ["teacher"] });
    else if (next === "students") onChange({ ...emptyScope, roles: ["student"] });
    else onChange({ ...emptyScope });
  };

  const toggleId = (key: "classes" | "sections" | "courses" | "users", id: string) => {
    const current = value[key] ?? [];
    const next = current.includes(id) ? current.filter((x) => x !== id) : [...current, id];
    onChange({ ...emptyScope, [key]: next });
  };

  return (
    <div className="audiencePicker">
      <label>
        {t("audienceLabel")}
        <Select value={mode} onChange={(e) => setMode2(e.target.value as Mode)}>
          {user?.role !== "teacher" && <option value="all">{t("audienceEveryone")}</option>}
          {user?.role !== "teacher" && <option value="teachers">{t("teachers")}</option>}
          {user?.role !== "teacher" && <option value="students">{t("students")}</option>}
          <option value="classes">{t("audienceClasses")}</option>
          <option value="sections">{t("audienceSections")}</option>
          <option value="courses">{t("audienceCourses")}</option>
          {user?.role !== "teacher" && <option value="users">{t("audienceUsers")}</option>}
        </Select>
      </label>
      {mode === "classes" && (
        <div className="sectionPicker">
          {classes.map((c) => (
            <label key={c.id} className="checkboxLabel">
              <Checkbox
                
                checked={(value.classes ?? []).includes(c.id)}
                onChange={() => toggleId("classes", c.id)}
              />
              {c.name}
            </label>
          ))}
        </div>
      )}
      {mode === "sections" && (
        <div className="sectionPicker">
          {classes.flatMap((c) =>
            (sections[c.id] ?? []).map((s) => (
              <label key={s.id} className="checkboxLabel">
                <Checkbox
                  
                  checked={(value.sections ?? []).includes(s.id)}
                  onChange={() => toggleId("sections", s.id)}
                />
                {c.name} / {s.name}
              </label>
            ))
          )}
        </div>
      )}
      {mode === "courses" && (
        <div className="sectionPicker">
          <p className="notice" style={{ margin: "0 0 6px" }}>{t("selectCoursesHint")}</p>
          {courses.map((co) => (
            <label key={co.id} className="checkboxLabel">
              <Checkbox
                
                checked={(value.courses ?? []).includes(co.id)}
                onChange={() => toggleId("courses", co.id)}
              />
              {co.name}
            </label>
          ))}
        </div>
      )}
      {mode === "users" && (
        <div className="sectionPicker">
          <p className="notice" style={{ margin: "0 0 6px" }}>{t("selectUsersHint")}</p>
          {people.map((p) => (
            <label key={p.user_id} className="checkboxLabel">
              <Checkbox
                
                checked={(value.users ?? []).includes(p.user_id)}
                onChange={() => toggleId("users", p.user_id)}
              />
              {p.name} <small style={{ color: "var(--muted)" }}>({p.role === "teacher" ? t("teachers") : t("students")})</small>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
