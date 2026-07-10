import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Plus, Search, XCircle } from "lucide-react";

import { operationsApi, peopleApi, type Leave, type Student, type Teacher } from "../lib/endpoints";
import { useAuth } from "../lib/AuthContext";
import { cachedFetch } from "../lib/offlineCache";

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

export function LeaveView() {
  const { hasPermission } = useAuth();
  const canManage = hasPermission("timetable.manage");
  const [leave, setLeave] = useState<Leave[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [form, setForm] = useState({ user_id: "", start_date: "", end_date: "", reason: "" });
  const [personSearchDraft, setPersonSearchDraft] = useState("");
  const [personSearchQuery, setPersonSearchQuery] = useState("");
  const [searchDraft, setSearchDraft] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [error, setError] = useState("");

  const load = async () => {
    const { data } = await cachedFetch("leave", () => operationsApi.listLeave());
    setLeave(data);
  };

  useEffect(() => {
    if (!canManage) return;
    void load();
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

  const filteredTeachers = useMemo(() => {
    const query = personSearchQuery.trim().toLowerCase();
    if (!query) return teachers;
    return teachers.filter((teacher) => (
      [teacher.name, teacher.employee_code, "teacher"].some((value) => value.toLowerCase().includes(query))
    ));
  }, [personSearchQuery, teachers]);

  const filteredStudents = useMemo(() => {
    const query = personSearchQuery.trim().toLowerCase();
    if (!query) return students;
    return students.filter((student) => (
      [student.name, student.admission_number, "student"].some((value) => value.toLowerCase().includes(query))
    ));
  }, [personSearchQuery, students]);

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

  if (!canManage) {
    return (
      <section className="modulePanel">
        <div className="moduleHeader">
          <h2>Leave</h2>
          <p className="notice">Only users with timetable management permission can manage leave requests.</p>
        </div>
      </section>
    );
  }

  return (
    <section className="modulePanel">
      <div className="moduleHeader">
        <h2>Leave</h2>
        <p className="notice">Teacher and student leave requests.</p>
      </div>

      <form
        className="inlineForm"
        onSubmit={async (e) => {
          e.preventDefault();
          setError("");
          try {
            await operationsApi.createLeave(form);
            setForm({ user_id: "", start_date: "", end_date: "", reason: "" });
            setPersonSearchDraft("");
            setPersonSearchQuery("");
            await load();
          } catch (err: any) {
            setError(err.response?.data?.detail ?? "Failed to submit leave");
          }
        }}
      >
        <label>
          Find person
          <input
            placeholder="Name, code, admission #, or type"
            value={personSearchDraft}
            onChange={(e) => setPersonSearchDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                setForm({ ...form, user_id: "" });
                setPersonSearchQuery(personSearchDraft);
              }
            }}
          />
        </label>
        <div className="headerActions">
          <button
            className="secondaryAction"
            type="button"
            onClick={() => {
              setForm({ ...form, user_id: "" });
              setPersonSearchQuery(personSearchDraft);
            }}
          >
            <Search size={16} /> Search
          </button>
          {personSearchQuery && (
            <button
              className="secondaryAction"
              type="button"
              onClick={() => {
                setPersonSearchDraft("");
                setPersonSearchQuery("");
                setForm({ ...form, user_id: "" });
              }}
            >
              Clear
            </button>
          )}
        </div>
        <label>
          Person
          <select required value={form.user_id} onChange={(e) => setForm({ ...form, user_id: e.target.value })}>
            <option value="">Select...</option>
            <optgroup label="Teachers">
              {filteredTeachers.map((teacher) => (
                <option key={teacher.user_id} value={teacher.user_id}>{teacher.name}</option>
              ))}
              {personSearchQuery && filteredTeachers.length === 0 && <option disabled>No matching teachers</option>}
            </optgroup>
            <optgroup label="Students">
              {filteredStudents.map((student) => (
                <option key={student.user_id} value={student.user_id}>{student.name}</option>
              ))}
              {personSearchQuery && filteredStudents.length === 0 && <option disabled>No matching students</option>}
            </optgroup>
          </select>
        </label>
        <label>
          Start
          <input required type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} />
        </label>
        <label>
          End
          <input required type="date" value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} />
        </label>
        <label>
          Reason
          <input value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} />
        </label>
        <div className="formActions">
          <button className="primaryAction" type="submit"><Plus size={16} /> Request leave</button>
        </div>
      </form>

      {error && <p className="notice" style={{ color: "var(--rose)" }}>{error}</p>}

      <form
        className="moduleToolbar"
        onSubmit={(e) => {
          e.preventDefault();
          setSearchQuery(searchDraft);
        }}
      >
        <label className="searchBox">
          Search leave
          <input
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
          <span></span>
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
              <span>{displayType(record.status)}</span>
              <span>
                {canManage && record.status === "pending" && (
                  <>
                    <button className="tableAction" type="button" onClick={async () => { await operationsApi.setLeaveStatus(record.id, "approved"); await load(); }}>
                      <CheckCircle2 size={14} />
                    </button>
                    <button className="tableAction" type="button" onClick={async () => { await operationsApi.setLeaveStatus(record.id, "rejected"); await load(); }}>
                      <XCircle size={14} />
                    </button>
                  </>
                )}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
