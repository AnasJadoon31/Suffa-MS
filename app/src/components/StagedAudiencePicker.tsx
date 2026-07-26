import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { useTranslation } from "react-i18next";
import { Check, ChevronDown, Search, X } from "lucide-react";

import { academicsApi, operationsApi, peopleApi, type AcademicClass, type Scope, type Section } from "../lib/endpoints";
import { useAuth } from "../lib/AuthContext";
import { Select } from "./ui/Field";

type RoleMode = "teachers" | "students" | "guardians";
type NarrowMode = "all" | "classes" | "sections" | "persons";

interface SelectedPerson {
  id: string;
  user_id: string;
  name: string;
  role: "teacher" | "student" | "guardian";
  class_id?: string;
  section_id?: string;
}

const audienceRoleForPerson = (role: SelectedPerson["role"]) => role === "guardian" ? "parent" : role;
const audienceRoleForMode = (mode: RoleMode) => mode === "guardians" ? "parent" : mode.slice(0, -1);

/**
 * ISS3-027: Staged audience picker
 * 
 * Stage 1: Choose role (teachers/students/guardians)
 * Stage 2: Narrow by class/section (optional)
 * Stage 3: Select specific persons (async searchable multi-select)
 * 
 * Features:
 * - Handles hundreds of people with async search
 * - Preserves selections while changing filters
 * - Shows selected chips
 * - Prevents duplicate recipients
 * - Keyboard accessible
 */
export function StagedAudiencePicker({
  value,
  onChange,
}: Readonly<{ value: Scope; onChange: (scope: Scope) => void }>) {
  const { t } = useTranslation();
  const { user } = useAuth();

  const [roleMode, setRoleMode] = useState<RoleMode>("students");
  const [narrowMode, setNarrowMode] = useState<NarrowMode>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [isPeopleDropdownOpen, setIsPeopleDropdownOpen] = useState(false);
  const [peopleDropdownStyle, setPeopleDropdownStyle] = useState<CSSProperties | undefined>();
  const pickerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const listboxId = useRef(`people-picker-${crypto.randomUUID()}`);
  const roleSelectId = useRef(`audience-role-${crypto.randomUUID()}`);
  const narrowSelectId = useRef(`audience-narrow-${crypto.randomUUID()}`);
  const [activeOptionIndex, setActiveOptionIndex] = useState(0);

  const [classes, setClasses] = useState<AcademicClass[]>([]);
  const [sections, setSections] = useState<Record<string, Section[]>>({});
  const [selectedClassId, setSelectedClassId] = useState<string>("");
  const [selectedSectionId, setSelectedSectionId] = useState<string>("");

  const [allPersons, setAllPersons] = useState<SelectedPerson[]>([]);
  const [selectedPersons, setSelectedPersons] = useState<SelectedPerson[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const roleLabel = roleMode === "guardians" ? t("guardians") : roleMode === "teachers" ? t("teachers") : t("students");
  const selectedSummary = useMemo(() => {
    if (selectedPersons.length === 0) {
      return t("audienceAllRole", { role: roleLabel.toLowerCase(), defaultValue: `All ${roleLabel.toLowerCase()}` });
    }
    if (selectedPersons.length === 1) return selectedPersons[0].name;
    return t("selectedPeopleCount", { count: selectedPersons.length, defaultValue: `${selectedPersons.length} selected` });
  }, [roleLabel, selectedPersons, t]);

  const resetPersonSearch = () => {
    setSearchQuery("");
    setAllPersons([]);
  };

  const updatePeopleDropdownPosition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const estimatedHeight = isLoading ? 160 : Math.min(Math.max(allPersons.length, 1) * 50 + 58, 340);
    const availableBelow = window.innerHeight - rect.bottom - 12;
    const availableAbove = rect.top - 12;
    const openAbove = availableBelow < estimatedHeight && availableAbove > availableBelow;
    const maxHeight = Math.max(180, Math.min(estimatedHeight, openAbove ? availableAbove - 8 : availableBelow));
    setPeopleDropdownStyle({
      position: "fixed",
      left: Math.max(8, rect.left),
      width: Math.min(rect.width, window.innerWidth - 16),
      ...(openAbove
        ? { top: "auto", bottom: Math.max(8, window.innerHeight - rect.top + 6) }
        : { top: Math.min(rect.bottom + 6, window.innerHeight - 8), bottom: "auto" }),
      maxHeight,
    });
  }, [allPersons.length, isLoading]);

  // Load classes and sections
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
  }, [user?.role]);

  useEffect(() => {
    if (!isPeopleDropdownOpen) return;
    updatePeopleDropdownPosition();
    const handlePointerDown = (event: MouseEvent) => {
      if (!pickerRef.current?.contains(event.target as Node)) {
        setIsPeopleDropdownOpen(false);
      }
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsPeopleDropdownOpen(false);
    };
    const handleReposition = () => updatePeopleDropdownPosition();
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);
    window.addEventListener("resize", handleReposition);
    window.addEventListener("scroll", handleReposition, true);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
      window.removeEventListener("resize", handleReposition);
      window.removeEventListener("scroll", handleReposition, true);
    };
  }, [isPeopleDropdownOpen, updatePeopleDropdownPosition]);

  useEffect(() => {
    if (!isPeopleDropdownOpen) return;
    window.setTimeout(() => searchInputRef.current?.focus(), 0);
  }, [isPeopleDropdownOpen]);

  // Async person search based on the selected role. The API caps/pages the
  // result rather than rendering a tenant-wide checkbox wall.
  useEffect(() => {
    const timer = window.setTimeout(() => {
    setIsLoading(true);
    const loadPersons = async () => {
      try {
        if (roleMode === "teachers") {
          const teachers = await peopleApi.listTeachers(searchQuery || undefined);
          setAllPersons(teachers.map((t) => ({ id: t.id, user_id: t.user_id, name: t.name, role: "teacher" as const })));
        } else if (roleMode === "students") {
          const students = await peopleApi.listStudents(searchQuery || undefined);
          setAllPersons(students.map((s) => ({
            id: s.id,
            user_id: s.user_id,
            name: s.name,
            role: "student" as const,
            class_id: s.active_enrollment?.class_id,
            section_id: s.active_enrollment?.section_id,
          })));
        } else if (roleMode === "guardians") {
          const guardians = await peopleApi.listGuardians(searchQuery || undefined);
          setAllPersons(guardians
            .filter((g) => Boolean(g.user_id))
            .map((g) => ({ id: g.id, user_id: g.user_id as string, name: g.name, role: "guardian" as const })));
        }
      } catch {
        setAllPersons([]);
      } finally {
        setIsLoading(false);
      }
    };
    void loadPersons();
    }, 250);
    return () => window.clearTimeout(timer);
  }, [roleMode, searchQuery]);

  // Filter persons based on search and class/section
  const filteredPersons = allPersons.filter((p) => {
    if (searchQuery && !p.name.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    if (p.role === "student" && narrowMode === "classes" && selectedClassId) {
      if (p.class_id !== selectedClassId) return false;
    }
    if (p.role === "student" && narrowMode === "sections" && selectedSectionId) {
      if (p.section_id !== selectedSectionId) return false;
    }
    return true;
  });

  useEffect(() => {
    setActiveOptionIndex(0);
  }, [roleMode, searchQuery, selectedClassId, selectedSectionId, narrowMode]);

  const personKey = (person: SelectedPerson) => person.user_id || `${person.role}:${person.id}`;

  const togglePerson = (person: SelectedPerson) => {
    const key = personKey(person);
    const exists = selectedPersons.some((p) => personKey(p) === key);
    let next: SelectedPerson[];
    if (exists) {
      next = selectedPersons.filter((p) => personKey(p) !== key);
    } else {
      next = [...selectedPersons, person];
    }
    setSelectedPersons(next);
    updateScope(next);
  };

  const moveActiveOption = (direction: 1 | -1) => {
    if (filteredPersons.length === 0) return;
    setActiveOptionIndex((current) => (current + direction + filteredPersons.length) % filteredPersons.length);
  };

  const handlePeoplePickerKeyDown = (event: ReactKeyboardEvent) => {
    if (!isPeopleDropdownOpen && (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ")) {
      event.preventDefault();
      setIsPeopleDropdownOpen(true);
      return;
    }
    if (!isPeopleDropdownOpen) return;
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        moveActiveOption(1);
        break;
      case "ArrowUp":
        event.preventDefault();
        moveActiveOption(-1);
        break;
      case "Home":
        event.preventDefault();
        setActiveOptionIndex(0);
        break;
      case "End":
        event.preventDefault();
        setActiveOptionIndex(Math.max(0, filteredPersons.length - 1));
        break;
      case "Enter":
        event.preventDefault();
        if (filteredPersons[activeOptionIndex]) togglePerson(filteredPersons[activeOptionIndex]);
        break;
      case " ":
        if (event.currentTarget !== searchInputRef.current) {
          event.preventDefault();
          if (filteredPersons[activeOptionIndex]) togglePerson(filteredPersons[activeOptionIndex]);
        }
        break;
      case "Escape":
        event.preventDefault();
        setIsPeopleDropdownOpen(false);
        triggerRef.current?.focus();
        break;
      case "Tab":
        setIsPeopleDropdownOpen(false);
        break;
    }
  };

  const updateScope = (persons: SelectedPerson[]) => {
    const userIds = persons.map((p) => p.user_id).filter(Boolean);
    const roles = Array.from(new Set(persons.map((p) => audienceRoleForPerson(p.role))));
    const scope: Scope = {
      all: false,
      roles: roles.length > 0 ? roles : [audienceRoleForMode(roleMode)],
      classes: [],
      sections: [],
      courses: [],
      users: userIds,
    };
    onChange(scope);
  };

  useEffect(() => {
    if (selectedPersons.length > 0) return;
    const role = audienceRoleForMode(roleMode);
    onChange({
      all: false,
      roles: [role],
      classes: narrowMode === "classes" && selectedClassId ? [selectedClassId] : [],
      sections: narrowMode === "sections" && selectedSectionId ? [selectedSectionId] : [],
      courses: [],
      users: [],
    });
  }, [narrowMode, onChange, roleMode, selectedClassId, selectedPersons.length, selectedSectionId]);

  const removePerson = (personId: string) => {
    const next = selectedPersons.filter((p) => personKey(p) !== personId);
    setSelectedPersons(next);
    updateScope(next);
  };

  const handleRoleChange = (nextRole: RoleMode) => {
    setRoleMode(nextRole);
    setNarrowMode("all");
    setSelectedClassId("");
    setSelectedSectionId("");
    resetPersonSearch();
  };

  const handleNarrowChange = (nextMode: NarrowMode) => {
    setNarrowMode(nextMode);
    setSelectedClassId("");
    setSelectedSectionId("");
    resetPersonSearch();
  };

  const handleClassChange = (classId: string) => {
    setSelectedClassId(classId);
    setSelectedSectionId("");
    resetPersonSearch();
  };

  const handleSectionChange = (sectionId: string) => {
    setSelectedSectionId(sectionId);
    resetPersonSearch();
  };

  return (
    <div className="stagedAudiencePicker">
      {/* Stage 1: Role Selection */}
      <div className="stage">
        <label htmlFor={roleSelectId.current}>{t("targetAudienceLabel")}</label>
        <Select id={roleSelectId.current} value={roleMode} onChange={(e) => handleRoleChange(e.target.value as RoleMode)}>
          <option value="teachers">{t("teachers")}</option>
          <option value="students">{t("students")}</option>
          <option value="guardians">{t("guardians")}</option>
        </Select>
      </div>

      {/* Stage 2: Narrow by Class/Section */}
      <div className="stage">
        <label htmlFor={narrowSelectId.current}>{t("narrowByLabel", "Narrow by")}</label>
        <Select id={narrowSelectId.current} value={narrowMode} onChange={(e) => handleNarrowChange(e.target.value as NarrowMode)}>
          <option value="all">{t("allLabel", "All")}</option>
          <option value="classes">{t("classesLabel", "Classes")}</option>
          <option value="sections">{t("sectionsCol", "Sections")}</option>
        </Select>
        {(narrowMode === "classes" || narrowMode === "sections") && (
          <Select aria-label={t("allClasses", "All classes")} value={selectedClassId} onChange={(e) => handleClassChange(e.target.value)}>
            <option value="">{t("allClasses", "All classes")}</option>
            {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        )}
        {narrowMode === "sections" && selectedClassId && (
          <Select aria-label={t("allSections", "All sections")} value={selectedSectionId} onChange={(e) => handleSectionChange(e.target.value)}>
            <option value="">{t("allSections", "All sections")}</option>
            {(sections[selectedClassId] ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
        )}
      </div>

      {/* Stage 3: Person Selection */}
      <div className="stage">
        <label>{t("selectPersonsLabel", "Select persons")}</label>
        <div className="peopleMultiSelect" ref={pickerRef}>
          <button
            ref={triggerRef}
            type="button"
            className="peopleMultiSelectTrigger"
            aria-haspopup="listbox"
            aria-expanded={isPeopleDropdownOpen}
            aria-controls={isPeopleDropdownOpen ? listboxId.current : undefined}
            onClick={() => setIsPeopleDropdownOpen((open) => !open)}
            onKeyDown={handlePeoplePickerKeyDown}
          >
            <span className="peopleMultiSelectSummary">{selectedSummary}</span>
            <ChevronDown size={16} aria-hidden="true" />
          </button>

          {selectedPersons.length > 0 && (
            <div className="selectedChips" aria-label={t("selectedPeopleCount", { count: selectedPersons.length, defaultValue: "Selected people" })}>
              {selectedPersons.map((p) => (
                <span key={personKey(p)} className="chip">
                  {p.name}
                  <button type="button" aria-label={t("removePersonLabel", { name: p.name, defaultValue: `Remove ${p.name}` })} onClick={() => removePerson(personKey(p))}>
                    <X size={13} />
                  </button>
                </span>
              ))}
            </div>
          )}

          {isPeopleDropdownOpen && (
            <div className="peopleMultiSelectMenu" style={peopleDropdownStyle}>
              <div className="peopleMultiSelectSearch">
                <Search size={16} aria-hidden="true" />
                <input
                  ref={searchInputRef}
                  type="search"
                  aria-label={t("searchPlaceholder", "Search...")}
                  aria-controls={listboxId.current}
                  aria-activedescendant={filteredPersons[activeOptionIndex] ? `${listboxId.current}-${filteredPersons[activeOptionIndex].id}` : undefined}
                  placeholder={t("searchPlaceholder", "Search...")}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={handlePeoplePickerKeyDown}
                />
              </div>

              <div id={listboxId.current} className="peopleMultiSelectList" role="listbox" aria-multiselectable="true">
                {isLoading && <p className="peopleMultiSelectState">{t("loadingLabel", "Loading...")}</p>}
                {!isLoading && filteredPersons.length === 0 && <p className="peopleMultiSelectState">{t("noResults", "No results")}</p>}
                {!isLoading && filteredPersons.map((person, index) => {
                  const selected = selectedPersons.some((p) => personKey(p) === personKey(person));
                  return (
                    <button
                      key={person.id}
                      id={`${listboxId.current}-${person.id}`}
                      type="button"
                      role="option"
                      aria-selected={selected}
                      className={`peopleMultiSelectOption${selected ? " selected" : ""}${index === activeOptionIndex ? " active" : ""}`}
                      onClick={() => togglePerson(person)}
                      onMouseEnter={() => setActiveOptionIndex(index)}
                    >
                      <span className="peopleMultiSelectCheck">{selected && <Check size={14} />}</span>
                      <span className="peopleMultiSelectPerson">
                        <strong>{person.name}</strong>
                        <small>{t(person.role)}</small>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
