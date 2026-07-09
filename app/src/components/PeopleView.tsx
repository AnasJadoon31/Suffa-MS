import { useEffect, useState } from "react";
import { GraduationCap, KeyRound, Search, UserPlus, UserRoundCog, UsersRound } from "lucide-react";
import { useTranslation } from "react-i18next";

import { useAuth } from "../lib/AuthContext";
import { type Guardian, type Student, type Teacher, messagingApi, peopleApi } from "../lib/endpoints";

function SendCredentialsButton({
  subjectType,
  subjectId,
  setPasswordUrl,
}: Readonly<{ subjectType: "student" | "teacher"; subjectId: string; setPasswordUrl: string }>) {
  const { t } = useTranslation();
  const [error, setError] = useState("");

  const send = async () => {
    setError("");
    try {
      const link = await messagingApi.sendCredentials({
        subject_type: subjectType,
        subject_id: subjectId,
        set_password_url: setPasswordUrl,
      });
      window.open(link.url, "_blank", "noopener,noreferrer");
    } catch (err: any) {
      setError(err.response?.data?.detail ?? t("failedSendCredentials"));
    }
  };

  return (
    <>
      <button className="secondaryAction" type="button" onClick={() => void send()}>
        {t("sendCredentialsBtn")}
      </button>
      {error && <span className="notice" style={{ color: "var(--rose)" }}>{error}</span>}
    </>
  );
}

function ReissueCredentialsButton({
  subjectType,
  subjectId,
}: Readonly<{ subjectType: "student" | "teacher"; subjectId: string }>) {
  const [state, setState] = useState<"idle" | "copied" | "error">("idle");

  const reissue = async () => {
    try {
      const result =
        subjectType === "teacher"
          ? await peopleApi.reissueTeacherCredentials(subjectId)
          : await peopleApi.reissueStudentCredentials(subjectId);
      const fullUrl = `${window.location.origin}${result.set_password_url}`;
      await navigator.clipboard.writeText(fullUrl);
      setState("copied");
      // Also offer the WhatsApp dispatch with the fresh link.
      try {
        const link = await messagingApi.sendCredentials({
          subject_type: subjectType,
          subject_id: subjectId,
          set_password_url: fullUrl,
        });
        window.open(link.url, "_blank", "noopener,noreferrer");
      } catch {
        // No guardian/number on file — link is still on the clipboard.
      }
      setTimeout(() => setState("idle"), 3000);
    } catch {
      setState("error");
      setTimeout(() => setState("idle"), 3000);
    }
  };

  return (
    <button className="tableAction" type="button" title="Generate a fresh set-password link (valid 24h)" onClick={() => void reissue()}>
      <KeyRound size={14} /> {state === "copied" ? "Link copied!" : state === "error" ? "Failed" : "Login link"}
    </button>
  );
}

type Tab = "teachers" | "students" | "guardians";

export function PeopleView() {
  const { t } = useTranslation();
  const { hasPermission } = useAuth();
  const [tab, setTab] = useState<Tab>("teachers");

  return (
    <section className="modulePanel">
      <div className="moduleHeader">
        <h2>{t("peopleTitle")}</h2>
        <p className="notice">{t("peopleSubtitle")}</p>
      </div>
      <div className="formActions" style={{ marginBottom: 16 }}>
        <button className={tab === "teachers" ? "primaryAction" : "secondaryAction"} type="button" onClick={() => setTab("teachers")}>
          <UserRoundCog size={16} /> {t("teachers")}
        </button>
        <button className={tab === "students" ? "primaryAction" : "secondaryAction"} type="button" onClick={() => setTab("students")}>
          <GraduationCap size={16} /> {t("students")}
        </button>
        <button className={tab === "guardians" ? "primaryAction" : "secondaryAction"} type="button" onClick={() => setTab("guardians")}>
          <UsersRound size={16} /> {t("guardians")}
        </button>
      </div>
      {tab === "teachers" && <TeachersTab canCreate={hasPermission("teachers.add")} />}
      {tab === "students" && <StudentsTab canCreate={hasPermission("students.add")} />}
      {tab === "guardians" && <GuardiansTab canCreate={hasPermission("students.add")} />}
    </section>
  );
}

function TeachersTab({ canCreate }: Readonly<{ canCreate: boolean }>) {
  const { t } = useTranslation();
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState({ username: "", name: "", whatsapp_number: "" });
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [justCreated, setJustCreated] = useState<Teacher | null>(null);

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
      setNotice(t("createdSetPasswordLink", { code: created.employee_code, url: created.set_password_url }));
      setJustCreated(created);
      setForm({ username: "", name: "", whatsapp_number: "" });
      await load();
    } catch (err: any) {
      setError(err.response?.data?.detail ?? t("failedCreateTeacher"));
    }
  };

  return (
    <>
      <div className="moduleToolbar">
        <div className="searchBox">
          <label htmlFor="teacher-search">{t("searchLabel")}</label>
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
            {t("usernameLabel")}
            <input required value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} />
          </label>
          <label>
            {t("fullNameLabel")}
            <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </label>
          <label>
            {t("whatsappNumberLabel")}
            <input value={form.whatsapp_number} onChange={(e) => setForm({ ...form, whatsapp_number: e.target.value })} />
          </label>
          <div className="formActions">
            <button className="primaryAction" type="submit">
              <UserPlus size={16} /> {t("addTeacherBtn")}
            </button>
          </div>
        </form>
      )}
      {error && <p className="notice" style={{ color: "var(--rose)" }}>{error}</p>}
      {notice && <p className="notice">{notice}</p>}
      {justCreated?.set_password_url && (
        <SendCredentialsButton
          subjectType="teacher"
          subjectId={justCreated.id}
          setPasswordUrl={justCreated.set_password_url}
        />
      )}
      <div className="dataTable">
        <div className="dataRow header">
          <span>{t("codeCol")}</span>
          <span>{t("nameLabel")}</span>
          <span>{t("whatsappCol")}</span>
          <span>{t("statusCol")}</span>
          <span></span>
        </div>
        {teachers.length === 0 && <p className="emptyState">{t("noTeachersYet")}</p>}
        {teachers.map((t) => (
          <div className="dataRow" key={t.id}>
            <span>{t.employee_code}</span>
            <span>{t.name}</span>
            <span>{t.whatsapp_number || "—"}</span>
            <span>{t.status}</span>
            <span>
              <ReissueCredentialsButton subjectType="teacher" subjectId={t.id} />
            </span>
          </div>
        ))}
      </div>
    </>
  );
}

function StudentsTab({ canCreate }: Readonly<{ canCreate: boolean }>) {
  const { t } = useTranslation();
  const [students, setStudents] = useState<Student[]>([]);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState({ username: "", name: "", date_of_birth: "" });
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [justCreated, setJustCreated] = useState<Student | null>(null);

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
      setNotice(t("createdSetPasswordLink", { code: created.admission_number, url: created.set_password_url }));
      setJustCreated(created);
      setForm({ username: "", name: "", date_of_birth: "" });
      await load();
    } catch (err: any) {
      setError(err.response?.data?.detail ?? t("failedCreateStudent"));
    }
  };

  return (
    <>
      <div className="moduleToolbar">
        <div className="searchBox">
          <label htmlFor="student-search">{t("searchLabel")}</label>
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
            {t("usernameLabel")}
            <input required value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} />
          </label>
          <label>
            {t("fullNameLabel")}
            <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </label>
          <label>
            {t("dobLabel")}
            <input required type="date" value={form.date_of_birth} onChange={(e) => setForm({ ...form, date_of_birth: e.target.value })} />
          </label>
          <div className="formActions">
            <button className="primaryAction" type="submit">
              <UserPlus size={16} /> {t("addStudentBtn")}
            </button>
          </div>
        </form>
      )}
      {error && <p className="notice" style={{ color: "var(--rose)" }}>{error}</p>}
      {notice && <p className="notice">{notice}</p>}
      {justCreated?.set_password_url && (
        <SendCredentialsButton
          subjectType="student"
          subjectId={justCreated.id}
          setPasswordUrl={justCreated.set_password_url}
        />
      )}
      <div className="dataTable">
        <div className="dataRow header">
          <span>{t("admissionNumberCol")}</span>
          <span>{t("nameLabel")}</span>
          <span>{t("dobCol")}</span>
          <span>{t("portalCol")}</span>
          <span>{t("statusCol")}</span>
          <span></span>
        </div>
        {students.length === 0 && <p className="emptyState">{t("noStudentsYet")}</p>}
        {students.map((s) => (
          <div className="dataRow" key={s.id}>
            <span>{s.admission_number}</span>
            <span>{s.name}</span>
            <span>{s.date_of_birth}</span>
            <span>{s.portal_enabled ? t("enabledLabel") : t("disabledLabel")}</span>
            <span>{s.status}</span>
            <span>
              {s.portal_enabled && <ReissueCredentialsButton subjectType="student" subjectId={s.id} />}
            </span>
          </div>
        ))}
      </div>
    </>
  );
}

function GuardiansTab({ canCreate }: Readonly<{ canCreate: boolean }>) {
  const { t } = useTranslation();
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
      setError(err.response?.data?.detail ?? t("failedCreateGuardian"));
    }
  };

  return (
    <>
      <div className="moduleToolbar">
        <div className="searchBox">
          <label htmlFor="guardian-search">
            <Search size={14} /> {t("searchLabel")}
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
            {t("nameLabel")}
            <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </label>
          <label>
            {t("relationshipLabel")}
            <input required value={form.relationship} onChange={(e) => setForm({ ...form, relationship: e.target.value })} />
          </label>
          <label>
            {t("phoneWhatsappLabel")}
            <input required value={form.phone_numbers} onChange={(e) => setForm({ ...form, phone_numbers: e.target.value })} />
          </label>
          <div className="formActions">
            <button className="primaryAction" type="submit">
              <UserPlus size={16} /> {t("addGuardianBtn")}
            </button>
          </div>
        </form>
      )}
      {error && <p className="notice" style={{ color: "var(--rose)" }}>{error}</p>}
      <div className="dataTable">
        <div className="dataRow header">
          <span>{t("nameLabel")}</span>
          <span>{t("relationshipCol")}</span>
          <span>{t("phoneCol")}</span>
          <span>{t("languageCol")}</span>
        </div>
        {guardians.length === 0 && <p className="emptyState">{t("noGuardiansYet")}</p>}
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
