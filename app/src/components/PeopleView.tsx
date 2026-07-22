import { Button } from "./ui/Button";
import { useEffect, useState } from "react";
import { Eye, GraduationCap, HandCoins, KeyRound, Plus, ShieldCheck, UserPlus, UserRoundCog, UsersRound, X, Edit2, Pencil, UserMinus } from "lucide-react";
import { useTranslation } from "react-i18next";

import { useDialog } from "../lib/DialogContext";
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
  academicsApi,
  type AcademicSession,
  type Program,
  type AcademicClass,
  type Section,
  operationsApi,
  type AdmissionForm,
} from "../lib/endpoints";
import { SearchDropdown } from "./SearchDropdown";
import { Checkbox, Input, Select, Textarea } from "./ui/Field";
import { LoadingState } from "./ui/AsyncState";
import { DataTable, type Column } from "./ui/DataTable";
import { DEFAULT_PAGE_SIZE, pageParams, PaginationControls, recoverEmptyPage, type PageState } from "./ui/Pagination";
import { useSessionReadOnly } from "./SessionSwitcher";
import { DelegateModal } from "./DelegateButton";
import { Modal, FormModal } from "./ui/Modal";
import { PageSection, PageHeader } from "./ui/Layout";
import { InlineFilter } from "./ui/InlineFilter";

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
      <Button className="secondaryAction" type="button" disabled={readOnly} onClick={() => send()}>
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
    <Button className="tableAction" type="button" disabled={readOnly} title={t("loginLinkTitle")} onClick={() => reissue()}>
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
    cnic: "", address: "", emergency_contact: "", is_principal_delegate: false,
  });
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [justCreated, setJustCreated] = useState<Teacher | null>(null);
  const [detail, setDetail] = useState<Teacher | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [pagination, setPagination] = useState<PageState>({ page: 0, pageSize: DEFAULT_PAGE_SIZE });
  const [total, setTotal] = useState(0);

  const [editingTeacher, setEditingTeacher] = useState<Teacher | null>(null);
  const [editForm, setEditForm] = useState({
    name: "", whatsapp_number: "", qualifications: "", join_date: "",
    cnic: "", address: "", emergency_contact: "", is_principal_delegate: false,
  });

  const onEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setNotice("");
    if (!editingTeacher) return;
    try {
      await peopleApi.updateTeacher(editingTeacher.id, {
        name: editForm.name,
        whatsapp_number: editForm.whatsapp_number,
        qualifications: editForm.qualifications || undefined,
        join_date: editForm.join_date || undefined,
        cnic: editForm.cnic || undefined,
        address: editForm.address || undefined,
        emergency_contact: editForm.emergency_contact || undefined,
        is_principal_delegate: editForm.is_principal_delegate,
      });
      setNotice(t("teacherUpdated", "Teacher updated"));
      setEditingTeacher(null);
      await load();
    } catch (err: any) {
      setError(err.response?.data?.detail ?? t("failedUpdateTeacher", "Failed to update teacher"));
    }
  };

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
        is_principal_delegate: form.is_principal_delegate,
      });
      setNotice(t("createdSetPasswordLink", { code: created.employee_code, url: created.set_password_url }));
      setJustCreated(created);
      setForm({ username: "", name: "", whatsapp_number: "", qualifications: "", join_date: "", cnic: "", address: "", emergency_contact: "", is_principal_delegate: false });
      setShowCreate(false);
      await load();
    } catch (err: any) {
      setError(err.response?.data?.detail ?? t("failedCreateTeacher"));
    }
  };

  return (
    <>
      <InlineFilter filters={[]}>
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
      </InlineFilter>

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

              <label className="checkboxLabel">
                <input type="checkbox" checked={form.is_principal_delegate} onChange={(e) => setForm({ ...form, is_principal_delegate: e.target.checked })} />
                <span>{t("principalDelegateLabel", "Delegate as Principal (Access all menus)")}</span>
              </label>
              </FormModal>
      )}

      {editingTeacher && canCreate && (
        <FormModal
          title={t("editTeacherBtn", "Edit Teacher")} onClose={() => setEditingTeacher(null)}
          onSubmit={onEditSubmit}
          submitLabel={t("saveBtn")}
          submitIcon={<Edit2 size={16} />}
        >
          <label>{t("fullNameLabel")}<Input required value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} /></label>
          <label>{t("whatsappNumberLabel")}<Input required value={editForm.whatsapp_number} onChange={(e) => setEditForm({ ...editForm, whatsapp_number: e.target.value })} /></label>
          <label>{t("qualificationsLabel")}<Input value={editForm.qualifications} onChange={(e) => setEditForm({ ...editForm, qualifications: e.target.value })} /></label>
          <label>{t("joinDateLabel")}<Input type="date" value={editForm.join_date} onChange={(e) => setEditForm({ ...editForm, join_date: e.target.value })} /></label>
          <label>{t("cnicLabel")}<Input value={editForm.cnic} onChange={(e) => setEditForm({ ...editForm, cnic: e.target.value })} /></label>
          <label>{t("addressLabel")}<Input value={editForm.address} onChange={(e) => setEditForm({ ...editForm, address: e.target.value })} /></label>
          <label>{t("emergencyContactLabel")}<Input value={editForm.emergency_contact} onChange={(e) => setEditForm({ ...editForm, emergency_contact: e.target.value })} /></label>
          <label className="checkboxLabel">
            <input type="checkbox" checked={editForm.is_principal_delegate} onChange={(e) => setEditForm({ ...editForm, is_principal_delegate: e.target.checked })} />
            <span>{t("principalDelegateLabel", "Delegate as Principal (Access all menus)")}</span>
          </label>
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
              {canCreate && (
                <Button className="tableAction" type="button" title={t("editBtn", "Edit")} onClick={() => {
                  setEditingTeacher(teacher);
                  setEditForm({
                    name: teacher.name,
                    whatsapp_number: teacher.whatsapp_number,
                    qualifications: teacher.qualifications || "",
                    join_date: teacher.join_date || "",
                    cnic: teacher.cnic || "",
                    address: teacher.address || "",
                    emergency_contact: teacher.emergency_contact || "",
                    is_principal_delegate: teacher.is_principal_delegate || false,
                  });
                }}>
                  <Edit2 size={14} />
                </Button>
              )}
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

      {detail && <TeacherDetail teacher={detail} canSalary={canSalary} onClose={() => setDetail(null)} onUpdate={() => { setDetail(null); void load(); }} />}
    </>
  );
}

function TeacherDetail({
  teacher,
  canSalary,
  onClose,
  onUpdate,
}: Readonly<{ teacher: Teacher; canSalary: boolean; onClose: () => void; onUpdate: () => void }>) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [payments, setPayments] = useState<SalaryPayment[]>([]);
  const [payForm, setPayForm] = useState({ amount: "", payment_date: "", period_covered: "", method: "cash" });
  const [showPayModal, setShowPayModal] = useState(false);
  const [error, setError] = useState("");
  const [showDelegate, setShowDelegate] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [editForm, setEditForm] = useState({
    name: teacher.name, whatsapp_number: teacher.whatsapp_number, qualifications: teacher.qualifications ?? "",
    join_date: teacher.join_date ?? "", cnic: teacher.cnic ?? "", address: teacher.address ?? "", emergency_contact: teacher.emergency_contact ?? ""
  });
  const { hasPermission } = useAuth();
  const canEdit = hasPermission("teachers.edit");

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
    <Modal
      title={`${teacher.name} · ${teacher.employee_code}`}
      onClose={onClose}
      actions={
        <>
          {canEdit && (
            <Button className="secondaryAction" type="button" onClick={() => setShowEdit(true)}>
              <Pencil size={16} /> {t("edit", "Edit")}
            </Button>
          )}
          {user?.role === "principal" && (
            <Button className="secondaryAction" type="button" onClick={() => setShowDelegate(true)}>
              <ShieldCheck size={16} /> {t("delegateBtn")}
            </Button>
          )}
        </>
      }
    >
      <div className="detailPanel" style={{ padding: "1.5rem" }}>
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
      {showEdit && (
        <FormModal
          title={t("editTeacher", "Edit Teacher")}
          onClose={() => setShowEdit(false)}
          submitLabel={t("saveBtn")}
          submitIcon={<Pencil size={16} />}
          onSubmit={async (e) => {
            e.preventDefault();
            setError("");
            try {
              await peopleApi.updateTeacher(teacher.id, {
                name: editForm.name,
                whatsapp_number: editForm.whatsapp_number,
                qualifications: editForm.qualifications || undefined,
                join_date: editForm.join_date || undefined,
                cnic: editForm.cnic || undefined,
                address: editForm.address || undefined,
                emergency_contact: editForm.emergency_contact || undefined,
              });
              setShowEdit(false);
              onUpdate();
            } catch (err: any) {
              setError(err.response?.data?.detail ?? t("failedToUpdate", "Failed to update"));
            }
          }}
        >
          <label>{t("fullNameLabel")}<Input required value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} /></label>
          <label>{t("whatsappCol")}<Input required value={editForm.whatsapp_number} onChange={(e) => setEditForm({ ...editForm, whatsapp_number: e.target.value })} /></label>
          <label>{t("qualificationsLabel")}<Input value={editForm.qualifications} onChange={(e) => setEditForm({ ...editForm, qualifications: e.target.value })} /></label>
          <label>{t("joinDateLabel")}<Input type="date" value={editForm.join_date} onChange={(e) => setEditForm({ ...editForm, join_date: e.target.value })} /></label>
          <label>{t("cnicLabel")}<Input value={editForm.cnic} onChange={(e) => setEditForm({ ...editForm, cnic: e.target.value })} placeholder="12345-1234567-1" /></label>
          <label>{t("addressCol")}<Input value={editForm.address} onChange={(e) => setEditForm({ ...editForm, address: e.target.value })} /></label>
          <label>{t("emergencyContactCol")}<Input value={editForm.emergency_contact} onChange={(e) => setEditForm({ ...editForm, emergency_contact: e.target.value })} /></label>
        </FormModal>
      )}
    </Modal>
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
  const [admissionForms, setAdmissionForms] = useState<AdmissionForm[]>([]);
  const [admissionFormId, setAdmissionFormId] = useState("");
  const [admissionAnswers, setAdmissionAnswers] = useState<Record<string, unknown>>({});
  const [guardians, setGuardians] = useState<Guardian[]>([]);
  const [guardianIds, setGuardianIds] = useState<string[]>([]);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [justCreated, setJustCreated] = useState<Student | null>(null);
  const [detail, setDetail] = useState<Student | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [pagination, setPagination] = useState<PageState>({ page: 0, pageSize: DEFAULT_PAGE_SIZE });
  const [total, setTotal] = useState(0);

  const [editingStudent, setEditingStudent] = useState<Student | null>(null);
  const [assignClassStudent, setAssignClassStudent] = useState<Student | null>(null);
  const [editForm, setEditForm] = useState({ name: "", date_of_birth: "", b_form_number: "", address: "" });

  const onEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setNotice("");
    if (!editingStudent) return;
    try {
      await peopleApi.updateStudent(editingStudent.id, {
        name: editForm.name,
        date_of_birth: editForm.date_of_birth,
        b_form_number: editForm.b_form_number || undefined,
        address: editForm.address || undefined,
      });
      setNotice(t("studentUpdated", "Student updated"));
      setEditingStudent(null);
      await load();
    } catch (err: any) {
      setError(err.response?.data?.detail ?? t("failedUpdateStudent", "Failed to update student"));
    }
  };

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
    void operationsApi.listAdmissionForms().then(setAdmissionForms).catch(() => setAdmissionForms([]));
    if (canCreate) void peopleApi.listGuardians().then(setGuardians).catch(() => setGuardians([]));
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
        admission_form_id: admissionFormId,
        admission_answers: admissionAnswers,
        guardian_ids: guardianIds,
      });
      setNotice(t("createdSetPasswordLink", { code: created.admission_number, url: created.set_password_url }));
      setJustCreated(created);
      setForm({ username: "", name: "", date_of_birth: "", b_form_number: "", address: "" });
      setAdmissionFormId("");
      setAdmissionAnswers({});
      setGuardianIds([]);
      setShowCreate(false);
      await load();
    } catch (err: any) {
      setError(err.response?.data?.detail ?? t("failedCreateStudent"));
    }
  };

  return (
    <>
      <InlineFilter filters={[{
        key: "student-class", type: "select", label: t("classLabel"), value: classFilter,
        placeholder: t("allClasses"), options: classOptions.map((academicClass) => ({ value: academicClass.id, label: academicClass.name })),
        onChange: setClassFilter,
      }]}>
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
      </InlineFilter>

      {showCreate && canCreate && (
        <FormModal
                title={t("addStudentBtn")} onClose={() => setShowCreate(false)}
                onSubmit={onSubmit}
                submitLabel={t("addStudentBtn")}
                submitIcon={<UserPlus size={16} />}
              >
                <label>
                  {t("admissionFormLabel")}
                  <Select required value={admissionFormId} onChange={(event) => { setAdmissionFormId(event.target.value); setAdmissionAnswers({}); }}>
                    <option value="">{t("selectAdmissionFormPlaceholder")}</option>
                    {admissionForms.map((item) => <option value={item.id} key={item.id}>{item.title} · {item.is_open ? t("openStatusLabel") : t("closedStatusLabel")}</option>)}
                  </Select>
                </label>
                <label>{t("usernameLabel")}<Input required value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} /></label>

              <label>{t("studentNameLabel")}<Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>

              <label>{t("dobLabel")}<Input required type="date" value={form.date_of_birth} onChange={(e) => setForm({ ...form, date_of_birth: e.target.value })} /></label>

              <label>{t("bFormLabel")}<Input value={form.b_form_number} onChange={(e) => setForm({ ...form, b_form_number: e.target.value })} /></label>

              <label>{t("addressLabel")}<Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></label>
              <fieldset className="choiceField">
                <legend>{t("linkGuardiansLabel")}</legend>
                <small className="notice">{t("linkGuardiansHint")}</small>
                {guardians.length === 0 && <p className="emptyState">{t("noGuardiansYet")}</p>}
                {guardians.map((guardian) => (
                  <label className="checkboxLabel" key={guardian.id}>
                    <Checkbox
                      checked={guardianIds.includes(guardian.id)}
                      onChange={(event) => setGuardianIds(event.target.checked
                        ? [...guardianIds, guardian.id]
                        : guardianIds.filter((id) => id !== guardian.id))}
                    />
                    <span>{guardian.name} · {guardian.relationship} · {guardian.phone_numbers}</span>
                  </label>
                ))}
              </fieldset>
              {admissionForms.find((item) => item.id === admissionFormId)?.fields_definition.map((field) => {
                if (field.type === "label") return <p className="formSectionLabel" key={field.key}>{field.label}</p>;
                if (field.type === "textarea") return <label key={field.key}>{field.label}<Textarea required={field.required} value={String(admissionAnswers[field.key] ?? "")} onChange={(event) => setAdmissionAnswers({ ...admissionAnswers, [field.key]: event.target.value })} /></label>;
                if (field.type === "dropdown") return <label key={field.key}>{field.label}<Select required={field.required} value={String(admissionAnswers[field.key] ?? "")} onChange={(event) => setAdmissionAnswers({ ...admissionAnswers, [field.key]: event.target.value })}><option value="">{t("selectEllipsis")}</option>{field.options.map((option) => <option key={option} value={option}>{option}</option>)}</Select></label>;
                if (field.type === "radio") return <fieldset className="choiceField" key={field.key}><legend>{field.label}</legend>{field.options.map((option) => <label className="checkboxLabel" key={option}><Input type="radio" name={`admission-${field.key}`} required={field.required} checked={admissionAnswers[field.key] === option} onChange={() => setAdmissionAnswers({ ...admissionAnswers, [field.key]: option })} />{option}</label>)}</fieldset>;
                if (field.type === "checkbox_group") {
                  const chosen = Array.isArray(admissionAnswers[field.key]) ? admissionAnswers[field.key] as string[] : [];
                  return <fieldset className="choiceField" key={field.key}><legend>{field.label}</legend>{field.options.map((option) => <label className="checkboxLabel" key={option}><Checkbox checked={chosen.includes(option)} onChange={(event) => setAdmissionAnswers({ ...admissionAnswers, [field.key]: event.target.checked ? [...chosen, option] : chosen.filter((item) => item !== option) })} />{option}</label>)}</fieldset>;
                }
                return <label key={field.key}>{field.label}<Input required={field.required} value={String(admissionAnswers[field.key] ?? "")} onChange={(event) => setAdmissionAnswers({ ...admissionAnswers, [field.key]: event.target.value })} /></label>;
              })}
              </FormModal>
      )}

      {editingStudent && canCreate && (
        <FormModal
          title={t("editStudentBtn", "Edit Student")} onClose={() => setEditingStudent(null)}
          onSubmit={onEditSubmit}
          submitLabel={t("saveBtn")}
          submitIcon={<Edit2 size={16} />}
        >
          <label>{t("fullNameLabel")}<Input required value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} /></label>
          <label>{t("dobCol")}<Input type="date" required value={editForm.date_of_birth} onChange={(e) => setEditForm({ ...editForm, date_of_birth: e.target.value })} /></label>
          <label>{t("bFormLabel")}<Input value={editForm.b_form_number} onChange={(e) => setEditForm({ ...editForm, b_form_number: e.target.value })} /></label>
          <label>{t("addressLabel")}<Input value={editForm.address} onChange={(e) => setEditForm({ ...editForm, address: e.target.value })} /></label>
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
              {canCreate && (
                <Button className="tableAction" type="button" title={t("editBtn", "Edit")} onClick={() => {
                  setEditingStudent(s);
                  setEditForm({
                    name: s.name,
                    date_of_birth: s.date_of_birth,
                    b_form_number: s.b_form_number || "",
                    address: s.address || "",
                  });
                }}>
                  <Edit2 size={14} />
                </Button>
              )}
              {!s.active_enrollment && !s.current_class && <Button className="tableAction" type="button" title={t("assignClassBtn", "Assign Class")} onClick={() => setAssignClassStudent(s)}>
                <GraduationCap size={14} />
              </Button>}
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

      {assignClassStudent && (
        <AssignClassModal
          student={assignClassStudent}
          onClose={() => setAssignClassStudent(null)}
          onSuccess={() => { void load(""); }}
        />
      )}

      {detail && <StudentDetail student={detail} canFinance={canFinance} onClose={() => setDetail(null)} onUpdate={() => { setDetail(null); void load(); }} />}
    </>
  );
}

function StudentDetail({
  student,
  canFinance,
  onClose,
  onUpdate,
}: Readonly<{ student: Student; canFinance: boolean; onClose: () => void; onUpdate: () => void }>) {
  const { t } = useTranslation();
  const { confirm } = useDialog();
  const [guardians, setGuardians] = useState<Guardian[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [categories, setCategories] = useState<PaymentCategory[]>([]);
  const [feeForm, setFeeForm] = useState({ category_id: "", amount: "", payment_date: "" });
  const [showFeeModal, setShowFeeModal] = useState(false);
  const [error, setError] = useState("");
  const [selectedGuardian, setSelectedGuardian] = useState<Guardian | null>(null);

  const [showEnrollModal, setShowEnrollModal] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [editForm, setEditForm] = useState({
    name: student.name, date_of_birth: student.date_of_birth, admission_number: student.admission_number ?? "",
    portal_enabled: student.portal_enabled,
    b_form_number: student.b_form_number ?? "", address: student.address ?? "", notes: student.notes ?? ""
  });
  const { hasPermission } = useAuth();
  const canEdit = hasPermission("students.edit");
  const activeEnrollment = student.active_enrollment;

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
    <Modal
      title={t("studentDetailsHeading")}
      onClose={onClose}
      actions={
        <>
          {canEdit && (
            <Button className="secondaryAction" onClick={() => setShowEdit(true)}>
              <Pencil size={16} /> {t("edit", "Edit")}
            </Button>
          )}
          {!activeEnrollment && !student.current_class && <Button className="secondaryAction" onClick={() => setShowEnrollModal(true)}>{t("assignClassBtn")}</Button>}
          {activeEnrollment && <Button className="secondaryAction dangerAction" onClick={async () => {
            if (!(await confirm(t("unassignStudentConfirm", { class: activeEnrollment.class_name })))) return;
            try {
              await academicsApi.unassignStudent(student.id, activeEnrollment.session_id);
              onUpdate();
            } catch (err: any) {
              setError(err.response?.data?.detail ?? t("failedToUnassignStudent"));
            }
          }}><UserMinus size={16} /> {t("unassignClassBtn")}</Button>}
        </>
      }
    >
      <div className="detailPanel" style={{ padding: "1.5rem" }}>
        <section className="personHero" aria-label={t("studentIdentityHeading")}>
          <div><span>{t("fullNameLabel")}</span><strong>{student.name}</strong></div>
          <div><span>{t("usernameLabel")}</span><strong>{student.username || "—"}</strong></div>
          <div><span>{t("currentClassLabel")}</span><strong>{activeEnrollment ? `${activeEnrollment.class_name} / ${activeEnrollment.section_name}` : (student.current_class || t("notAssignedLabel"))}</strong></div>
        </section>
        <section className="detailSection">
          <h4>{t("studentIdentityHeading")}</h4>
          <dl className="detailGrid">
            <dt>{t("admissionNumberCol")}</dt><dd>{student.admission_number}</dd>
            <dt>{t("dobCol")}</dt><dd>{student.date_of_birth}</dd>
            <dt>{t("bFormLabel")}</dt><dd>{student.b_form_number || "—"}</dd>
            <dt>{t("addressLabel")}</dt><dd>{student.address || "—"}</dd>
            <dt>{t("portalCol")}</dt><dd>{student.portal_enabled ? t("enabledLabel") : t("disabledLabel")}</dd>
            <dt>{t("statusCol")}</dt><dd>{student.status}</dd>
            <dt>{t("notesLabel")}</dt><dd>{student.notes || "—"}</dd>
          </dl>
        </section>

      {student.admission_record && <section className="detailSection">
        <h4>{t("admissionOriginHeading")}</h4>
        <dl className="detailGrid">
          <dt>{t("admissionFormLabel")}</dt><dd>{student.admission_record.form_title || t("sourceWalkIn")}</dd>
          {student.admission_record.fields_definition.map((field) => <div className="detailGridRow" key={field.key}>
            <dt>{field.label}</dt><dd>{String(student.admission_record?.answers[field.key] ?? "—")}</dd>
          </div>)}
        </dl>
      </section>}

      <h4>{t("guardians")}</h4>
      <div className="dataTable">
        <div className="dataRow header"><span>{t("nameLabel")}</span><span>{t("relationshipLabel")}</span><span>{t("phoneCol")}</span><span></span></div>
        {guardians.length === 0 && <p className="emptyState">{t("noGuardiansYet")}</p>}
        {guardians.map((g) => (
          <div className="dataRow" key={g.id}>
            <span>{g.name}</span>
            <span>{g.relationship}</span>
            <span>{g.phone_numbers}</span>
            <span>
              <Button className="tableAction" type="button" title={t("viewBtn")} onClick={() => setSelectedGuardian(g)}>
                <Eye size={14} />
              </Button>
            </span>
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
      
      {showEnrollModal && (
        <AssignClassModal
          student={student}
          onClose={() => setShowEnrollModal(false)}
        />
      )}
      {selectedGuardian && (
        <GuardianDetail
          guardian={selectedGuardian}
          onClose={() => setSelectedGuardian(null)}
          onUpdate={() => { setSelectedGuardian(null); void load(); }}
        />
      )}
      </div>
      
      {showEdit && (
        <FormModal
          title={t("editStudent", "Edit Student")}
          onClose={() => setShowEdit(false)}
          submitLabel={t("saveBtn")}
          submitIcon={<Pencil size={16} />}
          onSubmit={async (e) => {
            e.preventDefault();
            setError("");
            try {
              await peopleApi.updateStudent(student.id, {
                name: editForm.name,
                date_of_birth: editForm.date_of_birth,
                admission_number: editForm.admission_number || undefined,
                portal_enabled: editForm.portal_enabled,
                b_form_number: editForm.b_form_number || undefined,
                address: editForm.address || undefined,
                notes: editForm.notes || undefined,
              });
              setShowEdit(false);
              onUpdate();
            } catch (err: any) {
              setError(err.response?.data?.detail ?? t("failedToUpdate", "Failed to update"));
            }
          }}
        >
          <label>{t("fullNameLabel")}<Input required value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} /></label>
          <label>{t("dobCol")}<Input type="date" required value={editForm.date_of_birth} onChange={(e) => setEditForm({ ...editForm, date_of_birth: e.target.value })} /></label>
          <label>{t("admissionNumberCol")}<Input value={editForm.admission_number} onChange={(e) => setEditForm({ ...editForm, admission_number: e.target.value })} /></label>
          <label>{t("bFormNumberCol")}<Input value={editForm.b_form_number} onChange={(e) => setEditForm({ ...editForm, b_form_number: e.target.value })} placeholder="12345-1234567-1" /></label>
          <label>{t("addressCol")}<Input value={editForm.address} onChange={(e) => setEditForm({ ...editForm, address: e.target.value })} /></label>
          <label>{t("notesLabel")}<Input value={editForm.notes} onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })} /></label>
          <label className="checkboxLabel"><Input type="checkbox" checked={editForm.portal_enabled} onChange={(e) => setEditForm({ ...editForm, portal_enabled: e.target.checked })} />{t("portalEnabledLabel")}</label>
        </FormModal>
      )}
    </Modal>
  );
}

function AssignClassModal({
  student,
  onClose,
  onSuccess,
}: Readonly<{
  student: Student;
  onClose: () => void;
  onSuccess?: () => void;
}>) {
  const { t } = useTranslation();
  const [sessions, setSessions] = useState<AcademicSession[]>([]);
  const [programs, setPrograms] = useState<Program[]>([]);
  const [classes, setClasses] = useState<AcademicClass[]>([]);
  const [sections, setSections] = useState<Section[]>([]);
  const [enrollForm, setEnrollForm] = useState({ session_id: "", program_id: "", class_id: "", section_id: "" });
  const [enrollError, setEnrollError] = useState("");

  useEffect(() => {
    void academicsApi.listSessions().then(setSessions).catch(() => setSessions([]));
    void academicsApi.listPrograms().then(setPrograms).catch(() => setPrograms([]));
    void academicsApi.listClasses().then(setClasses).catch(() => setClasses([]));
  }, []);

  useEffect(() => {
    if (enrollForm.class_id) {
      void academicsApi.listSections(enrollForm.class_id).then(setSections).catch(() => setSections([]));
    } else {
      setSections([]);
    }
  }, [enrollForm.class_id]);

  return (
    <FormModal
      title={t("assignClassBtn", "Assign Class")}
      onClose={onClose}
      submitLabel={t("saveBtn")}
      error={enrollError}
      onSubmit={async (e) => {
        e.preventDefault();
        setEnrollError("");
        try {
          await academicsApi.enrollStudent({
            student_id: student.id,
            session_id: enrollForm.session_id,
            program_id: enrollForm.program_id,
            class_id: enrollForm.class_id,
            section_id: enrollForm.section_id,
          });
          onSuccess?.();
          onClose();
        } catch (err: any) {
          setEnrollError(err.response?.data?.detail ?? t("failedToEnroll", "Failed to enroll student"));
        }
      }}
    >
      <label>
        {t("sessionLabel", "Session")}
        <Select required value={enrollForm.session_id} onChange={(e) => setEnrollForm({ ...enrollForm, session_id: e.target.value })}>
          <option value="">{t("selectEllipsis")}</option>
          {sessions.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </Select>
      </label>
      <label>
        {t("programLabel")}
        <Select required value={enrollForm.program_id} onChange={(e) => setEnrollForm({ ...enrollForm, program_id: e.target.value, class_id: "", section_id: "" })}>
          <option value="">{t("selectEllipsis")}</option>
          {programs.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </Select>
      </label>
      <label>
        {t("classLabel")}
        <Select required value={enrollForm.class_id} onChange={(e) => setEnrollForm({ ...enrollForm, class_id: e.target.value, section_id: "" })}>
          <option value="">{t("selectEllipsis")}</option>
          {classes.filter(c => !enrollForm.program_id || c.program_id === enrollForm.program_id).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
      </label>
      <label>
        {t("sectionLabel", "Section")}
        <Select required value={enrollForm.section_id} onChange={(e) => setEnrollForm({ ...enrollForm, section_id: e.target.value })}>
          <option value="">{t("selectEllipsis")}</option>
          {sections.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </Select>
      </label>
    </FormModal>
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
  const [search, setSearch] = useState("");
  const [students, setStudents] = useState<Student[]>([]);
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [detail, setDetail] = useState<Guardian | null>(null);
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
  const searchStudents = async (query: string) => {
    setSearch(query);
    if (query.length < 2) return setStudents([]);
    try {
      const res = await peopleApi.listStudentsPage({ search: query, limit: 5, offset: 0 });
      setStudents(res.items);
    } catch {
      setStudents([]);
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
                              student_ids: selectedStudent ? [selectedStudent.id] : [],
                            });
                            setForm({ name: "", relationship: "", phone_numbers: "", cnic: "", address: "" });
                            setSelectedStudent(null);
                            setSearch("");
                            setStudents([]);
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

              <label>{t("cnicLabel")}<Input value={form.cnic} onChange={(e) => setForm({ ...form, cnic: e.target.value })} placeholder="12345-1234567-1" /></label>

              <label>{t("addressCol")}<Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></label>
              
              <div style={{ marginTop: "1rem", borderTop: "1px solid var(--border)", paddingTop: "1rem" }}>
                <label style={{ marginBottom: "0.5rem", display: "block", fontWeight: 500 }}>
                  {t("linkStudentLabel", "Link Student (Optional)")}
                </label>
                {selectedStudent ? (
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0.5rem", border: "1px solid var(--border)", borderRadius: "4px" }}>
                    <span>{selectedStudent.name} ({selectedStudent.username || selectedStudent.admission_number})</span>
                    <Button className="iconBtn danger" type="button" onClick={() => setSelectedStudent(null)}><UserMinus size={14} /></Button>
                  </div>
                ) : (
                  <>
                    <Input placeholder={t("searchStudents", "Search students...")} value={search} onChange={(e) => searchStudents(e.target.value)} />
                    {students.length > 0 && (
                      <div className="searchResults" style={{ marginTop: "0.5rem", border: "1px solid var(--border)", borderRadius: "4px", maxHeight: "150px", overflowY: "auto" }}>
                        {students.map((s) => (
                          <div key={s.id} style={{ padding: "0.5rem", cursor: "pointer", borderBottom: "1px solid var(--border)" }} onClick={() => { setSelectedStudent(s); setStudents([]); setSearch(""); }}>
                            {s.name} ({s.username || s.admission_number})
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
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
            <>
              <Button className="tableAction" type="button" title={t("viewBtn")} onClick={() => setDetail(g)}>
                <Eye size={14} />
              </Button>
              {canSendCredentials && (
                <Button className="tableAction" type="button" onClick={() => provisionLogin(g)}>
                  <KeyRound size={14} /> {t("loginLinkBtn")}
                </Button>
              )}
            </>
          )},
        ]}
        data={guardians}
        keyExtractor={(g) => g.id}
        isLoading={isLoading}
        emptyMessage={t("noGuardiansYet")}
      />
      <PaginationControls state={pagination} total={total} onChange={setPagination} />

      {detail && (
        <GuardianDetail guardian={detail} onClose={() => setDetail(null)} onUpdate={() => { setDetail(null); void load(); }} />
      )}
    </>
  );
}

function GuardianDetail({ guardian, onClose, onUpdate }: Readonly<{ guardian: Guardian; onClose: () => void; onUpdate: () => void }>) {
  const { t } = useTranslation();
  const { confirm: confirmDialog } = useDialog();
  const [students, setStudents] = useState<Student[]>([]);
  const [linkedStudents, setLinkedStudents] = useState<Student[]>([]);
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [showEdit, setShowEdit] = useState(false);
  const [editForm, setEditForm] = useState({
    name: guardian.name, relationship: guardian.relationship, phone_numbers: guardian.phone_numbers,
    cnic: guardian.cnic ?? "", address: guardian.address ?? ""
  });
  const { hasPermission } = useAuth();
  const canEdit = hasPermission("students.edit");

  const loadLinked = async () => {
    try {
      const data = await peopleApi.getGuardianStudents(guardian.id);
      setLinkedStudents(data);
    } catch (err: any) {
      setError(err.response?.data?.detail ?? t("failedLoadStudents", "Failed to load students"));
    }
  };

  useEffect(() => {
    void loadLinked();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [guardian.id]);

  const searchStudents = async (query: string) => {
    setSearch(query);
    if (query.length < 2) return setStudents([]);
    try {
      const res = await peopleApi.listStudentsPage({ search: query, limit: 10, offset: 0 });
      setStudents(res.items);
    } catch {
      setStudents([]);
    }
  };

  const linkStudent = async (student: Student) => {
    setError("");
    try {
      await peopleApi.linkStudentToGuardian(guardian.id, student.id);
      setSearch("");
      setStudents([]);
      await loadLinked();
    } catch (err: any) {
      setError(err.response?.data?.detail ?? t("failedToLink", "Failed to link student"));
    }
  };

  const unlinkStudent = async (studentId: string) => {
    if (!(await confirmDialog(t("confirmUnlink", "Are you sure you want to unlink this student?")))) return;
    setError("");
    try {
      await peopleApi.unlinkStudentFromGuardian(guardian.id, studentId);
      await loadLinked();
    } catch (err: any) {
      setError(err.response?.data?.detail ?? t("failedToUnlink", "Failed to unlink student"));
    }
  };

  return (
    <Modal 
      title={guardian.name} 
      onClose={onClose}
      actions={
        canEdit ? (
          <Button className="secondaryAction" onClick={() => setShowEdit(true)}>
            <Pencil size={16} /> {t("edit", "Edit")}
          </Button>
        ) : null
      }
    >
      <div className="detailPanel" style={{ padding: "1.5rem" }}>
      <section className="guardianIdentityCard">
        <div className="personHero compactPersonHero">
          <div><span>{t("fullNameLabel")}</span><strong>{guardian.name}</strong></div>
          <div><span>{t("relationshipLabel")}</span><strong>{guardian.relationship}</strong></div>
          <div><span>{t("portalCol")}</span><strong>{guardian.user_id ? t("enabledLabel") : t("disabledLabel")}</strong></div>
        </div>
      <div className="infoGrid">
        <div className="infoGroup">
          <label>{t("relationshipLabel")}</label>
          <div>{guardian.relationship}</div>
        </div>
        <div className="infoGroup">
          <label>{t("phoneCol")}</label>
          <div>{guardian.phone_numbers}</div>
        </div>
        <div className="infoGroup">
          <label>{t("cnicLabel")}</label>
          <div>{guardian.cnic || "—"}</div>
        </div>
        <div className="infoGroup">
          <label>{t("addressLabel")}</label>
          <div>{guardian.address || "—"}</div>
        </div>
      </div>
      </section>

      <div style={{ marginTop: "2rem" }}>
        <h3>{t("linkedStudents", "Linked Students")}</h3>
        {error && <p className="notice" style={{ color: "var(--rose)" }}>{error}</p>}
        
        <div style={{ marginBottom: "1rem" }}>
          <SearchDropdown
            id="guardian-student-search"
            label={t("searchStudentBtn", "Find Student to Link")}
            placeholder={t("studentSearchPlaceholder", "Type name or admission number...")}
            items={students}
            value={search}
            getKey={(s) => s.id}
            getLabel={(s) => s.name}
            getDescription={(s) => `${s.admission_number} · ${s.status}`}
            onQueryChange={(q) => void searchStudents(q)}
            onSelect={(s) => void linkStudent(s)}
            emptyLabel={search.length < 2 ? t("typeToSearch", "Type to search...") : t("noStudentsFound", "No students found")}
          />
        </div>

        <div className="dataList">
          {linkedStudents.length === 0 ? (
            <p className="notice">{t("noStudentsLinked", "No students linked yet.")}</p>
          ) : (
            linkedStudents.map((s) => (
              <div key={s.id} className="linkedPersonCard">
                <div>
                  <strong>{s.name}</strong>
                  <span>{s.admission_number} · {s.current_class || t("notAssignedLabel")}</span>
                </div>
                <Button className="tableAction" type="button" onClick={() => unlinkStudent(s.id)} title={t("unlinkBtn")}>
                  <X size={14} />
                </Button>
              </div>
            ))
          )}
        </div>
      </div>
      </div>
      
      {showEdit && (
        <FormModal
          title={t("editGuardian", "Edit Guardian")}
          onClose={() => setShowEdit(false)}
          submitLabel={t("saveBtn")}
          submitIcon={<Pencil size={16} />}
          onSubmit={async (e) => {
            e.preventDefault();
            setError("");
            try {
              await peopleApi.updateGuardian(guardian.id, {
                name: editForm.name,
                relationship: editForm.relationship,
                phone_numbers: editForm.phone_numbers,
                cnic: editForm.cnic || undefined,
                address: editForm.address || undefined,
              });
              setShowEdit(false);
              onUpdate();
            } catch (err: any) {
              setError(err.response?.data?.detail ?? t("failedToUpdate", "Failed to update"));
            }
          }}
        >
          <label>{t("fullNameLabel")}<Input required value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} /></label>
          <label>{t("relationshipLabel")}<Input required value={editForm.relationship} onChange={(e) => setEditForm({ ...editForm, relationship: e.target.value })} /></label>
          <label>{t("phoneCol")}<Input required value={editForm.phone_numbers} onChange={(e) => setEditForm({ ...editForm, phone_numbers: e.target.value })} /></label>
          <label>{t("cnicLabel")}<Input value={editForm.cnic} onChange={(e) => setEditForm({ ...editForm, cnic: e.target.value })} placeholder="12345-1234567-1" /></label>
          <label>{t("addressCol")}<Input value={editForm.address} onChange={(e) => setEditForm({ ...editForm, address: e.target.value })} /></label>
        </FormModal>
      )}
    </Modal>
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
  const [showEdit, setShowEdit] = useState(false);
  const [editForm, setEditForm] = useState({ name: "", contact: "" });
  const [search, setSearch] = useState("");

  const loadDonors = async (query = search) => {
    setIsLoading(true);
    try {
      setDonors(await financeApi.listDonors({ q: query.trim() || undefined }));
      setError("");
    } catch (err: any) {
      setDonors([]);
      setError(err.response?.data?.detail ?? t("failedLoadDonors"));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void Promise.all([
      loadDonors(),
      financeApi.listCategories().then(setCategories).catch(() => setCategories([])),
    ]).finally(() => setIsLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openDonor = async (donor: Donor) => {
    setSelected(donor);
    setEditForm({ name: donor.name, contact: donor.contact });
    setDonations(await financeApi.listDonations(donor.id));
  };

  return (
    <>
      <InlineFilter filters={[{
        key: "donor-search", type: "input", inputType: "search", value: search,
        ariaLabel: t("searchLabel"), placeholder: t("donorSearchPlaceholder"),
        onChange: (value) => { setSearch(value); void loadDonors(value); },
      }]} />
      {error && <p className="notice" style={{ color: "var(--rose)" }}>{error}</p>}
      <DataTable<Donor>
        columns={[
          { header: t("nameLabel"), render: (d) => d.name },
          { header: t("contactCol"), render: (d) => d.contact },
          { header: t("actionsCol"), render: (d) => (
            <Button className="tableAction" type="button" onClick={() => openDonor(d)}>
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
        <Modal 
          title={selected.name} 
          onClose={() => setSelected(null)}
          actions={
            canWrite ? (
              <Button className="secondaryAction" onClick={() => setShowEdit(true)}>
                <Pencil size={16} /> {t("edit", "Edit")}
              </Button>
            ) : null
          }
        >
          <div className="detailPanel">
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
          
          {showEdit && (
            <FormModal
              title={t("editDonor", "Edit Donor")}
              onClose={() => setShowEdit(false)}
              submitLabel={t("saveBtn")}
              submitIcon={<Pencil size={16} />}
              onSubmit={async (e) => {
                e.preventDefault();
                setError("");
                try {
                  await financeApi.updateDonor(selected.id, editForm);
                  setShowEdit(false);
                  setSelected(null);
                  setIsLoading(true);
                  const newDonors = await financeApi.listDonors({ q: search.trim() || undefined });
                  setDonors(newDonors);
                  setIsLoading(false);
                } catch (err: any) {
                  setError(err.response?.data?.detail ?? t("failedToUpdate", "Failed to update"));
                }
              }}
            >
              <label>{t("donorNameLabel")}<Input required value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} /></label>
              <label>{t("contactCol")}<Input required value={editForm.contact} onChange={(e) => setEditForm({ ...editForm, contact: e.target.value })} /></label>
            </FormModal>
          )}
        </Modal>
      )}
    </>
  );
}
