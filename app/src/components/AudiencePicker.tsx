import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { academicsApi, type AcademicClass, type Scope, type Section } from "../lib/endpoints";
import { Select } from "./ui/Field";

/**
 * Shared "who sees this" control for resources/forms/announcements —
 * produces the §6 scope shape: {all} / {roles} / any-of {classes, sections}.
 */
export function AudiencePicker({
  value,
  onChange,
}: Readonly<{ value: Scope; onChange: (scope: Scope) => void }>) {
  const { t } = useTranslation();
  const [classes, setClasses] = useState<AcademicClass[]>([]);
  const [sections, setSections] = useState<Record<string, Section[]>>({});
  const [mode, setMode] = useState<"all" | "teachers" | "students" | "classes" | "sections">(
    value.all ? "all"
      : value.roles?.includes("teacher") ? "teachers"
      : value.roles?.includes("student") ? "students"
      : value.sections && value.sections.length > 0 ? "sections"
      : value.classes && value.classes.length > 0 ? "classes"
      : "all"
  );

  useEffect(() => {
    void academicsApi.listClasses().then(async (list) => {
      setClasses(list);
      const byClass: Record<string, Section[]> = {};
      for (const cls of list) byClass[cls.id] = await academicsApi.listSections(cls.id);
      setSections(byClass);
    }).catch(() => setClasses([]));
  }, []);

  const emptyScope: Scope = { all: false, roles: [], classes: [], sections: [], courses: [], users: [] };

  const setMode2 = (next: typeof mode) => {
    setMode(next);
    if (next === "all") onChange({ ...emptyScope, all: true });
    else if (next === "teachers") onChange({ ...emptyScope, roles: ["teacher"] });
    else if (next === "students") onChange({ ...emptyScope, roles: ["student"] });
    else onChange({ ...emptyScope });
  };

  const toggleId = (key: "classes" | "sections", id: string) => {
    const current = value[key] ?? [];
    const next = current.includes(id) ? current.filter((x) => x !== id) : [...current, id];
    onChange({ ...emptyScope, [key]: next });
  };

  return (
    <div className="audiencePicker">
      <label>
        {t("audienceLabel")}
        <Select value={mode} onChange={(e) => setMode2(e.target.value as typeof mode)}>
          <option value="all">{t("audienceEveryone")}</option>
          <option value="teachers">{t("teachers")}</option>
          <option value="students">{t("students")}</option>
          <option value="classes">{t("audienceClasses")}</option>
          <option value="sections">{t("audienceSections")}</option>
        </Select>
      </label>
      {mode === "classes" && (
        <div className="sectionPicker">
          {classes.map((c) => (
            <label key={c.id} className="checkboxLabel">
              <input
                type="checkbox"
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
                <input
                  type="checkbox"
                  checked={(value.sections ?? []).includes(s.id)}
                  onChange={() => toggleId("sections", s.id)}
                />
                {c.name} / {s.name}
              </label>
            ))
          )}
        </div>
      )}
    </div>
  );
}
