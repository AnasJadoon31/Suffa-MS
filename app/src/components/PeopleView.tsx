import { Button, PrimaryButton, SecondaryButton, DangerButton, IconButton, TableAction } from "./ui/Button";
import { useEffect, useState } from "react";
import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";
import { Copy, Eye, GraduationCap, HandCoins, KeyRound, Plus, ShieldCheck, UserPlus, UserRoundCog, UsersRound, X, Edit2, Pencil, UserMinus } from "lucide-react";
import { useTranslation } from "react-i18next";
import Fab from "@mui/material/Fab";
import { styled, useTheme } from "@mui/material/styles";

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
import { AdmissionAnswersFields } from "./AdmissionAnswersFields";
import { answerString, BUILT_IN_ADMISSION_KEYS, enabledAdmissionFields } from "../lib/admissionBuiltIns";
import { SearchDropdown } from "./SearchDropdown";
import { CheckboxField, Input, Select } from "./ui/Field";
import { LoadingState } from "./ui/AsyncState";
import { DataTable, type Column } from "./ui/DataTable";
import { DEFAULT_PAGE_SIZE, pageParams, PaginationControls, recoverEmptyPage, type PageState } from "./ui/Pagination";
import { useSessionReadOnly } from "./SessionSwitcher";
import { DelegateModal } from "./DelegateButton";
import { Modal, FormModal } from "./ui/Modal";
import { PageSection, PageHeader } from "./ui/Layout";
import { PhoneInput } from "./ui/PhoneInput";
import { ActionMenu } from "./ui/ActionMenu";
import { DataCard, type DataField } from "./ui/DataCard";
import { DataViewToggle, type ViewMode } from "./ui/DataViewToggle";
import { FilterBar } from "./ui/FilterBar";

const StyledPageSection = styled(PageSection)(({ theme }) => ({
  position: "relative",
  paddingBottom: theme.spacing(10),
}));

const TabBar = styled(Box)(({ theme }) => ({
  display: "flex",
  gap: theme.spacing(1),
  marginBottom: theme.spacing(2),
  flexWrap: "wrap",
}));

const ToolbarRow = styled(Box)(({ theme }) => ({
  display: "flex",
  alignItems: "center",
  gap: theme.spacing(1),
  marginBottom: theme.spacing(2),
  flexWrap: "wrap",
}));

const SearchWrap = styled(Box)(() => ({
  flex: 1,
  minWidth: 200,
}));

const CardsList = styled(Box)(() => ({
  display: "flex",
  flexDirection: "column",
}));

const StyledFab = styled(Fab)(({ theme }) => ({
  position: "fixed",
  bottom: theme.spacing(9),
  right: theme.spacing(2),
  zIndex: 10,
  [theme.breakpoints.up("md")]: {
    bottom: theme.spacing(3),
  },
}));

function SendCredentialsButton({
  subjectType,
  subjectId,
  setPasswordUrl,
}: Readonly<{ subjectType: "student" | "teacher"; subjectId: string; setPasswordUrl: string }>) {
  const { t } = useTranslation();
  const readOnly = useSessionReadOnly();
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const fullUrl = `${window.location.origin}${setPasswordUrl}`;

  const send = async () => {
    setError("");
    try {
      const link = await messagingApi.sendCredentials({
        subject_type: subjectType,
        subject_id: subjectId,
        set_password_url: fullUrl,
      });
      if (link.url) window.open(link.url, "_blank", "noopener,noreferrer");
    } catch (err: any) {
      setError(err.response?.data?.detail ?? t("failedSendCredentials"));
    }
  };

  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap", my: 1 }}>
      <Typography component="span">{t("credentialsReadyLabel")}</Typography>
      <SecondaryButton
        type="button"
        onClick={async () => {
          await navigator.clipboard.writeText(fullUrl);
          setCopied(true);
          setTimeout(() => setCopied(false), 3000);
        }}
      >
        <Copy size={15} /> {copied ? t("linkCopied") : t("copyLinkBtn")}
      </SecondaryButton>
      <SecondaryButton type="button" disabled={readOnly} onClick={() => send()}>
        {t("sendCredentialsBtn")}
      </SecondaryButton>
      {error && <Typography component="span" sx={{ color: "error.main" }}>{error}</Typography>}
    </Box>
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
    <SecondaryButton type="button" disabled={readOnly} title={t("loginLinkTitle")} onClick={() => reissue()}>
      <KeyRound size={14} /> {state === "copied" ? t("linkCopied") : state === "error" ? t("failedLabel") : t("loginLinkBtn")}
    </SecondaryButton>
  );
}

function credentialPhones(value: string) {
  return value
    .split(/[;,]/)
    .map((part) => part.trim())
    .filter(Boolean);
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
    <StyledPageSection>
      <PageHeader title={t("peopleTitle")} notice={t("peopleSubtitle")} />
      {showTabs && (
        <TabBar>
          {hasPermission("teachers.view") && (
            tab === "teachers" ? (
              <PrimaryButton onClick={() => changeTab("teachers")}>
                <UserRoundCog size={16} /> {t("teachers")}
              </PrimaryButton>
            ) : (
              <SecondaryButton onClick={() => changeTab("teachers")}>
                <UserRoundCog size={16} /> {t("teachers")}
              </SecondaryButton>
            )
          )}
          {hasPermission("students.view") && (
            tab === "students" ? (
              <PrimaryButton onClick={() => changeTab("students")}>
                <GraduationCap size={16} /> {t("students")}
              </PrimaryButton>
            ) : (
              <SecondaryButton onClick={() => changeTab("students")}>
                <GraduationCap size={16} /> {t("students")}
              </SecondaryButton>
            )
          )}
          {hasPermission("students.view") && (
            tab === "guardians" ? (
              <PrimaryButton onClick={() => changeTab("guardians")}>
                <UsersRound size={16} /> {t("guardians")}
              </PrimaryButton>
            ) : (
              <SecondaryButton onClick={() => changeTab("guardians")}>
                <UsersRound size={16} /> {t("guardians")}
              </SecondaryButton>
            )
          )}
          {canViewFinance && (
            tab === "donators" ? (
              <PrimaryButton onClick={() => changeTab("donators")}>
                <HandCoins size={16} /> {t("donatorsTab")}
              </PrimaryButton>
            ) : (
              <SecondaryButton onClick={() => changeTab("donators")}>
                <HandCoins size={16} /> {t("donatorsTab")}
              </SecondaryButton>
            )
          )}
        </TabBar>
      )}
      {tab === "teachers" && <TeachersTab canCreate={!readOnly && hasPermission("teachers.add")} canSalary={canSalary} />}
      {tab === "students" && <StudentsTab canCreate={!readOnly && hasPermission("students.add")} canFinance={canFinance} />}
      {tab === "guardians" && <GuardiansTab canCreate={!readOnly && hasPermission("students.add")} canSendCredentials={!readOnly && hasPermission("students.send_credentials")} />}
      {tab === "donators" && canViewFinance && <DonatorsTab canWrite={canFinance} />}
    </StyledPageSection>
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
  const [usernameEdited, setUsernameEdited] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [justCreated, setJustCreated] = useState<Teacher | null>(null);
  const [detail, setDetail] = useState<Teacher | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [pagination, setPagination] = useState<PageState>({ page: 0, pageSize: DEFAULT_PAGE_SIZE });
  const [total, setTotal] = useState(0);
  const [viewMode, setViewMode] = useState<ViewMode>("cards");

  const reissueCredentials = async (teacher: Teacher) => {
    try {
      const result = await peopleApi.reissueTeacherCredentials(teacher.id);
      const fullUrl = `${window.location.origin}${result.set_password_url}`;
      await navigator.clipboard.writeText(fullUrl);
      await messagingApi.sendCredentials({
        subject_type: "teacher",
        subject_id: teacher.id,
        set_password_url: fullUrl,
      });
      setNotice(t("credentialsSentLabel"));
    } catch (err: any) {
      const detail = err.response?.data?.detail;
      if (typeof detail === "string") setError(detail);
      else setNotice(t("linkCopied"));
    }
  };

  useEffect(() => {
    if (usernameEdited || !form.name.trim()) return;
    const timer = window.setTimeout(() => {
      void peopleApi.usernameProposal(form.name).then((username) => {
        setForm((current) => ({ ...current, username }));
      });
    }, 250);
    return () => window.clearTimeout(timer);
  }, [form.name, usernameEdited]);

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
      setNotice(t("createdAccountReady", { code: created.employee_code }));
      setJustCreated(created);
      setForm({ username: "", name: "", whatsapp_number: "", qualifications: "", join_date: "", cnic: "", address: "", emergency_contact: "", is_principal_delegate: false });
      setUsernameEdited(false);
      setShowCreate(false);
      await load();
    } catch (err: any) {
      setError(err.response?.data?.detail ?? t("failedCreateTeacher"));
    }
  };

  const teacherFields = (teacher: Teacher): DataField[] => [
    { label: t("codeCol"), value: teacher.employee_code },
    { label: t("whatsappCol"), value: teacher.whatsapp_number || "—" },
    { label: t("statusCol"), value: teacher.status },
  ];

  return (
    <>
      <ToolbarRow>
        <SearchWrap>
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
        </SearchWrap>
        <DataViewToggle viewKey="people-teachers" onChange={setViewMode} />
        {search && (
          <SecondaryButton onClick={() => { setSearch(""); setPagination((current) => ({ ...current, page: 0 })); void load(""); }}>
            {t("cancelBtn")}
          </SecondaryButton>
        )}
      </ToolbarRow>

      {showCreate && canCreate && (
        <FormModal
                title={t("addTeacherBtn")} onClose={() => setShowCreate(false)}
                onSubmit={onSubmit}
                submitLabel={t("addTeacherBtn")}
                submitIcon={<UserPlus size={16} />}
              >
                <label>{t("usernameLabel")}<Input required value={form.username} onChange={(e) => { setUsernameEdited(true); setForm({ ...form, username: e.target.value }); }} /></label>

              <label>{t("fullNameLabel")}<Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>

              <PhoneInput id="teacher-whatsapp" label={t("whatsappNumberLabel")} value={form.whatsapp_number} onChange={(value) => setForm({ ...form, whatsapp_number: value })} />

              <label>{t("qualificationsLabel")}<Input value={form.qualifications} onChange={(e) => setForm({ ...form, qualifications: e.target.value })} /></label>

              <label>{t("joinDateLabel")}<Input type="date" value={form.join_date} onChange={(e) => setForm({ ...form, join_date: e.target.value })} /></label>

              <label>{t("cnicLabel")}<Input value={form.cnic} onChange={(e) => setForm({ ...form, cnic: e.target.value })} /></label>

              <label>{t("addressLabel")}<Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></label>

              <label>{t("emergencyContactLabel")}<Input value={form.emergency_contact} onChange={(e) => setForm({ ...form, emergency_contact: e.target.value })} /></label>

              <CheckboxField
                checked={form.is_principal_delegate}
                onChange={(e) => setForm({ ...form, is_principal_delegate: e.target.checked })}
                label={t("principalDelegateLabel", "Delegate as Principal (Access all menus)")}
              />
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
          <PhoneInput id="teacher-whatsapp-edit" required label={t("whatsappNumberLabel")} value={editForm.whatsapp_number} onChange={(value) => setEditForm({ ...editForm, whatsapp_number: value })} />
          <label>{t("qualificationsLabel")}<Input value={editForm.qualifications} onChange={(e) => setEditForm({ ...editForm, qualifications: e.target.value })} /></label>
          <label>{t("joinDateLabel")}<Input type="date" value={editForm.join_date} onChange={(e) => setEditForm({ ...editForm, join_date: e.target.value })} /></label>
          <label>{t("cnicLabel")}<Input value={editForm.cnic} onChange={(e) => setEditForm({ ...editForm, cnic: e.target.value })} /></label>
          <label>{t("addressLabel")}<Input value={editForm.address} onChange={(e) => setEditForm({ ...editForm, address: e.target.value })} /></label>
          <label>{t("emergencyContactLabel")}<Input value={editForm.emergency_contact} onChange={(e) => setEditForm({ ...editForm, emergency_contact: e.target.value })} /></label>
          <CheckboxField
            checked={editForm.is_principal_delegate}
            onChange={(e) => setEditForm({ ...editForm, is_principal_delegate: e.target.checked })}
            label={t("principalDelegateLabel", "Delegate as Principal (Access all menus)")}
          />
        </FormModal>
      )}
      {error && <Typography color="error.main">{error}</Typography>}
      {notice && <Typography>{notice}</Typography>}
      {justCreated?.set_password_url && (
        <SendCredentialsButton subjectType="teacher" subjectId={justCreated.id} setPasswordUrl={justCreated.set_password_url} />
      )}

      {viewMode === "cards" ? (
        <CardsList>
          {isLoading && <LoadingState />}
          {!isLoading && teachers.length === 0 && <p>{t("noTeachersYet")}</p>}
          {!isLoading && teachers.map((teacher) => (
            <DataCard
              key={teacher.id}
              title={teacher.name}
              subtitle={teacher.employee_code}
              avatar={teacher.name.charAt(0)}
              fields={teacherFields(teacher)}
              status={teacher.status}
              actions={
                <>
                  {canCreate && (
                    <SecondaryButton onClick={() => {
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
                      <Edit2 size={14} /> {t("editBtn")}
                    </SecondaryButton>
                  )}
                  <SecondaryButton onClick={() => setDetail(teacher)}>
                    <Eye size={14} /> {t("viewBtn")}
                  </SecondaryButton>
                  <ReissueCredentialsButton subjectType="teacher" subjectId={teacher.id} />
                </>
              }
            />
          ))}
        </CardsList>
      ) : (
        <DataTable<Teacher>
          columns={[
            { header: t("codeCol"), render: (teacher) => teacher.employee_code },
            { header: t("nameLabel"), render: (teacher) => teacher.name },
            { header: t("whatsappCol"), render: (teacher) => teacher.whatsapp_number || "—" },
            { header: t("statusCol"), render: (teacher) => teacher.status },
            { header: t("actionsCol"), render: (teacher) => (
              <ActionMenu items={[
                ...(canCreate ? [{
                  label: t("editBtn"),
                  icon: <Edit2 size={14} />,
                  onClick: () => {
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
                  },
                }] : []),
                { label: t("viewBtn"), icon: <Eye size={14} />, onClick: () => setDetail(teacher) },
                { label: t("loginLinkBtn"), icon: <KeyRound size={14} />, onClick: () => reissueCredentials(teacher) },
              ]} ariaLabel={`${t("actionsCol")}: ${teacher.name}`} />
            )},
          ]}
          data={teachers}
          keyExtractor={(teacher) => teacher.id}
          isLoading={isLoading}
          emptyMessage={t("noTeachersYet")}
        />
      )}
      <PaginationControls state={pagination} total={total} onChange={setPagination} />

      {detail && <TeacherDetail teacher={detail} canSalary={canSalary} onClose={() => setDetail(null)} onUpdate={() => { setDetail(null); void load(); }} />}

      {canCreate && (
        <StyledFab color="primary" aria-label={t("addTeacherBtn")} onClick={() => setShowCreate(true)}>
          <Plus size={24} />
        </StyledFab>
      )}
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
            <SecondaryButton onClick={() => setShowEdit(true)}>
              <Pencil size={16} /> {t("edit", "Edit")}
            </SecondaryButton>
          )}
          {user?.role === "principal" && (
            <SecondaryButton onClick={() => setShowDelegate(true)}>
              <ShieldCheck size={16} /> {t("delegateBtn")}
            </SecondaryButton>
          )}
        </>
      }
    >
      <Box sx={{ p: 3 }}>
        <Box component="dl" sx={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "4px 16px" }}>
          <dt>{t("whatsappCol")}</dt><dd>{teacher.whatsapp_number || "—"}</dd>
          <dt>{t("qualificationsLabel")}</dt><dd>{teacher.qualifications ?? "—"}</dd>
          <dt>{t("joinDateLabel")}</dt><dd>{teacher.join_date ?? "—"}</dd>
          <dt>{t("statusCol")}</dt><dd>{teacher.status}</dd>
        </Box>
      {showDelegate && (
        <DelegateModal
          initialTeacherUserId={teacher.user_id}
          onClose={() => setShowDelegate(false)}
        />
      )}

      {canSalary && (
        <>
          <h4>{t("salaryHistoryHeading")}</h4>
          <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
            {payments.length === 0 && <p>{t("noPaymentsYet")}</p>}
            {payments.map((p) => (
              <Paper key={p.id} variant="outlined" sx={{ p: 1.5 }}>
                <Box sx={{ display: "flex", justifyContent: "space-between" }}>
                  <span>{p.payment_date}</span>
                  <strong>{p.amount} {p.currency}</strong>
                </Box>
                <small>{p.period_covered} · {p.method}</small>
              </Paper>
            ))}
          </Box>
          <Box sx={{ mt: 2 }}>
            <PrimaryButton onClick={() => setShowPayModal(true)}>
              <Plus size={16} /> {t("recordSalaryBtn")}
            </PrimaryButton>
          </Box>

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
      </Box>
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
          <PhoneInput id="teacher-detail-whatsapp-edit" required label={t("whatsappCol")} value={editForm.whatsapp_number} onChange={(value) => setEditForm({ ...editForm, whatsapp_number: value })} />
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
  const [form, setForm] = useState({ username: "" });
  const [usernameEdited, setUsernameEdited] = useState(false);
  const [admissionForms, setAdmissionForms] = useState<AdmissionForm[]>([]);
  const [admissionFormId, setAdmissionFormId] = useState("");
  const [admissionAnswers, setAdmissionAnswers] = useState<Record<string, unknown>>({});
  const [guardians, setGuardians] = useState<Guardian[]>([]);
  const [guardianIds, setGuardianIds] = useState<string[]>([]);
  const [guardianMode, setGuardianMode] = useState<"link" | "create" | "independent">("link");
  const [guardianSearch, setGuardianSearch] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [justCreated, setJustCreated] = useState<Student | null>(null);
  const [detail, setDetail] = useState<Student | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [pagination, setPagination] = useState<PageState>({ page: 0, pageSize: DEFAULT_PAGE_SIZE });
  const [total, setTotal] = useState(0);
  const [viewMode, setViewMode] = useState<ViewMode>("cards");

  const reissueCredentials = async (student: Student) => {
    try {
      const result = await peopleApi.reissueStudentCredentials(student.id);
      const fullUrl = `${window.location.origin}${result.set_password_url}`;
      await navigator.clipboard.writeText(fullUrl);
      await messagingApi.sendCredentials({
        subject_type: "student",
        subject_id: student.id,
        set_password_url: fullUrl,
      });
      setNotice(t("credentialsSentLabel"));
    } catch (err: any) {
      const detail = err.response?.data?.detail;
      if (typeof detail === "string") setError(detail);
      else setNotice(t("linkCopied"));
    }
  };

  useEffect(() => {
    const studentName = answerString(admissionAnswers, BUILT_IN_ADMISSION_KEYS.studentName);
    if (usernameEdited || !studentName) return;
    const timer = window.setTimeout(() => {
      void peopleApi.usernameProposal(studentName).then((username) => {
        setForm((current) => ({ ...current, username }));
      });
    }, 250);
    return () => window.clearTimeout(timer);
  }, [admissionAnswers, usernameEdited]);

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
  const selectedAdmissionForm = admissionForms.find((item) => item.id === admissionFormId);
  const selectedAdmissionFields = enabledAdmissionFields(selectedAdmissionForm?.fields_definition ?? []);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setNotice("");
    try {
      let selectedGuardianIds = guardianMode === "link" ? guardianIds : [];
      if (guardianMode === "create") {
        const guardianAnswers = [
          admissionAnswers,
          ...(Array.isArray(admissionAnswers.guardians) ? admissionAnswers.guardians as Record<string, unknown>[] : []),
        ];
        const createdGuardians = await Promise.all(guardianAnswers.map((guardianAnswer) => peopleApi.createGuardian({
          name: answerString(guardianAnswer, BUILT_IN_ADMISSION_KEYS.guardianName),
          relationship: answerString(guardianAnswer, BUILT_IN_ADMISSION_KEYS.guardianRelationship),
          phone_numbers: answerString(guardianAnswer, BUILT_IN_ADMISSION_KEYS.guardianPhoneNumbers),
          cnic: answerString(guardianAnswer, BUILT_IN_ADMISSION_KEYS.guardianCnic) || undefined,
          address: answerString(guardianAnswer, BUILT_IN_ADMISSION_KEYS.guardianAddress) || undefined,
          preferred_language: answerString(guardianAnswer, BUILT_IN_ADMISSION_KEYS.guardianPreferredLanguage) || undefined,
        })));
        selectedGuardianIds = createdGuardians.map((guardian) => guardian.id);
      }
      const created = await peopleApi.createStudent({
        username: form.username,
        is_independent: guardianMode === "independent",
        admission_form_id: admissionFormId,
        admission_answers: admissionAnswers,
        guardian_ids: selectedGuardianIds,
      });
      setNotice(t("createdAccountReady", { code: created.admission_number }));
      setJustCreated(created);
      setForm({ username: "" });
      setUsernameEdited(false);
      setAdmissionFormId("");
      setAdmissionAnswers({});
      setGuardianIds([]);
      setGuardianMode("link");
      setGuardianSearch("");
      setShowCreate(false);
      await load();
    } catch (err: any) {
      setError(err.response?.data?.detail ?? t("failedCreateStudent"));
    }
  };

  const studentFields = (s: Student): DataField[] => [
    { label: t("admissionNumberCol"), value: s.admission_number },
    { label: t("dobCol"), value: s.date_of_birth },
    { label: t("portalCol"), value: s.portal_enabled ? t("enabledLabel") : t("disabledLabel") },
    { label: t("statusCol"), value: s.status },
  ];

  return (
    <>
      <FilterBar
        searchValue={search}
        onSearchChange={(query) => {
          setSearch(query);
          if (pagination.page === 0) void load(query);
          else setPagination((current) => ({ ...current, page: 0 }));
        }}
        searchPlaceholder={t("studentSearchPlaceholder")}
        fields={[
          {
            key: "student-class",
            type: "select",
            label: t("classLabel"),
            value: classFilter,
            placeholder: t("allClasses"),
            options: classOptions.map((academicClass) => ({ value: academicClass.id, label: academicClass.name })),
            onChange: setClassFilter,
          },
        ]}
        onClearAll={() => { setSearch(""); setClassFilter(""); setPagination((current) => ({ ...current, page: 0 })); void load(""); }}
      >
        <DataViewToggle viewKey="people-students" onChange={setViewMode} />
      </FilterBar>

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
                <label>{t("usernameLabel")}<Input required value={form.username} onChange={(e) => { setUsernameEdited(true); setForm({ ...form, username: e.target.value }); }} /></label>

              <label>
                {t("guardianHandlingLabel")}
                <Select value={guardianMode} onChange={(event) => setGuardianMode(event.target.value as typeof guardianMode)}>
                  <option value="link">{t("linkExistingGuardianLabel")}</option>
                  <option value="create">{t("createNewGuardianLabel")}</option>
                  <option value="independent">{t("independentStudentLabel")}</option>
                </Select>
              </label>
              {guardianMode === "link" && (
                <Box component="fieldset" sx={{ border: "none", padding: 0 }}>
                  <Box component="legend" sx={{ fontWeight: 600, mb: 1 }}>{t("linkGuardiansLabel")}</Box>
                  <SearchDropdown
                    id="existing-guardian-search"
                    label={t("searchGuardiansLabel")}
                    value={guardianSearch}
                    items={guardians.filter((guardian) => !guardianIds.includes(guardian.id))}
                    getKey={(guardian) => guardian.id}
                    getLabel={(guardian) => guardian.name}
                    getDescription={(guardian) => `${guardian.relationship} · ${guardian.phone_numbers}`}
                    onQueryChange={(query) => {
                      setGuardianSearch(query);
                      void peopleApi.listGuardians(query).then(setGuardians);
                    }}
                    onSelect={(guardian) => {
                      setGuardianIds((current) => [...new Set([...current, guardian.id])]);
                      setGuardianSearch("");
                    }}
                    emptyLabel={t("noGuardiansYet")}
                  />
                  <Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap", mt: 1 }}>
                    {guardianIds.map((guardianId) => {
                      const guardian = guardians.find((item) => item.id === guardianId);
                      return guardian ? (
                        <SecondaryButton key={guardian.id} onClick={() => setGuardianIds((current) => current.filter((id) => id !== guardian.id))}>
                          {guardian.name} <X size={14} />
                        </SecondaryButton>
                      ) : null;
                    })}
                  </Box>
                </Box>
              )}
              {guardianMode === "create" && (
                <p>{t("guardianCreatedFromAdmissionFields", "Guardian details will be created from the selected admission form fields.")}</p>
              )}
              {guardianMode === "independent" && !selectedAdmissionFields.some((field) => field.key === BUILT_IN_ADMISSION_KEYS.studentPhone) && (
                <p>{t("independentStudentPhoneFieldHint", "Enable Student phone on this admission form before creating an independent portal account.")}</p>
              )}
              <AdmissionAnswersFields
                fields={selectedAdmissionForm?.fields_definition ?? []}
                answers={admissionAnswers}
                onChange={setAdmissionAnswers}
                idPrefix="student-admission"
                hideGuardianFields={guardianMode === "independent"}
                allowAdditionalGuardians={guardianMode === "create"}
              />
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
      {error && <Typography color="error.main">{error}</Typography>}
      {notice && <Typography>{notice}</Typography>}
      {justCreated?.set_password_url && (
        <SendCredentialsButton subjectType="student" subjectId={justCreated.id} setPasswordUrl={justCreated.set_password_url} />
      )}

      {viewMode === "cards" ? (
        <CardsList>
          {isLoading && <LoadingState />}
          {!isLoading && visible.length === 0 && <p>{t("noStudentsYet")}</p>}
          {!isLoading && visible.map((s) => (
            <DataCard
              key={s.id}
              title={s.name}
              subtitle={s.admission_number}
              avatar={s.name.charAt(0)}
              fields={studentFields(s)}
              status={s.status}
              actions={
                <>
                  {canCreate && (
                    <SecondaryButton onClick={() => {
                      setEditingStudent(s);
                      setEditForm({
                        name: s.name,
                        date_of_birth: s.date_of_birth,
                        b_form_number: s.b_form_number || "",
                        address: s.address || "",
                      });
                    }}>
                      <Edit2 size={14} /> {t("editBtn")}
                    </SecondaryButton>
                  )}
                  {!s.active_enrollment && !s.current_class && (
                    <SecondaryButton onClick={() => setAssignClassStudent(s)}>
                      <GraduationCap size={14} /> {t("assignClassBtn")}
                    </SecondaryButton>
                  )}
                  <SecondaryButton onClick={() => setDetail(s)}>
                    <Eye size={14} /> {t("viewBtn")}
                  </SecondaryButton>
                  {s.portal_enabled && (
                    <ReissueCredentialsButton subjectType="student" subjectId={s.id} />
                  )}
                </>
              }
            />
          ))}
        </CardsList>
      ) : (
        <DataTable<Student>
          columns={[
            { header: t("admissionNumberCol"), render: (s) => s.admission_number },
            { header: t("studentNameLabel"), render: (s) => s.name },
            { header: t("dobCol"), render: (s) => s.date_of_birth },
            { header: t("portalCol"), render: (s) => s.portal_enabled ? t("enabledLabel") : t("disabledLabel") },
            { header: t("statusCol"), render: (s) => s.status },
            { header: t("actionsCol"), render: (s) => (
              <ActionMenu items={[
                ...(canCreate ? [{
                  label: t("editBtn"),
                  icon: <Edit2 size={14} />,
                  onClick: () => {
                    setEditingStudent(s);
                    setEditForm({
                      name: s.name,
                      date_of_birth: s.date_of_birth,
                      b_form_number: s.b_form_number || "",
                      address: s.address || "",
                    });
                  },
                }] : []),
                ...(!s.active_enrollment && !s.current_class ? [{
                  label: t("assignClassBtn"),
                  icon: <GraduationCap size={14} />,
                  onClick: () => setAssignClassStudent(s),
                }] : []),
                { label: t("viewBtn"), icon: <Eye size={14} />, onClick: () => setDetail(s) },
                ...(s.portal_enabled ? [{
                  label: t("loginLinkBtn"),
                  icon: <KeyRound size={14} />,
                  onClick: () => reissueCredentials(s),
                }] : []),
              ]} ariaLabel={`${t("actionsCol")}: ${s.name}`} />
            )},
          ]}
          data={visible}
          keyExtractor={(s) => s.id}
          isLoading={isLoading}
          emptyMessage={t("noStudentsYet")}
        />
      )}
      <PaginationControls state={pagination} total={total} onChange={setPagination} />

      {assignClassStudent && (
        <AssignClassModal
          student={assignClassStudent}
          onClose={() => setAssignClassStudent(null)}
          onSuccess={() => { void load(""); }}
        />
      )}

      {detail && <StudentDetail student={detail} canFinance={canFinance} onClose={() => setDetail(null)} onUpdate={() => { setDetail(null); void load(); }} />}

      {canCreate && (
        <StyledFab color="primary" aria-label={t("addStudentBtn")} onClick={() => setShowCreate(true)}>
          <Plus size={24} />
        </StyledFab>
      )}
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
    name: student.name, date_of_birth: student.date_of_birth,
    portal_enabled: student.portal_enabled,
    b_form_number: student.b_form_number ?? "", address: student.address ?? "", phone: student.phone ?? "",
    is_independent: student.is_independent, notes: student.notes ?? ""
  });
  const [editAdmissionAnswers, setEditAdmissionAnswers] = useState<Record<string, unknown>>(student.admission_record?.answers ?? {});
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
            <SecondaryButton onClick={() => setShowEdit(true)}>
              <Pencil size={16} /> {t("edit", "Edit")}
            </SecondaryButton>
          )}
          {!activeEnrollment && !student.current_class && <SecondaryButton onClick={() => setShowEnrollModal(true)}>{t("assignClassBtn")}</SecondaryButton>}
          {activeEnrollment && <DangerButton onClick={async () => {
            if (!(await confirm(t("unassignStudentConfirm", { class: activeEnrollment.class_name })))) return;
            try {
              await academicsApi.unassignStudent(student.id, activeEnrollment.session_id);
              onUpdate();
            } catch (err: any) {
              setError(err.response?.data?.detail ?? t("failedToUnassignStudent"));
            }
          }}><UserMinus size={16} /> {t("assignClassBtn")}</DangerButton>}
        </>
      }
    >
      <Box sx={{ p: 3 }}>
        <Box sx={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "4px 16px", mb: 2 }}>
          <dt>{t("fullNameLabel")}</dt><dd><strong>{student.name}</strong></dd>
          <dt>{t("usernameLabel")}</dt><dd><strong>{student.username || "—"}</strong></dd>
          <dt>{t("currentClassLabel")}</dt><dd><strong>{activeEnrollment ? `${activeEnrollment.class_name} / ${activeEnrollment.section_name}` : (student.current_class || t("notAssignedLabel"))}</strong></dd>
        </Box>

        <h4>{t("studentIdentityHeading")}</h4>
        <Box component="dl" sx={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "4px 16px" }}>
          <dt>{t("admissionNumberCol")}</dt><dd>{student.admission_number}</dd>
          <dt>{t("studentPhoneLabel")}</dt><dd>{student.phone || "—"}</dd>
          <dt>{t("studentTypeLabel")}</dt><dd>{student.is_independent ? t("independentStudentLabel") : t("guardianLinkedStudentLabel")}</dd>
          <dt>{t("dobCol")}</dt><dd>{student.date_of_birth}</dd>
          <dt>{t("bFormLabel")}</dt><dd>{student.b_form_number || "—"}</dd>
          <dt>{t("addressLabel")}</dt><dd>{student.address || "—"}</dd>
          <dt>{t("portalCol")}</dt><dd>{student.portal_enabled ? t("enabledLabel") : t("disabledLabel")}</dd>
          <dt>{t("statusCol")}</dt><dd>{student.status}</dd>
          <dt>{t("notesLabel")}</dt><dd>{student.notes || "—"}</dd>
        </Box>

      {student.admission_record && (
        <Box sx={{ mt: 2 }}>
          <h4>{t("admissionOriginHeading")}</h4>
          <Box component="dl" sx={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "4px 16px" }}>
            <dt>{t("admissionFormLabel")}</dt><dd>{student.admission_record.form_title || t("sourceWalkIn")}</dd>
            {student.admission_record.fields_definition.map((field) => (
              <Box key={field.key} sx={{ display: "contents" }}>
                <dt>{field.label}</dt><dd>{String(student.admission_record?.answers[field.key] ?? "—")}</dd>
              </Box>
            ))}
          </Box>
        </Box>
      )}

      <h4>{t("guardians")}</h4>
      <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
        {guardians.length === 0 && <p>{t("noGuardiansYet")}</p>}
        {guardians.map((g) => (
          <Paper key={g.id} variant="outlined" sx={{ p: 1.5, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <strong>{g.name}</strong>
              <small>{g.relationship} · {g.phone_numbers}</small>
            </div>
            <SecondaryButton aria-label={t("viewBtn")} title={t("viewBtn")} onClick={() => setSelectedGuardian(g)}>
              <Eye size={14} />
            </SecondaryButton>
          </Paper>
        ))}
      </Box>

      {canFinance && (
        <>
          <h4>{t("feeHistoryHeading")}</h4>
          <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
            {payments.length === 0 && <p>{t("noPaymentsYet")}</p>}
            {payments.map((p) => (
              <Paper key={p.id} variant="outlined" sx={{ p: 1.5 }}>
                <Box sx={{ display: "flex", justifyContent: "space-between" }}>
                  <span>{p.payment_date}</span>
                  <strong>{p.amount} {p.currency}</strong>
                </Box>
                <small>{categories.find((c) => c.id === p.category_id)?.name ?? "—"}</small>
              </Paper>
            ))}
          </Box>
          <Box sx={{ mt: 2 }}>
            <PrimaryButton onClick={() => setShowFeeModal(true)}>
              <Plus size={16} /> {t("recordFeeBtn")}
            </PrimaryButton>
          </Box>

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
      </Box>
      
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
                portal_enabled: editForm.portal_enabled,
                b_form_number: editForm.b_form_number || undefined,
                address: editForm.address || undefined,
                phone: editForm.phone || undefined,
                is_independent: editForm.is_independent,
                notes: editForm.notes || undefined,
                ...(student.admission_record ? { admission_answers: editAdmissionAnswers } : {}),
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
          <label>{t("bFormNumberCol")}<Input value={editForm.b_form_number} onChange={(e) => setEditForm({ ...editForm, b_form_number: e.target.value })} placeholder="12345-1234567-1" /></label>
          <label>{t("addressCol")}<Input value={editForm.address} onChange={(e) => setEditForm({ ...editForm, address: e.target.value })} /></label>
          <PhoneInput id="student-phone-edit" label={t("studentPhoneLabel")} required={editForm.is_independent && editForm.portal_enabled} value={editForm.phone} onChange={(value) => setEditForm({ ...editForm, phone: value })} />
          <CheckboxField
            checked={editForm.is_independent}
            onChange={(e) => setEditForm({ ...editForm, is_independent: e.target.checked })}
            label={t("independentStudentLabel")}
          />
          <label>{t("notesLabel")}<Input value={editForm.notes} onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })} /></label>
          <CheckboxField
            checked={editForm.portal_enabled}
            onChange={(e) => setEditForm({ ...editForm, portal_enabled: e.target.checked })}
            label={t("portalEnabledLabel")}
          />
          {student.admission_record && (
            <Box component="fieldset" sx={{ border: "none", padding: 0 }}>
              <Box component="legend" sx={{ fontWeight: 600, mb: 1 }}>{t("admissionInformationHeading", "Admission information")}</Box>
              <p>{student.admission_record.form_title || t("sourceWalkIn")}</p>
              <AdmissionAnswersFields
                fields={student.admission_record.fields_definition}
                answers={editAdmissionAnswers}
                onChange={setEditAdmissionAnswers}
                idPrefix="student-edit-admission"
                hideGuardianFields={editForm.is_independent}
              />
            </Box>
          )}
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
  const { prompt } = useDialog();
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
  const [viewMode, setViewMode] = useState<ViewMode>("cards");

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
      const phones = credentialPhones(guardian.phone_numbers);
      let phoneNumber = phones[0] ?? "";
      if (phones.length > 1) {
        const selected = await prompt(t("credentialPhonePrompt", { phones: phones.join(", ") }), {
          title: t("credentialPhoneTitle"),
          placeholder: phones[0],
          defaultValue: phones[0],
          confirmLabel: t("sendCredentialsBtn"),
        });
        if (!selected) return;
        phoneNumber = selected;
      }
      let username: string | undefined;
      if (!guardian.user_id) {
        username = (
          await prompt(t("guardianUsernamePrompt"), {
            title: t("createGuardianLoginTitle"),
            placeholder: t("usernamePlaceholder"),
            confirmLabel: t("createLoginBtn"),
          })
        ) ?? undefined;
        if (!username) return;
      }
      const result = await peopleApi.guardianCredentialsLink(guardian.id, username);
      const fullUrl = `${window.location.origin}${result.set_password_url}`;
      await navigator.clipboard.writeText(fullUrl);
      try {
        const link = await messagingApi.sendCredentials({
          subject_type: "guardian",
          subject_id: guardian.id,
          set_password_url: fullUrl,
          ...(phoneNumber ? { phone_number: phoneNumber } : {}),
        });
        if (link.url) window.open(link.url, "_blank", "noopener,noreferrer");
        setNotice(t("credentialsSentLabel"));
      } catch {
        setNotice(t("guardianLinkCopied", { username: result.username }));
      }
      await load();
    } catch (err: any) {
      setError(err.response?.data?.detail ?? t("failedSendCredentials"));
    }
  };

  const guardianFields = (g: Guardian): DataField[] => [
    { label: t("relationshipLabel"), value: g.relationship },
    { label: t("phoneCol"), value: g.phone_numbers },
    { label: t("portalCol"), value: g.user_id ? t("enabledLabel") : t("disabledLabel") },
  ];

  return (
    <>
      <ToolbarRow>
        <SearchWrap>
          <SearchDropdown
            id="guardian-search"
            label={t("searchLabel")}
            placeholder={t("guardianSearchPlaceholder")}
            items={guardians}
            value={search}
            getKey={(g) => g.id}
            getLabel={(g) => g.name}
            getDescription={(g) => `${g.relationship} · ${g.phone_numbers}`}
            onQueryChange={(query) => {
              setSearch(query);
              if (pagination.page === 0) void load();
              else setPagination((current) => ({ ...current, page: 0 }));
            }}
            onSelect={(g) => {
              setSearch(`${g.name} (${g.relationship})`);
              setGuardians([g]);
            }}
            emptyLabel={t("noGuardiansYet")}
          />
        </SearchWrap>
        <DataViewToggle viewKey="people-guardians" onChange={setViewMode} />
        {search && (
          <SecondaryButton onClick={() => { setSearch(""); setPagination((current) => ({ ...current, page: 0 })); void load(); }}>
            {t("cancelBtn")}
          </SecondaryButton>
        )}
      </ToolbarRow>

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

              <PhoneInput id="guardian-phone" required label={t("phoneCol")} value={form.phone_numbers} onChange={(value) => setForm({ ...form, phone_numbers: value })} />

              <label>{t("cnicLabel")}<Input value={form.cnic} onChange={(e) => setForm({ ...form, cnic: e.target.value })} placeholder="12345-1234567-1" /></label>

              <label>{t("addressCol")}<Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></label>
              
              <Box sx={{ mt: 2, borderTop: "1px solid", borderColor: "divider", pt: 2 }}>
                <Typography component="label" sx={{ mb: 1, display: "block", fontWeight: 500 }}>
                  {t("linkStudentLabel", "Link Student (Optional)")}
                </Typography>
                {selectedStudent ? (
                  <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", p: 1, border: "1px solid", borderColor: "divider", borderRadius: 1 }}>
                    <span>{selectedStudent.name} ({selectedStudent.username || selectedStudent.admission_number})</span>
                    <DangerButton aria-label={t("unlinkBtn")} title={t("unlinkBtn")} onClick={() => setSelectedStudent(null)}><UserMinus size={14} /></DangerButton>
                  </Box>
                ) : (
                  <>
                    <Input placeholder={t("searchStudents", "Search students...")} value={search} onChange={(e) => searchStudents(e.target.value)} />
                    {students.length > 0 && (
                      <Box sx={{ mt: 1, border: "1px solid", borderColor: "divider", borderRadius: 1, maxHeight: 150, overflowY: "auto" }}>
                        {students.map((s) => (
                          <Box key={s.id} sx={{ p: 1, cursor: "pointer", borderBottom: "1px solid", borderColor: "divider" }} onClick={() => { setSelectedStudent(s); setStudents([]); setSearch(""); }}>
                            {s.name} ({s.username || s.admission_number})
                          </Box>
                        ))}
                      </Box>
                    )}
                  </>
                )}
              </Box>
            </FormModal>
      )}
      {error && <Typography color="error.main">{error}</Typography>}
      {notice && <Typography>{notice}</Typography>}

      {viewMode === "cards" ? (
        <CardsList>
          {isLoading && <LoadingState />}
          {!isLoading && guardians.length === 0 && <Typography>{t("noGuardiansYet")}</Typography>}
          {!isLoading && guardians.map((g) => (
            <DataCard
              key={g.id}
              title={g.name}
              subtitle={g.relationship}
              avatar={g.name.charAt(0)}
              fields={guardianFields(g)}
              actions={
                <>
                  <SecondaryButton onClick={() => setDetail(g)}>
                    <Eye size={14} /> {t("viewBtn")}
                  </SecondaryButton>
                  {canSendCredentials && (
                    <SecondaryButton onClick={() => provisionLogin(g)}>
                      <KeyRound size={14} /> {t("loginLinkBtn")}
                    </SecondaryButton>
                  )}
                </>
              }
            />
          ))}
        </CardsList>
      ) : (
        <DataTable<Guardian>
          columns={[
            { header: t("nameLabel"), render: (g) => g.name },
            { header: t("relationshipLabel"), render: (g) => g.relationship },
            { header: t("phoneCol"), render: (g) => g.phone_numbers },
            { header: t("portalCol"), render: (g) => g.user_id ? t("enabledLabel") : t("disabledLabel") },
            { header: t("actionsCol"), render: (g) => (
              <ActionMenu items={[
                { label: t("viewBtn"), icon: <Eye size={14} />, onClick: () => setDetail(g) },
                ...(canSendCredentials ? [{
                  label: t("loginLinkBtn"),
                  icon: <KeyRound size={14} />,
                  onClick: () => provisionLogin(g),
                }] : []),
              ]} ariaLabel={`${t("actionsCol")}: ${g.name}`} />
            )},
          ]}
          data={guardians}
          keyExtractor={(g) => g.id}
          isLoading={isLoading}
          emptyMessage={t("noGuardiansYet")}
        />
      )}
      <PaginationControls state={pagination} total={total} onChange={setPagination} />

      {detail && (
        <GuardianDetail guardian={detail} onClose={() => setDetail(null)} onUpdate={() => { setDetail(null); void load(); }} />
      )}

      {canCreate && (
        <StyledFab color="primary" aria-label={t("addGuardianBtn")} onClick={() => setShowCreate(true)}>
          <Plus size={24} />
        </StyledFab>
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
          <SecondaryButton onClick={() => setShowEdit(true)}>
            <Pencil size={16} /> {t("edit", "Edit")}
          </SecondaryButton>
        ) : null
      }
    >
      <Box sx={{ p: 3 }}>
      <Paper component="section" variant="outlined" sx={{ p: 2, mb: 2 }}>
        <Box sx={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "4px 16px" }}>
          <dt>{t("fullNameLabel")}</dt><dd><strong>{guardian.name}</strong></dd>
          <dt>{t("relationshipLabel")}</dt><dd><strong>{guardian.relationship}</strong></dd>
          <dt>{t("portalCol")}</dt><dd><strong>{guardian.user_id ? t("enabledLabel") : t("disabledLabel")}</strong></dd>
          <dt>{t("phoneCol")}</dt><dd>{guardian.phone_numbers}</dd>
          <dt>{t("cnicLabel")}</dt><dd>{guardian.cnic || "—"}</dd>
          <dt>{t("addressLabel")}</dt><dd>{guardian.address || "—"}</dd>
        </Box>
      </Paper>

      <Box sx={{ mt: 3 }}>
        <Typography variant="h6">{t("linkedStudents", "Linked Students")}</Typography>
        {error && <Typography color="error.main">{error}</Typography>}
        
        <Box sx={{ mb: 2 }}>
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
        </Box>

        <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
          {linkedStudents.length === 0 ? (
            <p>{t("noStudentsLinked", "No students linked yet.")}</p>
          ) : (
            linkedStudents.map((s) => (
              <Paper key={s.id} variant="outlined" sx={{ p: 1.5, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <strong>{s.name}</strong>
                  <span>{s.admission_number} · {s.current_class || t("notAssignedLabel")}</span>
                </div>
                <SecondaryButton aria-label={t("unlinkBtn")} onClick={() => unlinkStudent(s.id)} title={t("unlinkBtn")}>
                  <X size={14} />
                </SecondaryButton>
              </Paper>
            ))
          )}
        </Box>
      </Box>
      </Box>
      
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
          <PhoneInput id="guardian-phone-edit" required label={t("phoneCol")} value={editForm.phone_numbers} onChange={(value) => setEditForm({ ...editForm, phone_numbers: value })} />
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
  const [viewMode, setViewMode] = useState<ViewMode>("cards");

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
    setDonations(await financeApi.listDonations({ donor_id: donor.id }));
  };

  const donorFields = (d: Donor): DataField[] => [
    { label: t("contactCol"), value: d.contact },
  ];

  return (
    <>
      <FilterBar
        searchValue={search}
        onSearchChange={(value) => { setSearch(value); void loadDonors(value); }}
        searchPlaceholder={t("donorSearchPlaceholder")}
      >
        <DataViewToggle viewKey="people-donators" onChange={setViewMode} />
      </FilterBar>
      {error && <Typography color="error.main">{error}</Typography>}

      {viewMode === "cards" ? (
        <CardsList>
          {isLoading && <LoadingState />}
          {!isLoading && donors.length === 0 && <Typography>{t("noDonorsYet")}</Typography>}
          {!isLoading && donors.map((d) => (
            <DataCard
              key={d.id}
              title={d.name}
              avatar={d.name.charAt(0)}
              fields={donorFields(d)}
              actions={
                <SecondaryButton onClick={() => openDonor(d)}>
                  <Eye size={14} /> {t("viewBtn")}
                </SecondaryButton>
              }
            />
          ))}
        </CardsList>
      ) : (
        <DataTable<Donor>
          columns={[
            { header: t("nameLabel"), render: (d) => d.name },
            { header: t("contactCol"), render: (d) => d.contact },
            { header: t("actionsCol"), render: (d) => (
              <SecondaryButton onClick={() => openDonor(d)}>
                <Eye size={14} /> {t("viewBtn")}
              </SecondaryButton>
            )},
          ]}
          data={donors}
          keyExtractor={(d) => d.id}
          isLoading={isLoading}
          emptyMessage={t("noDonorsYet")}
        />
      )}

      {selected && (
        <Modal 
          title={selected.name} 
          onClose={() => setSelected(null)}
          actions={
            canWrite ? (
              <SecondaryButton onClick={() => setShowEdit(true)}>
                <Pencil size={16} /> {t("edit", "Edit")}
              </SecondaryButton>
            ) : null
          }
        >
          <Box sx={{ p: 3 }}>
            <h4>{t("donationHistoryHeading")}</h4>
            <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
              {donations.length === 0 && <p>{t("noDonationsYet")}</p>}
              {donations.map((d) => (
                <Paper key={d.id} variant="outlined" sx={{ p: 1.5 }}>
                  <Box sx={{ display: "flex", justifyContent: "space-between" }}>
                    <span>{d.donation_date}</span>
                    <strong>{d.amount} {d.currency}</strong>
                  </Box>
                  <small>{categories.find((c) => c.id === d.category_id)?.name ?? "—"}</small>
                </Paper>
              ))}
            </Box>
            {canWrite && (
              <Box sx={{ mt: 2 }}>
                <PrimaryButton onClick={() => setShowDonationModal(true)}>
                  <Plus size={16} /> {t("addDonationBtn")}
                </PrimaryButton>
              </Box>
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
            {error && <Typography color="error.main">{error}</Typography>}
          </Box>
          
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
