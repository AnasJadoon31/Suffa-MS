import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Plus, XCircle } from "lucide-react";

import { operationsApi, peopleApi, type Leave, type Student, type Teacher } from "../lib/endpoints";
import { useAuth } from "../lib/AuthContext";
import { cachedFetch } from "../lib/offlineCache";

function displayType(type: string | null | undefined): string {
  if (!type) return "Unknown";
  return `${type.charAt(0).toUpperCase()}${type.slice(1)}`;
}

export function LeaveView() {
  const { hasPermission } = useAuth();
  const canManage = hasPermission("timetable.manage");
  const [leave, setLeave] = useState<Leave[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [form, setForm] = useState({ user_id: "", start_date: "", end_date: "", reason: "" });
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
            await load();
          } catch (err: any) {
            setError(err.response?.data?.detail ?? "Failed to submit leave");
          }
        }}
      >
        <label>
          Person
          <select required value={form.user_id} onChange={(e) => setForm({ ...form, user_id: e.target.value })}>
            <option value="">Select...</option>
            <optgroup label="Teachers">
              {teachers.map((teacher) => (
                <option key={teacher.user_id} value={teacher.user_id}>{teacher.name}</option>
              ))}
            </optgroup>
            <optgroup label="Students">
              {students.map((student) => (
                <option key={student.user_id} value={student.user_id}>{student.name}</option>
              ))}
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
        {leave.map((record) => {
          const fallbackPerson = personByUserId.get(record.user_id);
          const personName = record.person_name ?? fallbackPerson?.name ?? "Unknown person";
          const personType = record.person_type ?? fallbackPerson?.role;

          return (
            <div className="dataRow" key={record.id}>
              <span>{personName}</span>
              <span>{displayType(personType)}</span>
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
