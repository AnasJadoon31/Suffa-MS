import { useEffect, useState } from "react";
import { GraduationCap, Search, UserPlus, UserRoundCog, UsersRound } from "lucide-react";

import { useAuth } from "../lib/AuthContext";
import { type Guardian, type Student, type Teacher, peopleApi } from "../lib/endpoints";

type Tab = "teachers" | "students" | "guardians";

export function PeopleView() {
  const { hasPermission } = useAuth();
  const [tab, setTab] = useState<Tab>("teachers");

  return (
    <section className="modulePanel">
      <div className="moduleHeader">
        <h2>People</h2>
        <p className="notice">Teachers, students, and guardians — real records, real logins.</p>
      </div>
      <div className="formActions" style={{ marginBottom: 16 }}>
        <button className={tab === "teachers" ? "primaryAction" : "secondaryAction"} type="button" onClick={() => setTab("teachers")}>
          <UserRoundCog size={16} /> Teachers
        </button>
        <button className={tab === "students" ? "primaryAction" : "secondaryAction"} type="button" onClick={() => setTab("students")}>
          <GraduationCap size={16} /> Students
        </button>
        <button className={tab === "guardians" ? "primaryAction" : "secondaryAction"} type="button" onClick={() => setTab("guardians")}>
          <UsersRound size={16} /> Guardians
        </button>
      </div>
      {tab === "teachers" && <TeachersTab canCreate={hasPermission("teachers.add")} />}
      {tab === "students" && <StudentsTab canCreate={hasPermission("students.add")} />}
      {tab === "guardians" && <GuardiansTab canCreate={hasPermission("students.add")} />}
    </section>
  );
}

function TeachersTab({ canCreate }: Readonly<{ canCreate: boolean }>) {
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState({ username: "", name: "", whatsapp_number: "" });
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const load = async (query?: string) => setTeachers(await peopleApi.listTeachers(query || undefined));
  useEffect(() => {
    void load();
  }, []);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setNotice("");
    try {
      const created = await peopleApi.createTeacher(form);
      setNotice(`Created ${created.employee_code} — set-password link: ${created.set_password_url}`);
      setForm({ username: "", name: "", whatsapp_number: "" });
      await load();
    } catch (err: any) {
      setError(err.response?.data?.detail ?? "Failed to create teacher");
    }
  };

  return (
    <>
      <div className="moduleToolbar">
        <div className="searchBox">
          <label htmlFor="teacher-search">Search</label>
          <input
            id="teacher-search"
            placeholder="Name or employee code"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              void load(e.target.value);
            }}
          />
        </div>
      </div>
      {canCreate && (
        <form className="inlineForm" onSubmit={onSubmit}>
          <label>
            Username
            <input required value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} />
          </label>
          <label>
            Full name
            <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </label>
          <label>
            WhatsApp number
            <input value={form.whatsapp_number} onChange={(e) => setForm({ ...form, whatsapp_number: e.target.value })} />
          </label>
          <div className="formActions">
            <button className="primaryAction" type="submit">
              <UserPlus size={16} /> Add teacher
            </button>
          </div>
        </form>
      )}
      {error && <p className="notice" style={{ color: "var(--rose)" }}>{error}</p>}
      {notice && <p className="notice">{notice}</p>}
      <div className="dataTable">
        <div className="dataRow header">
          <span>Code</span>
          <span>Name</span>
          <span>WhatsApp</span>
          <span>Status</span>
        </div>
        {teachers.length === 0 && <p className="emptyState">No teachers yet.</p>}
        {teachers.map((t) => (
          <div className="dataRow" key={t.id}>
            <span>{t.employee_code}</span>
            <span>{t.name}</span>
            <span>{t.whatsapp_number || "—"}</span>
            <span>{t.status}</span>
          </div>
        ))}
      </div>
    </>
  );
}

function StudentsTab({ canCreate }: Readonly<{ canCreate: boolean }>) {
  const [students, setStudents] = useState<Student[]>([]);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState({ username: "", name: "", date_of_birth: "" });
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const load = async (query?: string) => setStudents(await peopleApi.listStudents(query || undefined));
  useEffect(() => {
    void load();
  }, []);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setNotice("");
    try {
      const created = await peopleApi.createStudent(form);
      setNotice(`Created ${created.admission_number} — set-password link: ${created.set_password_url}`);
      setForm({ username: "", name: "", date_of_birth: "" });
      await load();
    } catch (err: any) {
      setError(err.response?.data?.detail ?? "Failed to create student");
    }
  };

  return (
    <>
      <div className="moduleToolbar">
        <div className="searchBox">
          <label htmlFor="student-search">Search</label>
          <input
            id="student-search"
            placeholder="Name or admission number"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              void load(e.target.value);
            }}
          />
        </div>
      </div>
      {canCreate && (
        <form className="inlineForm" onSubmit={onSubmit}>
          <label>
            Username
            <input required value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} />
          </label>
          <label>
            Full name
            <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </label>
          <label>
            Date of birth
            <input required type="date" value={form.date_of_birth} onChange={(e) => setForm({ ...form, date_of_birth: e.target.value })} />
          </label>
          <div className="formActions">
            <button className="primaryAction" type="submit">
              <UserPlus size={16} /> Add student
            </button>
          </div>
        </form>
      )}
      {error && <p className="notice" style={{ color: "var(--rose)" }}>{error}</p>}
      {notice && <p className="notice">{notice}</p>}
      <div className="dataTable">
        <div className="dataRow header">
          <span>Admission #</span>
          <span>Name</span>
          <span>DOB</span>
          <span>Portal</span>
          <span>Status</span>
        </div>
        {students.length === 0 && <p className="emptyState">No students yet.</p>}
        {students.map((s) => (
          <div className="dataRow" key={s.id}>
            <span>{s.admission_number}</span>
            <span>{s.name}</span>
            <span>{s.date_of_birth}</span>
            <span>{s.portal_enabled ? "Enabled" : "Disabled"}</span>
            <span>{s.status}</span>
          </div>
        ))}
      </div>
    </>
  );
}

function GuardiansTab({ canCreate }: Readonly<{ canCreate: boolean }>) {
  const [guardians, setGuardians] = useState<Guardian[]>([]);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState({ name: "", relationship: "", phone_numbers: "" });
  const [error, setError] = useState("");

  const load = async (query?: string) => setGuardians(await peopleApi.listGuardians(query || undefined));
  useEffect(() => {
    void load();
  }, []);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    try {
      await peopleApi.createGuardian(form);
      setForm({ name: "", relationship: "", phone_numbers: "" });
      await load();
    } catch (err: any) {
      setError(err.response?.data?.detail ?? "Failed to create guardian");
    }
  };

  return (
    <>
      <div className="moduleToolbar">
        <div className="searchBox">
          <label htmlFor="guardian-search">
            <Search size={14} /> Search
          </label>
          <input id="guardian-search" placeholder="Name" value={search} onChange={(e) => {
            setSearch(e.target.value);
            void load(e.target.value);
          }} />
        </div>
      </div>
      {canCreate && (
        <form className="inlineForm" onSubmit={onSubmit}>
          <label>
            Name
            <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </label>
          <label>
            Relationship
            <input required value={form.relationship} onChange={(e) => setForm({ ...form, relationship: e.target.value })} />
          </label>
          <label>
            Phone (WhatsApp)
            <input required value={form.phone_numbers} onChange={(e) => setForm({ ...form, phone_numbers: e.target.value })} />
          </label>
          <div className="formActions">
            <button className="primaryAction" type="submit">
              <UserPlus size={16} /> Add guardian
            </button>
          </div>
        </form>
      )}
      {error && <p className="notice" style={{ color: "var(--rose)" }}>{error}</p>}
      <div className="dataTable">
        <div className="dataRow header">
          <span>Name</span>
          <span>Relationship</span>
          <span>Phone</span>
          <span>Language</span>
        </div>
        {guardians.length === 0 && <p className="emptyState">No guardians yet.</p>}
        {guardians.map((g) => (
          <div className="dataRow" key={g.id}>
            <span>{g.name}</span>
            <span>{g.relationship}</span>
            <span>{g.phone_numbers}</span>
            <span>{g.preferred_language}</span>
          </div>
        ))}
      </div>
    </>
  );
}
