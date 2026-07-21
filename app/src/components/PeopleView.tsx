import { Button } from "./ui/Button";
import { useEffect, useState } from "react";
import { Eye, GraduationCap, HandCoins, KeyRound, Plus, ShieldCheck, UserPlus, UserRoundCog, UsersRound, X } from "lucide-react";
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
import { DataTable, type Column } from "./ui/DataTable";
import { DEFAULT_PAGE_SIZE, pageParams, PaginationControls, recoverEmptyPage, type PageState } from "./ui/Pagination";
import { useSessionReadOnly } from "./SessionSwitcher";
import { DelegateModal } from "./DelegateButton";
import { Modal, FormModal } from "./ui/Modal";
import { PageSection, PageHeader } from "./ui/Layout";

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
      if (link.url) window.open(link.url, "_blank", "noopener,noreferrer");
    } catch (err: any) {
      setError(err.response?.data?.detail ?? t("failedSendCredentials"));
    }
  };

  return (
    <>
      <Button className="secondaryAction" type="button" disabled={readOnly} onClick={() => void send()}>
        {t("sendCredentialsBtn")}
      </Button>
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
        if (link.url) window.open(link.url, "_blank", "noopener,noreferrer");
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
    <Button className="tableAction" type="button" disabled={readOnly} title={t("loginLinkTitle")} onClick={() => void reissue()}>
      <KeyRound size={14} /> {state === "copied" ? t("linkCopied") : state === "error" ? t("failedLabel") : t("loginLinkBtn")}
    </Button>
  );
}

export type PeopleTab = "teachers" | "students" | "guardians" | "donators";

export function PeopleView({
  initialTab = "teachers",
  onTabChange,
  showTabs = true,
}: Readonly<{ initialTab?: PeopleTab; onTabChange?: (tab: PeopleTab) => void; showTabs?: boolean }>) {
  const { t } = useTranslation();
  const { hasPermission } = useAuth();
  const readOnly = useSessionReadOnly();
  const [tab, setTab] = useState<PeopleTab>(initialTab);
  const canViewFinance = hasPermission("finance.manage");
  const canFinance = !readOnly && canViewFinance;
  const canSalary = !readOnly && hasPermission("teachers.salary.manage");
  useEffect(() => setTab(initialTab), [initialTab]);
  const changeTab = (next: PeopleTab) => {
    setTab(next);
    onTabChange?.(next);
  };

  return (
    <PageSection>
      <PageHeader title={t("peopleTitle")} notice={t("peopleSubtitle")} />
      {showTabs && <div className="formActions" style={{ marginBottom: 16 }}>
        {hasPermission("teachers.view") && <Button className={tab === "teachers" ? "primaryAction" : "secondaryAction"} type="button" onClick={() => changeTab("teachers")}>
          <UserRoundCog size={16} /> {t("teachers")}
        </Button>}
        {hasPermission("students.view") && <Button className={tab === "students" ? "primaryAction" : "secondaryAction"} type="button" onClick={() => changeTab("students")}>
          <GraduationCap size={16} /> {t("students")}
        </Button>}
        {hasPermission("students.view") && <Button className={tab === "guardians" ? "primaryAction" : "secondaryAction"} type="button" onClick={() => changeTab("guardians")}>
          <UsersRound size={16} /> {t("guardians")}
        </Button>}
        {canViewFinance && (
          <Button className={tab === "donators" ? "primaryAction" : "secondaryAction"} type="button" onClick={() => changeTab("donators")}>
            <HandCoins size={16} /> {t("donatorsTab")}
          </Button>
        )}
      </div>}
      {tab === "teachers" && <TeachersTab canCreate={!readOnly && hasPermission("teachers.add")} canSalary={canSalary} />}
      {tab === "students" && <StudentsTab canCreate={!readOnly && hasPermission("students.add")} canFinance={canFinance} />}
      {tab === "guardians" && <GuardiansTab canCreate={!readOnly && hasPermission("students.add")} canSendCredentials={!readOnly && hasPermission("students.send_credentials")} />}
      {tab === "donators" && canViewFinance && <DonatorsTab canWrite={canFinance} />}
    </PageSection>
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
            <Button className="secondaryAction" type="button" onClick={() => { setSearch(""); setPagination((current) => ({ ...current, page: 0 })); void load(""); }}>
              {t("cancelBtn")}
            </Button>
          )}
          {canCreate && (
            <Button className="primaryAction" type="button" onClick={() => setShowCreate((v) => !v)}>
              <UserPlus size={16} /> {t("addTeacherBtn")}
            </Button>
          )}
        </div>
      </div>

      {showCreate && canCreate && (
        <FormModal
                title={t("addTeacherBtn")} onClose={() => setShowCreate(false)}
                onSubmit={onSubmit}
                submitLabel={t("addTeacherBtn")}
                submitIcon={<UserPlus size={16} />}
              >
                <label>{t("usernameLabel")}<Input required value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} /></label>

              <label>{t("fullNameLabel")}<Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>

              <label>{t("whatsappNumberLabel")}<Input value={form.whatsapp_number} onChange={(e) => setForm({ ...form, whatsapp_number: e.target.value })} /></label>

              <label>{t("qualificationsLabel")}<Input value={form.qualifications} onChange={(e) => setForm({ ...form, qualifications: e.target.value })} /></label>

              <label>{t("joinDateLabel")}<Input type="date" value={form.join_date} onChange={(e) => setForm({ ...form, join_date: e.target.value })} /></label>

              <label>{t("cnicLabel")}<Input value={form.cnic} onChange={(e) => setForm({ ...form, cnic: e.target.value })} /></label>

              <label>{t("addressLabel")}<Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></label>

              <label>{t("emergencyContactLabel")}<Input value={form.emergency_contact} onChange={(e) => setForm({ ...form, emergency_contact: e.target.value })} /></label>
              </FormModal>
      )}
      {error && <p className="notice" style={{ color: "var(--rose)" }}>{error}</p>}
      {notice && <p className="notice">{notice}</p>}
      {justCreated?.set_password_url && (
        <SendCredentialsButton subjectType="teacher" subjectId={justCreated.id} setPasswordUrl={justCreated.set_password_url} />
      )}

      <DataTable<Teacher>
        columns={[
          { header: t("codeCol"), render: (teacher) => teacher.employee_code },
          { header: t("nameLabel"), render: (teacher) => teacher.name },
          { header: t("whatsappCol"), render: (teacher) => teacher.whatsapp_number || "—" },
          { header: t("statusCol"), render: (teacher) => teacher.status },
          { header: t("actionsCol"), render: (teacher) => (
            <>
              <Button className="tableAction" type="button" title={t("viewBtn")} onClick={() => setDetail(teacher)}>
                <Eye size={14} />
              </Button>
              <ReissueCredentialsButton subjectType="teacher" subjectId={teacher.id} />
            </>
          )},
        ]}
        data={teachers}
        keyExtractor={(teacher) => teacher.id}
        isLoading={isLoading}
        emptyMessage={t("noTeachersYet")}
      />
      <PaginationControls state={pagination} total={total} onChange={setPagination} />

      {detail && <Modal title={detail.name} onClose={() => setDetail(null)}><TeacherDetail teacher={detail} canSalary={canSalary} onClose={() => setDetail(null)} /></Modal>}
    </>
  );
}

function TeacherDetail({
  teacher,
  canSalary,
  onClose,
}: Readonly<{ teacher: Teacher; canSalary: boolean; onClose: () => void }>) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [payments, setPayments] = useState<SalaryPayment[]>([]);
  const [payForm, setPayForm] = useState({ amount: "", payment_date: "", period_covered: "", method: "cash" });
  const [showPayModal, setShowPayModal] = useState(false);
  const [error, setError] = useState("");
  const [showDelegate, setShowDelegate] = useState(false);

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
    <div className="detailPanel">
      <PageHeader
        title={`${teacher.name} · ${teacher.employee_code}`}
        actions={
          <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            {user?.role === "principal" && (
              <Button className="secondaryAction" type="button" onClick={() => setShowDelegate(true)}>
                <ShieldCheck size={16} /> {t("delegateBtn")}
              </Button>
            )}
            <Button className="tableAction" type="button" onClick={onClose}><X size={16} /></Button>
          </div>
        }
      />
      <dl className="detailGrid">
        <dt>{t("whatsappCol")}</dt><dd>{teacher.whatsapp_number || "—"}</dd>
        <dt>{t("qualificationsLabel")}</dt><dd>{teacher.qualifications ?? "—"}</dd>
        <dt>{t("joinDateLabel")}</dt><dd>{teacher.join_date ?? "—"}</dd>
        <dt>{t("statusCol")}</dt><dd>{teacher.status}</dd>
      </dl>
      {showDelegate && (
        <DelegateModal
          initialTeacherUserId={teacher.user_id}
          onClose={() => setShowDelegate(false)}
        />
      )}

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
          <div className="formActions" style={{ marginTop: "1rem" }}>
            <Button className="primaryAction" type="button" onClick={() => setShowPayModal(true)}>
              <Plus size={16} /> {t("recordSalaryBtn")}
            </Button>
          </div>

          {showPayModal && (
            <FormModal
              title={t("recordSalaryBtn")}
              onClose={() => setShowPayModal(false)}
              submitLabel={t("recordSalaryBtn")}
              submitIcon={<Plus size={16} />}
              error={error}
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
                  setShowPayModal(false);
                } catch (err: any) {
                  setError(err.response?.data?.detail ?? t("failedRecordPayment"));
                }
              }}
            >
              <label>{t("amountCol")}<Input required type="number" value={payForm.amount} onChange={(e) => setPayForm({ ...payForm, amount: e.target.value })} /></label>
              <label>{t("dateCol")}<Input required type="date" value={payForm.payment_date} onChange={(e) => setPayForm({ ...payForm, payment_date: e.target.value })} /></label>
              <label>{t("periodCoveredCol")}<Input required value={payForm.period_covered} onChange={(e) => setPayForm({ ...payForm, period_covered: e.target.value })} placeholder={t("monthYearExample")} /></label>
              <label>{t("methodCol")}<Input required value={payForm.method} onChange={(e) => setPayForm({ ...payForm, method: e.target.value })} /></label>
            </FormModal>
          )}
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
        <label className="searchBox" htmlFor="student-class-filter">
          {t("classLabel")}
          <Select id="student-class-filter" value={classFilter} onChange={(e) => setClassFilter(e.target.value)}>
            <option value="">{t("allClasses")}</option>
            {classOptions.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </label>
        <div className="formActions">
          {search && (
            <Button className="secondaryAction" type="button" onClick={() => { setSearch(""); setPagination((current) => ({ ...current, page: 0 })); void load(""); }}>
              {t("cancelBtn")}
            </Button>
          )}
          {canCreate && (
            <Button className="primaryAction" type="button" onClick={() => setShowCreate((v) => !v)}>
              <UserPlus size={16} /> {t("addStudentBtn")}
            </Button>
          )}
        </div>
      </div>

      {showCreate && canCreate && (
        <FormModal
                title={t("addStudentBtn")} onClose={() => setShowCreate(false)}
                onSubmit={onSubmit}
                submitLabel={t("addStudentBtn")}
                submitIcon={<UserPlus size={16} />}
              >
                <label>{t("usernameLabel")}<Input required value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} /></label>

              <label>{t("studentNameLabel")}<Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>

              <label>{t("dobLabel")}<Input required type="date" value={form.date_of_birth} onChange={(e) => setForm({ ...form, date_of_birth: e.target.value })} /></label>

              <label>{t("bFormLabel")}<Input value={form.b_form_number} onChange={(e) => setForm({ ...form, b_form_number: e.target.value })} /></label>

              <label>{t("addressLabel")}<Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></label>
              </FormModal>
      )}
      {error && <p className="notice" style={{ color: "var(--rose)" }}>{error}</p>}
      {notice && <p className="notice">{notice}</p>}
      {justCreated?.set_password_url && (
        <SendCredentialsButton subjectType="student" subjectId={justCreated.id} setPasswordUrl={justCreated.set_password_url} />
      )}

      <DataTable<Student>
        columns={[
          { header: t("admissionNumberCol"), render: (s) => s.admission_number },
          { header: t("studentNameLabel"), render: (s) => s.name },
          { header: t("dobCol"), render: (s) => s.date_of_birth },
          { header: t("portalCol"), render: (s) => s.portal_enabled ? t("enabledLabel") : t("disabledLabel") },
          { header: t("statusCol"), render: (s) => s.status },
          { header: t("actionsCol"), render: (s) => (
            <>
              <Button className="tableAction" type="button" title={t("viewBtn")} onClick={() => setDetail(s)}>
                <Eye size={14} />
              </Button>
              {s.portal_enabled && <ReissueCredentialsButton subjectType="student" subjectId={s.id} />}
            </>
          )},
        ]}
        data={visible}
        keyExtractor={(s) => s.id}
        isLoading={isLoading}
        emptyMessage={t("noStudentsYet")}
      />
      <PaginationControls state={pagination} total={total} onChange={setPagination} />

      {detail && <Modal title={detail.name} onClose={() => setDetail(null)}><StudentDetail student={detail} canFinance={canFinance} onClose={() => setDetail(null)} /></Modal>}
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
  const [showFeeModal, setShowFeeModal] = useState(false);
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
    <div className="detailPanel">
      <PageHeader
        title={`${student.name} · ${student.admission_number}`}
        actions={<Button className="tableAction" type="button" onClick={onClose}><X size={16} /></Button>}
      />
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
          </div>
          <div className="formActions" style={{ marginTop: "1rem" }}>
            <Button className="primaryAction" type="button" onClick={() => setShowFeeModal(true)}>
              <Plus size={16} /> {t("recordFeeBtn")}
            </Button>
          </div>

          {showFeeModal && (
            <FormModal
              title={t("recordFeeBtn")}
              onClose={() => setShowFeeModal(false)}
              submitLabel={t("recordFeeBtn")}
              submitIcon={<Plus size={16} />}
              error={error}
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
                  setShowFeeModal(false);
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
            </FormModal>
          )}
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
  const [showCreate, setShowCreate] = useState(false);
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
      {canCreate && <Button className="primaryAction" type="button" onClick={() => setShowCreate(true)}><UserPlus size={16} /> {t("addGuardianBtn")}</Button>}
      {canCreate && showCreate && (
        <FormModal
                title={t("addGuardianBtn")} onClose={() => setShowCreate(false)}
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
                            setShowCreate(false);
                            await load();
                          } catch (err: any) {
                            setError(err.response?.data?.detail ?? t("failedCreateGuardian"));
                          }
                        }}
                submitLabel={t("addGuardianBtn")}
                submitIcon={<UserPlus size={16} />}
              >
                <label>{t("fullNameLabel")}<Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>

              <label>{t("relationshipLabel")}<Input required value={form.relationship} onChange={(e) => setForm({ ...form, relationship: e.target.value })} placeholder={t("relationshipPlaceholder")} /></label>

              <label>{t("phoneCol")}<Input required value={form.phone_numbers} onChange={(e) => setForm({ ...form, phone_numbers: e.target.value })} /></label>

              <label>{t("cnicLabel")}<Input value={form.cnic} onChange={(e) => setForm({ ...form, cnic: e.target.value })} /></label>

              <label>{t("addressLabel")}<Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></label>
              </FormModal>
      )}
      {error && <p className="notice" style={{ color: "var(--rose)" }}>{error}</p>}
      {notice && <p className="notice">{notice}</p>}
      <DataTable<Guardian>
        columns={[
          { header: t("nameLabel"), render: (g) => g.name },
          { header: t("relationshipLabel"), render: (g) => g.relationship },
          { header: t("phoneCol"), render: (g) => g.phone_numbers },
          { header: t("portalCol"), render: (g) => g.user_id ? t("enabledLabel") : t("disabledLabel") },
          { header: t("actionsCol"), render: (g) => (
            canSendCredentials ? (
              <Button className="tableAction" type="button" onClick={() => void provisionLogin(g)}>
                <KeyRound size={14} /> {t("loginLinkBtn")}
              </Button>
            ) : null
          )},
        ]}
        data={guardians}
        keyExtractor={(g) => g.id}
        isLoading={isLoading}
        emptyMessage={t("noGuardiansYet")}
      />
      <PaginationControls state={pagination} total={total} onChange={setPagination} />
    </>
  );
}

// ------------------------------------------------------------------ Donators

function DonatorsTab({ canWrite }: Readonly<{ canWrite: boolean }>) {
  const { t } = useTranslation();
  const [donors, setDonors] = useState<Donor[]>([]);
  const [selected, setSelected] = useState<Donor | null>(null);
  const [donations, setDonations] = useState<Donation[]>([]);
  const [categories, setCategories] = useState<PaymentCategory[]>([]);
  const [donationForm, setDonationForm] = useState({ category_id: "", amount: "", donation_date: "" });
  const [showDonationModal, setShowDonationModal] = useState(false);
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
      <DataTable<Donor>
        columns={[
          { header: t("nameLabel"), render: (d) => d.name },
          { header: t("contactCol"), render: (d) => d.contact },
          { header: t("actionsCol"), render: (d) => (
            <Button className="tableAction" type="button" onClick={() => void openDonor(d)}>
              <Eye size={14} /> {t("viewBtn")}
            </Button>
          )},
        ]}
        data={donors}
        keyExtractor={(d) => d.id}
        isLoading={isLoading}
        emptyMessage={t("noDonorsYet")}
      />

      {selected && (
        <Modal title={selected.name} onClose={() => setSelected(null)}>
          <div className="detailPanel">
            <PageHeader
              title={selected.name}
              actions={<Button className="tableAction" type="button" onClick={() => setSelected(null)}><X size={16} /></Button>}
            />
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
          {canWrite && (
            <div className="formActions" style={{ marginTop: "1rem" }}>
              <Button className="primaryAction" type="button" onClick={() => setShowDonationModal(true)}>
                <Plus size={16} /> {t("addDonationBtn")}
              </Button>
            </div>
          )}

          {canWrite && showDonationModal && (
            <FormModal
              title={t("addDonationBtn")}
              onClose={() => setShowDonationModal(false)}
              submitLabel={t("addDonationBtn")}
              submitIcon={<Plus size={16} />}
              error={error}
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
                  setShowDonationModal(false);
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
            </FormModal>
          )}
          {error && <p className="notice" style={{ color: "var(--rose)" }}>{error}</p>}
          </div>
        </Modal>
      )}
    </>
  );
}
