import { useEffect, useMemo, useState } from "react";
import { Plus, Search } from "lucide-react";

import { academicsApi, operationsApi, peopleApi, type AcademicClass, type Leave, type Student, type Teacher } from "../lib/endpoints";
import { useAuth } from "../lib/AuthContext";
import { cachedFetch } from "../lib/offlineCache";
import { SearchDropdown } from "./SearchDropdown";
import { Input, Select } from "./ui/Field";


function displayType(type: string | null | undefined): string {
  if (!type) return "Unknown";
  return `${type.charAt(0).toUpperCase()}${type.slice(1)}`;
}

function resolvePerson(record: Leave, personByUserId: Map<string, { name: string; role: string }>) {
  const fallbackPerson = personByUserId.get(record.user_id);
  return {
    name: record.person_name ?? fallbackPerson?.name ?? "Unknown person",
    type: record.person_type ?? fallbackPerson?.role,
  };
}

type PersonType = "" | "teacher" | "student";

type PersonOption = {
  userId: string;
  name: string;
  type: Exclude<PersonType, "">;
  code: string;
};

export function LeaveView() {
  const { hasPermission, user } = useAuth();
  const canManage = hasPermission("leave.manage");
  const [leave, setLeave] = useState<Leave[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [classes, setClasses] = useState<AcademicClass[]>([]);
  const [tab, setTab] = useState<"all" | "teacher" | "student">("all");
  const [filters, setFilters] = useState({ status: "", class_id: "", date_from: "", date_to: "" });
  const [form, setForm] = useState<{ user_id?: string; start_date: string; end_date: string; reason: string }>({
    user_id: "",
    start_date: "",
    end_date: "",
    reason: "",
  });
  const [personType, setPersonType] = useState<PersonType>("");
  const [personSearchDraft, setPersonSearchDraft] = useState("");
  const [searchDraft, setSearchDraft] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [error, setError] = useState("");

  const load = async () => {
    const params: Parameters<typeof operationsApi.listLeave>[0] = {};
    if (canManage && tab !== "all") params.person_type = tab;
    if (filters.status) params.status = filters.status;
    if (filters.class_id) params.class_id = filters.class_id;
    if (filters.date_from) params.date_from = filters.date_from;
    if (filters.date_to) params.date_to = filters.date_to;
    const hasFilters = Object.keys(params).length > 0;
    if (hasFilters) {
      setLeave(await operationsApi.listLeave(params));
      return;
    }
    const cacheKey = canManage ? "leave:all" : `leave:${user?.id ?? "me"}`;
    const { data } = await cachedFetch(cacheKey, () => operationsApi.listLeave());
    setLeave(data);
  };

  useEffect(() => {
    if (!user) return;
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canManage, user?.id, tab, filters]);

  useEffect(() => {
    if (!canManage) return;
    void academicsApi.listClasses().then(setClasses).catch(() => setClasses([]));
    void Promise.allSettled([peopleApi.listTeachers(), peopleApi.listStudents()]).then(([teacherResult, studentResult]) => {
      if (teacherResult.status === "fulfilled") setTeachers(teacherResult.value);
      if (studentResult.status === "fulfilled") setStudents(studentResult.value);
    });
  }, [canManage]);

  const personByUserId = useMemo(() => {
    const people = new Map<string, { name: string; role: string }>();
    for (const teacher of teachers) people.set(teacher.user_id, { name: teacher.name, role: "teacher" });
    for (const student of students) people.set(student.user_id, { name: student.name, role: "student" });
    return people;
  }, [teachers, students]);

  const personOptions = useMemo<PersonOption[]>(() => [
    ...teachers.map((teacher) => ({
      userId: teacher.user_id,
      name: teacher.name,
      type: "teacher" as const,
      code: teacher.employee_code,
    })),
    ...students.map((student) => ({
      userId: student.user_id,
      name: student.name,
      type: "student" as const,
      code: student.admission_number,
    })),
  ], [students, teachers]);

  const filteredPersonOptions = useMemo(() => {
    if (!personType) return [];
    const query = personSearchDraft.trim().toLowerCase();
    const typedPeople = personOptions.filter((person) => person.type === personType);
    if (!query) return typedPeople;
    return typedPeople.filter((person) => (
      [person.name, person.code, person.type].some((value) => value.toLowerCase().includes(query))
    ));
  }, [personOptions, personSearchDraft, personType]);

  const filteredLeave = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return leave;

    return leave.filter((record) => {
      const person = resolvePerson(record, personByUserId);
      return [
        person.name,
        displayType(person.type),
        record.start_date,
        record.end_date,
        record.reason ?? "",
        displayType(record.status),
      ].some((value) => value.toLowerCase().includes(query));
    });
  }, [leave, personByUserId, searchQuery]);

  const resetPersonSearch = () => {
    setPersonSearchDraft("");
    setForm({ ...form, user_id: "" });
  };

  return (
    <section className="modulePanel">
      <div className="moduleHeader">
        <h2>Leave</h2>
        <p className="notice">{canManage ? "Teacher and student leave requests." : "Request leave and track its review status."}</p>
      </div>

      <form
        className="inlineForm"
        onSubmit={async (e) => {
          e.preventDefault();
          setError("");
          if (canManage && !form.user_id) {
            setError("Select a person");
            return;
          }
          try {
            await operationsApi.createLeave({
              start_date: form.start_date,
              end_date: form.end_date,
              reason: form.reason || undefined,
              ...(canManage ? { user_id: form.user_id } : {}),
            });
            setForm({ user_id: "", start_date: "", end_date: "", reason: "" });
            setPersonType("");
            setPersonSearchDraft("");
            await load();
          } catch (err: any) {
            setError(err.response?.data?.detail ?? "Failed to submit leave");
          }
        }}
      >
        {canManage && (
          <>
            <label>
              Person type
              <Select
                required
                value={personType}
                onChange={(e) => {
                  setPersonType(e.target.value as PersonType);
                  resetPersonSearch();
                }}
              >
                <option value="">Select type...</option>
                <option value="teacher">Teacher</option>
                <option value="student">Student</option>
              </Select>
            </label>
            <SearchDropdown
              id="leave-person-search"
              label="Find person"
              disabled={!personType}
              placeholder={personType === "teacher" ? "Name or employee code" : personType === "student" ? "Name or admission #" : "Select type first"}
              items={filteredPersonOptions}
              value={personSearchDraft}
              getKey={(person) => person.userId}
              getLabel={(person) => person.name}
              getDescription={(person) => `${displayType(person.type)} · ${person.code}`}
              onQueryChange={(query) => {
                setPersonSearchDraft(query);
                setForm({ ...form, user_id: "" });
              }}
              onSelect={(person) => {
                setPersonSearchDraft(`${person.name} (${person.code})`);
                setForm({ ...form, user_id: person.userId });
              }}
              emptyLabel={personType ? "No matching people" : "Select type first"}
            />
            {(personSearchDraft || form.user_id) && (
              <div className="headerActions">
                <button
                  className="secondaryAction"
                  type="button"
                  onClick={resetPersonSearch}
                >
                  Clear
                </button>
              </div>
            )}
          </>
        )}
        <label>
          Start
          <Input required type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} />
        </label>
        <label>
          End
          <Input required type="date" value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} />
        </label>
        <label>
          Reason
          <Select required value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })}>
            <option value="">Select reason...</option>
            <option value="Sick Leave">Sick Leave</option>
            <option value="Casual Leave">Casual Leave</option>
            <option value="Maternity Leave">Maternity Leave</option>
            <option value="Paternity Leave">Paternity Leave</option>
            <option value="Bereavement Leave">Bereavement Leave</option>
            <option value="Unpaid Leave">Unpaid Leave</option>
            <option value="Other">Other</option>
          </Select>
        </label>
        <div className="formActions">
          <button className="primaryAction" type="submit"><Plus size={16} /> Request leave</button>
        </div>
      </form>

      {error && <p className="notice" style={{ color: "var(--rose)" }}>{error}</p>}

      {canManage && (
        <div className="filterBar">
          <button className={tab === "all" ? "primaryAction" : "secondaryAction"} type="button" onClick={() => setTab("all")}>All</button>
          <button className={tab === "teacher" ? "primaryAction" : "secondaryAction"} type="button" onClick={() => setTab("teacher")}>Teachers</button>
          <button className={tab === "student" ? "primaryAction" : "secondaryAction"} type="button" onClick={() => setTab("student")}>Students</button>
          <Select value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}>
            <option value="">Any status</option>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
          </Select>
          {tab === "student" && (
            <Select value={filters.class_id} onChange={(e) => setFilters({ ...filters, class_id: e.target.value })}>
              <option value="">All classes</option>
              {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          )}
          <Input type="date" value={filters.date_from} onChange={(e) => setFilters({ ...filters, date_from: e.target.value })} />
          <Input type="date" value={filters.date_to} onChange={(e) => setFilters({ ...filters, date_to: e.target.value })} />
        </div>
      )}

      <form
        className="moduleToolbar"
        onSubmit={(e) => {
          e.preventDefault();
          setSearchQuery(searchDraft);
        }}
      >
        <label className="searchBox">
          Search leave
          <Input
            placeholder="Name, type, status, date, or reason"
            value={searchDraft}
            onChange={(e) => setSearchDraft(e.target.value)}
          />
        </label>
        <div className="formActions">
          <button className="primaryAction" type="submit"><Search size={16} /> Search</button>
          {searchQuery && (
            <button
              className="secondaryAction"
              type="button"
              onClick={() => {
                setSearchDraft("");
                setSearchQuery("");
              }}
            >
              Clear
            </button>
          )}
        </div>
      </form>

      <div className="dataTable">
        <div className="dataRow header">
          <span>Person</span>
          <span>Type</span>
          <span>Start</span>
          <span>End</span>
          <span>Reason</span>
          <span>Status</span>
        </div>
        {leave.length === 0 && <p className="emptyState">No leave records.</p>}
        {leave.length > 0 && filteredLeave.length === 0 && <p className="emptyState">No leave records match this search.</p>}
        {filteredLeave.map((record) => {
          const person = resolvePerson(record, personByUserId);

          return (
            <div className="dataRow" key={record.id}>
              <span>{person.name}</span>
              <span>{displayType(person.type)}</span>
              <span>{record.start_date}</span>
              <span>{record.end_date}</span>
              <span>{record.reason || "-"}</span>
              <span>
                {canManage ? (
                  <Select
                    value={record.status}
                    onChange={async (event) => {
                      await operationsApi.setLeaveStatus(record.id, event.target.value);
                      await load();
                    }}
                  >
                    <option value="pending">Pending</option>
                    <option value="approved">Approved</option>
                    <option value="rejected">Rejected</option>
                  </Select>
                ) : (
                  displayType(record.status)
                )}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
