import { useEffect, useState } from "react";
import { Eye, GraduationCap, HandCoins, KeyRound, Plus, UserPlus, UserRoundCog, UsersRound, X } from "lucide-react";
import { useTranslation } from "react-i18next";

import { useAuth } from "../lib/AuthContext";
import {
  attendanceApi,
  financeApi,
  messagingApi,
  peopleApi,
  type Donation,
  type Donor,
  type Guardian,
  type Payment,
  type PaymentCategory,
  type SalaryPayment,
  type Student,
  type Teacher,
} from "../lib/endpoints";
import { SearchDropdown } from "./SearchDropdown";
import { Input, Select } from "./ui/Field";
import { LoadingState } from "./ui/AsyncState";
import { DEFAULT_PAGE_SIZE, pageParams, PaginationControls, recoverEmptyPage, type PageState } from "./ui/Pagination";
import { AdmissionsView } from "./AdmissionsView";
import { useSessionReadOnly } from "./SessionSwitcher";

function SendCredentialsButton({
  subjectType,
  subjectId,
  setPasswordUrl,
}: Readonly<{ subjectType: "student" | "teacher"; subjectId: string; setPasswordUrl: string }>) {
  const { t } = useTranslation();
  const readOnly = useSessionReadOnly();
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
      <button className="secondaryAction" type="button" disabled={readOnly} onClick={() => void send()}>
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
  const { t } = useTranslation();
  const readOnly = useSessionReadOnly();
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
      try {
        const link = await messagingApi.sendCredentials({
          subject_type: subjectType,
          subject_id: subjectId,
          set_password_url: fullUrl,
        });
        window.open(link.url, "_blank", "noopener,noreferrer");
      } catch {
        // No number on file; the link is still on the clipboard.
      }
      setTimeout(() => setState("idle"), 3000);
    } catch {
      setState("error");
      setTimeout(() => setState("idle"), 3000);
    }
  };

  return (
    <button className="tableAction" type="button" disabled={readOnly} title={t("loginLinkTitle")} onClick={() => void reissue()}>
      <KeyRound size={14} /> {state === "copied" ? t("linkCopied") : state === "error" ? t("failedLabel") : t("loginLinkBtn")}
    </button>
  );
}

type Tab = "teachers" | "students" | "guardians" | "donators" | "admissions";

export function PeopleView({ initialTab = "teachers" }: Readonly<{ initialTab?: Tab }>) {
  const { t } = useTranslation();
  const { hasPermission } = useAuth();
  const readOnly = useSessionReadOnly();
  const [tab, setTab] = useState<Tab>(initialTab);
  const canFinance = !readOnly && hasPermission("finance.manage");
  const canSalary = !readOnly && hasPermission("teachers.salary.manage");

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
        {hasPermission("admissions.manage") && (
          <button className={tab === "admissions" ? "primaryAction" : "secondaryAction"} type="button" onClick={() => setTab("admissions")}>
            <GraduationCap size={16} /> {t("walkInAdmissions")}
          </button>
        )}
        {canFinance && (
          <button className={tab === "donators" ? "primaryAction" : "secondaryAction"} type="button" onClick={() => setTab("donators")}>
            <HandCoins size={16} /> {t("donatorsTab")}
          </button>
        )}
      </div>
      {tab === "teachers" && <TeachersTab canCreate={!readOnly && hasPermission("teachers.add")} canSalary={canSalary} />}
      {tab === "students" && <StudentsTab canCreate={!readOnly && hasPermission("students.add")} canFinance={canFinance} />}
      {tab === "guardians" && <GuardiansTab canCreate={!readOnly && hasPermission("students.add")} canSendCredentials={!readOnly && hasPermission("students.send_credentials")} />}
      {tab === "donators" && canFinance && <DonatorsTab />}
      {tab === "admissions" && hasPermission("admissions.manage") && <AdmissionsView section="registrations" />}
    </section>
  );
}

// ------------------------------------------------------------------ Teachers

function TeachersTab({ canCreate, canSalary }: Readonly<{ canCreate: boolean; canSalary: boolean }>) {
  const { t } = useTranslation();
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({
    username: "", name: "", whatsapp_number: "", qualifications: "", join_date: "",
    cnic: "", address: "", emergency_contact: "",
  });
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [justCreated, setJustCreated] = useState<Teacher | null>(null);
  const [detail, setDetail] = useState<Teacher | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [pagination, setPagination] = useState<PageState>({ page: 0, pageSize: DEFAULT_PAGE_SIZE });
  const [total, setTotal] = useState(0);

  const load = async (query = search) => {
    setIsLoading(true);
    try {
      const result = await peopleApi.listTeachersPage({ search: query || undefined, ...pageParams(pagination) });
      if (recoverEmptyPage(result, pagination, setPagination)) return;
      setTeachers(result.items);
      setTotal(result.total);
      setError("");
    } catch (err: any) {
      setError(err.response?.data?.detail ?? t("failedLoadTeachers"));
    } finally {
      setIsLoading(false);
    }
  };
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pagination]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setNotice("");
    try {
      const created = await peopleApi.createTeacher({
        username: form.username,
        name: form.name,
        whatsapp_number: form.whatsapp_number,
        qualifications: form.qualifications || undefined,
        join_date: form.join_date || undefined,
        cnic: form.cnic || undefined,
        address: form.address || undefined,
        emergency_contact: form.emergency_contact || undefined,
      });
      setNotice(t("createdSetPasswordLink", { code: created.employee_code, url: created.set_password_url }));
      setJustCreated(created);
      setForm({ username: "", name: "", whatsapp_number: "", qualifications: "", join_date: "", cnic: "", address: "", emergency_contact: "" });
      setShowCreate(false);
      await load();
    } catch (err: any) {
      setError(err.response?.data?.detail ?? t("failedCreateTeacher"));
    }
  };

  return (
    <>
      <div className="moduleToolbar">
        <SearchDropdown
          id="teacher-search"
          label={t("searchLabel")}
          placeholder={t("teacherSearchPlaceholder")}
          items={teachers}
          value={search}
          getKey={(teacher) => teacher.id}
          getLabel={(teacher) => teacher.name}
          getDescription={(teacher) => `${teacher.employee_code} · ${teacher.status}`}
          onQueryChange={(query) => {
            setSearch(query);
            if (pagination.page === 0) void load(query);
            else setPagination((current) => ({ ...current, page: 0 }));
          }}
          onSelect={(teacher) => {
            setSearch(`${teacher.name} (${teacher.employee_code})`);
            setTeachers([teacher]);
          }}
          emptyLabel={t("noTeachersYet")}
        />
        <div className="formActions">
          {search && (
            <button className="secondaryAction" type="button" onClick={() => { setSearch(""); setPagination((current) => ({ ...current, page: 0 })); void load(""); }}>
              {t("cancelBtn")}
            </button>
          )}
          {canCreate && (
            <button className="primaryAction" type="button" onClick={() => setShowCreate((v) => !v)}>
              <UserPlus size={16} /> {t("addTeacherBtn")}
            </button>
          )}
        </div>
      </div>

      {showCreate && canCreate && (
        <form className="inlineForm" onSubmit={onSubmit}>
          <label>{t("usernameLabel")}<Input required value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} /></label>
          <label>{t("fullNameLabel")}<Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
          <label>{t("whatsappNumberLabel")}<Input value={form.whatsapp_number} onChange={(e) => setForm({ ...form, whatsapp_number: e.target.value })} /></label>
          <label>{t("qualificationsLabel")}<Input value={form.qualifications} onChange={(e) => setForm({ ...form, qualifications: e.target.value })} /></label>
          <label>{t("joinDateLabel")}<Input type="date" value={form.join_date} onChange={(e) => setForm({ ...form, join_date: e.target.value })} /></label>
          <label>{t("cnicLabel")}<Input value={form.cnic} onChange={(e) => setForm({ ...form, cnic: e.target.value })} /></label>
          <label>{t("addressLabel")}<Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></label>
          <label>{t("emergencyContactLabel")}<Input value={form.emergency_contact} onChange={(e) => setForm({ ...form, emergency_contact: e.target.value })} /></label>
          <div className="formActions">
            <button className="primaryAction" type="submit"><UserPlus size={16} /> {t("addTeacherBtn")}</button>
          </div>
        </form>
      )}
      {error && <p className="notice" style={{ color: "var(--rose)" }}>{error}</p>}
      {notice && <p className="notice">{notice}</p>}
      {justCreated?.set_password_url && (
        <SendCredentialsButton subjectType="teacher" subjectId={justCreated.id} setPasswordUrl={justCreated.set_password_url} />
      )}

      <div className="dataTable">
        <div className="dataRow header">
          <span>{t("codeCol")}</span>
          <span>{t("nameLabel")}</span>
          <span>{t("whatsappCol")}</span>
          <span>{t("statusCol")}</span>
          <span></span>
        </div>
        {isLoading && <LoadingState />}
        {!isLoading && teachers.length === 0 && <p className="emptyState">{t("noTeachersYet")}</p>}
        {teachers.map((teacher) => (
          <div className="dataRow" key={teacher.id}>
            <span>{teacher.employee_code}</span>
            <span>{teacher.name}</span>
            <span>{teacher.whatsapp_number || "—"}</span>
            <span>{teacher.status}</span>
            <span>
              <button className="tableAction" type="button" title={t("viewBtn")} onClick={() => setDetail(teacher)}>
                <Eye size={14} />
              </button>
              <ReissueCredentialsButton subjectType="teacher" subjectId={teacher.id} />
            </span>
          </div>
        ))}
      </div>
      <PaginationControls state={pagination} total={total} onChange={setPagination} />

      {detail && <TeacherDetail teacher={detail} canSalary={canSalary} onClose={() => setDetail(null)} />}
    </>
  );
}

function TeacherDetail({
  teacher,
  canSalary,
  onClose,
}: Readonly<{ teacher: Teacher; canSalary: boolean; onClose: () => void }>) {
  const { t } = useTranslation();
  const [payments, setPayments] = useState<SalaryPayment[]>([]);
  const [payForm, setPayForm] = useState({ amount: "", payment_date: "", period_covered: "", method: "cash" });
  const [error, setError] = useState("");

  const load = async () => {
    if (!canSalary) return;
    try {
      setPayments(await financeApi.listSalaryPayments(teacher.id));
    } catch {
      setPayments([]);
    }
  };
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teacher.id]);

  return (
    <div className="modulePanel detailPanel">
      <div className="moduleHeader" style={{ display: "flex", justifyContent: "space-between" }}>
        <h3>{teacher.name} · {teacher.employee_code}</h3>
        <button className="tableAction" type="button" onClick={onClose}><X size={16} /></button>
      </div>
      <dl className="detailGrid">
        <dt>{t("whatsappCol")}</dt><dd>{teacher.whatsapp_number || "—"}</dd>
        <dt>{t("qualificationsLabel")}</dt><dd>{teacher.qualifications ?? "—"}</dd>
        <dt>{t("joinDateLabel")}</dt><dd>{teacher.join_date ?? "—"}</dd>
        <dt>{t("statusCol")}</dt><dd>{teacher.status}</dd>
      </dl>

      {canSalary && (
        <>
          <h4>{t("salaryHistoryHeading")}</h4>
          <div className="dataTable">
            <div className="dataRow header"><span>{t("dateCol")}</span><span>{t("amountCol")}</span><span>{t("periodCoveredCol")}</span><span>{t("methodCol")}</span></div>
            {payments.length === 0 && <p className="emptyState">{t("noPaymentsYet")}</p>}
            {payments.map((p) => (
              <div className="dataRow" key={p.id}>
                <span>{p.payment_date}</span>
                <span>{p.amount} {p.currency}</span>
                <span>{p.period_covered}</span>
                <span>{p.method}</span>
              </div>
            ))}
          </div>
          <form
            className="inlineForm"
            onSubmit={async (e) => {
              e.preventDefault();
              setError("");
              try {
                await financeApi.recordSalaryPayment(teacher.id, {
                  amount: Number(payForm.amount),
                  payment_date: payForm.payment_date,
                  period_covered: payForm.period_covered,
                  method: payForm.method,
                });
                setPayForm({ amount: "", payment_date: "", period_covered: "", method: "cash" });
                await load();
              } catch (err: any) {
                setError(err.response?.data?.detail ?? t("failedRecordPayment"));
              }
            }}
          >
            <label>{t("amountCol")}<Input required type="number" value={payForm.amount} onChange={(e) => setPayForm({ ...payForm, amount: e.target.value })} /></label>
            <label>{t("dateCol")}<Input required type="date" value={payForm.payment_date} onChange={(e) => setPayForm({ ...payForm, payment_date: e.target.value })} /></label>
            <label>{t("periodCoveredCol")}<Input required value={payForm.period_covered} onChange={(e) => setPayForm({ ...payForm, period_covered: e.target.value })} placeholder="June 2026" /></label>
            <label>{t("methodCol")}<Input required value={payForm.method} onChange={(e) => setPayForm({ ...payForm, method: e.target.value })} /></label>
            <div className="formActions"><button className="primaryAction" type="submit"><Plus size={16} /> {t("recordSalaryBtn")}</button></div>
          </form>
          {error && <p className="notice" style={{ color: "var(--rose)" }}>{error}</p>}
        </>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ Students

function StudentsTab({ canCreate, canFinance }: Readonly<{ canCreate: boolean; canFinance: boolean }>) {
  const { t } = useTranslation();
  const [students, setStudents] = useState<Student[]>([]);
  const [search, setSearch] = useState("");
  const [classOptions, setClassOptions] = useState<{ id: string; name: string }[]>([]);
  const [classFilter, setClassFilter] = useState("");
  const [classStudentIds, setClassStudentIds] = useState<Set<string> | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ username: "", name: "", date_of_birth: "", b_form_number: "", address: "" });
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [justCreated, setJustCreated] = useState<Student | null>(null);
  const [detail, setDetail] = useState<Student | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [pagination, setPagination] = useState<PageState>({ page: 0, pageSize: DEFAULT_PAGE_SIZE });
  const [total, setTotal] = useState(0);

  const load = async (query = search) => {
    setIsLoading(true);
    try {
      const result = await peopleApi.listStudentsPage({ search: query || undefined, ...pageParams(pagination) });
      if (recoverEmptyPage(result, pagination, setPagination)) return;
      setStudents(result.items);
      setTotal(result.total);
      setError("");
    } catch (err: any) {
      setError(err.response?.data?.detail ?? t("failedLoadStudents"));
    } finally {
      setIsLoading(false);
    }
  };
  useEffect(() => {
    void load();
    void attendanceApi.listClasses().then((rows: any[]) => {
      setClassOptions(rows.map((row) => ({ id: row.id ?? row.class_id, name: row.name ?? row.class_name })));
    }).catch(() => setClassOptions([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pagination]);

  useEffect(() => {
    if (!classFilter) {
      setClassStudentIds(null);
      return;
    }
    void attendanceApi.classRoster(classFilter).then((roster) => {
      setClassStudentIds(new Set(roster.students.map((s) => s.id)));
    }).catch(() => setClassStudentIds(new Set()));
  }, [classFilter]);

  const visible = classStudentIds ? students.filter((s) => classStudentIds.has(s.id)) : students;

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setNotice("");
    try {
      const created = await peopleApi.createStudent({
        username: form.username,
        name: form.name,
        date_of_birth: form.date_of_birth,
        b_form_number: form.b_form_number || undefined,
        address: form.address || undefined,
      });
      setNotice(t("createdSetPasswordLink", { code: created.admission_number, url: created.set_password_url }));
      setJustCreated(created);
      setForm({ username: "", name: "", date_of_birth: "", b_form_number: "", address: "" });
      setShowCreate(false);
      await load();
    } catch (err: any) {
      setError(err.response?.data?.detail ?? t("failedCreateStudent"));
    }
  };

  return (
    <>
      <div className="moduleToolbar">
        <SearchDropdown
          id="student-search"
          label={t("searchLabel")}
          placeholder={t("studentSearchPlaceholder")}
          items={students}
          value={search}
          getKey={(student) => student.id}
          getLabel={(student) => student.name}
          getDescription={(student) => `${student.admission_number} · ${student.status}`}
          onQueryChange={(query) => {
            setSearch(query);
            if (pagination.page === 0) void load(query);
            else setPagination((current) => ({ ...current, page: 0 }));
          }}
          onSelect={(student) => {
            setSearch(`${student.name} (${student.admission_number})`);
            setStudents([student]);
          }}
          emptyLabel={t("noStudentsYet")}
        />
        <div className="formActions">
          <Select value={classFilter} onChange={(e) => setClassFilter(e.target.value)}>
            <option value="">{t("allClasses")}</option>
            {classOptions.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
          {search && (
            <button className="secondaryAction" type="button" onClick={() => { setSearch(""); setPagination((current) => ({ ...current, page: 0 })); void load(""); }}>
              {t("cancelBtn")}
            </button>
          )}
          {canCreate && (
            <button className="primaryAction" type="button" onClick={() => setShowCreate((v) => !v)}>
              <UserPlus size={16} /> {t("addStudentBtn")}
            </button>
          )}
        </div>
      </div>

      {showCreate && canCreate && (
        <form className="inlineForm" onSubmit={onSubmit}>
          <label>{t("usernameLabel")}<Input required value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} /></label>
          <label>{t("fullNameLabel")}<Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
          <label>{t("dobLabel")}<Input required type="date" value={form.date_of_birth} onChange={(e) => setForm({ ...form, date_of_birth: e.target.value })} /></label>
          <label>{t("bFormLabel")}<Input value={form.b_form_number} onChange={(e) => setForm({ ...form, b_form_number: e.target.value })} /></label>
          <label>{t("addressLabel")}<Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></label>
          <div className="formActions">
            <button className="primaryAction" type="submit"><UserPlus size={16} /> {t("addStudentBtn")}</button>
          </div>
        </form>
      )}
      {error && <p className="notice" style={{ color: "var(--rose)" }}>{error}</p>}
      {notice && <p className="notice">{notice}</p>}
      {justCreated?.set_password_url && (
        <SendCredentialsButton subjectType="student" subjectId={justCreated.id} setPasswordUrl={justCreated.set_password_url} />
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
        {isLoading && <LoadingState />}
        {!isLoading && visible.length === 0 && <p className="emptyState">{t("noStudentsYet")}</p>}
        {visible.map((s) => (
          <div className="dataRow" key={s.id}>
            <span>{s.admission_number}</span>
            <span>{s.name}</span>
            <span>{s.date_of_birth}</span>
            <span>{s.portal_enabled ? t("enabledLabel") : t("disabledLabel")}</span>
            <span>{s.status}</span>
            <span>
              <button className="tableAction" type="button" title={t("viewBtn")} onClick={() => setDetail(s)}>
                <Eye size={14} />
              </button>
              {s.portal_enabled && <ReissueCredentialsButton subjectType="student" subjectId={s.id} />}
            </span>
          </div>
        ))}
      </div>
      <PaginationControls state={pagination} total={total} onChange={setPagination} />

      {detail && <StudentDetail student={detail} canFinance={canFinance} onClose={() => setDetail(null)} />}
    </>
  );
}

function StudentDetail({
  student,
  canFinance,
  onClose,
}: Readonly<{ student: Student; canFinance: boolean; onClose: () => void }>) {
  const { t } = useTranslation();
  const [guardians, setGuardians] = useState<Guardian[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [categories, setCategories] = useState<PaymentCategory[]>([]);
  const [feeForm, setFeeForm] = useState({ category_id: "", amount: "", payment_date: "" });
  const [error, setError] = useState("");

  const load = async () => {
    void peopleApi.studentGuardians(student.id).then(setGuardians).catch(() => setGuardians([]));
    if (canFinance) {
      void financeApi.listPayments({ student_id: student.id }).then(setPayments).catch(() => setPayments([]));
      void financeApi.listCategories().then(setCategories).catch(() => setCategories([]));
    }
  };
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [student.id]);

  return (
    <div className="modulePanel detailPanel">
      <div className="moduleHeader" style={{ display: "flex", justifyContent: "space-between" }}>
        <h3>{student.name} · {student.admission_number}</h3>
        <button className="tableAction" type="button" onClick={onClose}><X size={16} /></button>
      </div>
      <dl className="detailGrid">
        <dt>{t("dobCol")}</dt><dd>{student.date_of_birth}</dd>
        <dt>{t("portalCol")}</dt><dd>{student.portal_enabled ? t("enabledLabel") : t("disabledLabel")}</dd>
        <dt>{t("statusCol")}</dt><dd>{student.status}</dd>
      </dl>

      <h4>{t("guardians")}</h4>
      <div className="dataTable">
        <div className="dataRow header"><span>{t("nameLabel")}</span><span>{t("relationshipLabel")}</span><span>{t("phoneCol")}</span></div>
        {guardians.length === 0 && <p className="emptyState">{t("noGuardiansYet")}</p>}
        {guardians.map((g) => (
          <div className="dataRow" key={g.id}>
            <span>{g.name}</span>
            <span>{g.relationship}</span>
            <span>{g.phone_numbers}</span>
          </div>
        ))}
      </div>

      {canFinance && (
        <>
          <h4>{t("feeHistoryHeading")}</h4>
          <div className="dataTable">
            <div className="dataRow header"><span>{t("dateCol")}</span><span>{t("amountCol")}</span><span>{t("categoryCol")}</span></div>
            {payments.length === 0 && <p className="emptyState">{t("noPaymentsYet")}</p>}
            {payments.map((p) => (
              <div className="dataRow" key={p.id}>
                <span>{p.payment_date}</span>
                <span>{p.amount} {p.currency}</span>
                <span>{categories.find((c) => c.id === p.category_id)?.name ?? "—"}</span>
              </div>
            ))}
          </div>
          <form
            className="inlineForm"
            onSubmit={async (e) => {
              e.preventDefault();
              setError("");
              try {
                await financeApi.createPayment({
                  student_id: student.id,
                  category_id: feeForm.category_id,
                  amount: Number(feeForm.amount),
                  payment_date: feeForm.payment_date,
                });
                setFeeForm({ category_id: "", amount: "", payment_date: "" });
                await load();
              } catch (err: any) {
                setError(err.response?.data?.detail ?? t("failedRecordPayment"));
              }
            }}
          >
            <label>
              {t("categoryCol")}
              <Select required value={feeForm.category_id} onChange={(e) => setFeeForm({ ...feeForm, category_id: e.target.value })}>
                <option value="">{t("selectEllipsis")}</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
            </label>
            <label>{t("amountCol")}<Input required type="number" value={feeForm.amount} onChange={(e) => setFeeForm({ ...feeForm, amount: e.target.value })} /></label>
            <label>{t("dateCol")}<Input required type="date" value={feeForm.payment_date} onChange={(e) => setFeeForm({ ...feeForm, payment_date: e.target.value })} /></label>
            <div className="formActions"><button className="primaryAction" type="submit"><Plus size={16} /> {t("recordFeeBtn")}</button></div>
          </form>
          {error && <p className="notice" style={{ color: "var(--rose)" }}>{error}</p>}
        </>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ Guardians

function GuardiansTab({
  canCreate,
  canSendCredentials,
}: Readonly<{ canCreate: boolean; canSendCredentials: boolean }>) {
  const { t } = useTranslation();
  const [guardians, setGuardians] = useState<Guardian[]>([]);
  const [form, setForm] = useState({ name: "", relationship: "", phone_numbers: "", cnic: "", address: "" });
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [pagination, setPagination] = useState<PageState>({ page: 0, pageSize: DEFAULT_PAGE_SIZE });
  const [total, setTotal] = useState(0);

  const load = async () => {
    setIsLoading(true);
    try {
      const result = await peopleApi.listGuardiansPage(pageParams(pagination));
      if (recoverEmptyPage(result, pagination, setPagination)) return;
      setGuardians(result.items);
      setTotal(result.total);
      setError("");
    } catch (err: any) {
      setError(err.response?.data?.detail ?? t("failedLoadGuardians"));
    } finally {
      setIsLoading(false);
    }
  };
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pagination]);

  const provisionLogin = async (guardian: Guardian) => {
    setError("");
    setNotice("");
    try {
      let username: string | undefined;
      if (!guardian.user_id) {
        username = window.prompt(t("guardianUsernamePrompt")) ?? undefined;
        if (!username) return;
      }
      const result = await peopleApi.guardianCredentialsLink(guardian.id, username);
      const fullUrl = `${window.location.origin}${result.set_password_url}`;
      await navigator.clipboard.writeText(fullUrl);
      setNotice(t("guardianLinkCopied", { username: result.username }));
      await load();
    } catch (err: any) {
      setError(err.response?.data?.detail ?? t("failedSendCredentials"));
    }
  };

  return (
    <>
      {canCreate && (
        <form
          className="inlineForm"
          onSubmit={async (e) => {
            e.preventDefault();
            setError("");
            try {
              await peopleApi.createGuardian({
                name: form.name,
                relationship: form.relationship,
                phone_numbers: form.phone_numbers,
                cnic: form.cnic || undefined,
                address: form.address || undefined,
              });
              setForm({ name: "", relationship: "", phone_numbers: "", cnic: "", address: "" });
              await load();
            } catch (err: any) {
              setError(err.response?.data?.detail ?? t("failedCreateGuardian"));
            }
          }}
        >
          <label>{t("fullNameLabel")}<Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
          <label>{t("relationshipLabel")}<Input required value={form.relationship} onChange={(e) => setForm({ ...form, relationship: e.target.value })} placeholder={t("relationshipPlaceholder")} /></label>
          <label>{t("phoneCol")}<Input required value={form.phone_numbers} onChange={(e) => setForm({ ...form, phone_numbers: e.target.value })} /></label>
          <label>{t("cnicLabel")}<Input value={form.cnic} onChange={(e) => setForm({ ...form, cnic: e.target.value })} /></label>
          <label>{t("addressLabel")}<Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></label>
          <div className="formActions"><button className="primaryAction" type="submit"><UserPlus size={16} /> {t("addGuardianBtn")}</button></div>
        </form>
      )}
      {error && <p className="notice" style={{ color: "var(--rose)" }}>{error}</p>}
      {notice && <p className="notice">{notice}</p>}
      <div className="dataTable">
        <div className="dataRow header">
          <span>{t("nameLabel")}</span>
          <span>{t("relationshipLabel")}</span>
          <span>{t("phoneCol")}</span>
          <span>{t("portalCol")}</span>
          <span></span>
        </div>
        {isLoading && <LoadingState />}
        {!isLoading && guardians.length === 0 && <p className="emptyState">{t("noGuardiansYet")}</p>}
        {guardians.map((g) => (
          <div className="dataRow" key={g.id}>
            <span>{g.name}</span>
            <span>{g.relationship}</span>
            <span>{g.phone_numbers}</span>
            <span>{g.user_id ? t("enabledLabel") : t("disabledLabel")}</span>
            <span>
              {canSendCredentials && (
                <button className="tableAction" type="button" onClick={() => void provisionLogin(g)}>
                  <KeyRound size={14} /> {t("loginLinkBtn")}
                </button>
              )}
            </span>
          </div>
        ))}
      </div>
      <PaginationControls state={pagination} total={total} onChange={setPagination} />
    </>
  );
}

// ------------------------------------------------------------------ Donators

function DonatorsTab() {
  const { t } = useTranslation();
  const [donors, setDonors] = useState<Donor[]>([]);
  const [selected, setSelected] = useState<Donor | null>(null);
  const [donations, setDonations] = useState<Donation[]>([]);
  const [categories, setCategories] = useState<PaymentCategory[]>([]);
  const [donationForm, setDonationForm] = useState({ category_id: "", amount: "", donation_date: "" });
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    void Promise.all([
      financeApi.listDonors().then(setDonors).catch((err: any) => {
        setDonors([]);
        setError(err.response?.data?.detail ?? t("failedLoadDonors"));
      }),
      financeApi.listCategories().then(setCategories).catch(() => setCategories([])),
    ]).finally(() => setIsLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openDonor = async (donor: Donor) => {
    setSelected(donor);
    setDonations(await financeApi.listDonations(donor.id));
  };

  return (
    <>
      {error && <p className="notice" style={{ color: "var(--rose)" }}>{error}</p>}
      <div className="dataTable">
        <div className="dataRow header"><span>{t("nameLabel")}</span><span>{t("contactCol")}</span><span></span></div>
        {isLoading && <LoadingState />}
        {!isLoading && donors.length === 0 && <p className="emptyState">{t("noDonorsYet")}</p>}
        {donors.map((d) => (
          <div className="dataRow" key={d.id}>
            <span>{d.name}</span>
            <span>{d.contact}</span>
            <span>
              <button className="tableAction" type="button" onClick={() => void openDonor(d)}>
                <Eye size={14} /> {t("viewBtn")}
              </button>
            </span>
          </div>
        ))}
      </div>

      {selected && (
        <div className="modulePanel detailPanel">
          <div className="moduleHeader" style={{ display: "flex", justifyContent: "space-between" }}>
            <h3>{selected.name}</h3>
            <button className="tableAction" type="button" onClick={() => setSelected(null)}><X size={16} /></button>
          </div>
          <h4>{t("donationHistoryHeading")}</h4>
          <div className="dataTable">
            <div className="dataRow header"><span>{t("dateCol")}</span><span>{t("amountCol")}</span><span>{t("categoryCol")}</span></div>
            {donations.length === 0 && <p className="emptyState">{t("noDonationsYet")}</p>}
            {donations.map((d) => (
              <div className="dataRow" key={d.id}>
                <span>{d.donation_date}</span>
                <span>{d.amount} {d.currency}</span>
                <span>{categories.find((c) => c.id === d.category_id)?.name ?? "—"}</span>
              </div>
            ))}
          </div>
          <form
            className="inlineForm"
            onSubmit={async (e) => {
              e.preventDefault();
              setError("");
              try {
                await financeApi.createDonation({
                  donor_id: selected.id,
                  category_id: donationForm.category_id,
                  amount: Number(donationForm.amount),
                  donation_date: donationForm.donation_date,
                });
                setDonationForm({ category_id: "", amount: "", donation_date: "" });
                await openDonor(selected);
              } catch (err: any) {
                setError(err.response?.data?.detail ?? t("failedRecordPayment"));
              }
            }}
          >
            <label>
              {t("categoryCol")}
              <Select required value={donationForm.category_id} onChange={(e) => setDonationForm({ ...donationForm, category_id: e.target.value })}>
                <option value="">{t("selectEllipsis")}</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
            </label>
            <label>{t("amountCol")}<Input required type="number" value={donationForm.amount} onChange={(e) => setDonationForm({ ...donationForm, amount: e.target.value })} /></label>
            <label>{t("dateCol")}<Input required type="date" value={donationForm.donation_date} onChange={(e) => setDonationForm({ ...donationForm, donation_date: e.target.value })} /></label>
            <div className="formActions"><button className="primaryAction" type="submit"><Plus size={16} /> {t("addDonationBtn")}</button></div>
          </form>
          {error && <p className="notice" style={{ color: "var(--rose)" }}>{error}</p>}
        </div>
      )}
    </>
  );
}
