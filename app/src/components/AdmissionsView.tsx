import { Button } from "./ui/Button";
import { useEffect, useState } from "react";
import { Bell, CheckCircle2, ClipboardList, Copy, Edit2, Eye, Plus, RotateCcw, Trash2, XCircle } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useDialog } from "../lib/DialogContext";

import {
  academicsApi,
  messagingApi,
  operationsApi,
  type AdmissionApplication,
  type AdmissionForm,
  type ContactEnquiry,
  type FormFieldDefinition,
  type Program,
  type AcademicClass,
  type AcademicSession,
  type Section,
  type AdminNotification,
  type AdmissionConversion,
} from "../lib/endpoints";
import { AdmissionAnswersFields } from "./AdmissionAnswersFields";
import { useAuth } from "../lib/AuthContext";
import { Input, Select } from "./ui/Field";
import { PhoneInput } from "./ui/PhoneInput";
import { ErrorState, LoadingState } from "./ui/AsyncState";
import { DataTable } from "./ui/DataTable";
import { DEFAULT_PAGE_SIZE, pageParams, PaginationControls, recoverEmptyPage, type PageState } from "./ui/Pagination";
import { useSessionReadOnly } from "./SessionSwitcher";
import { Modal, FormModal } from "./ui/Modal";
import { PageSection, PageHeader } from "./ui/Layout";
import { cleanFormFields, FormFieldsEditor, validateFormFields } from "./FormFieldsEditor";
import { InlineFilter } from "./ui/InlineFilter";
import { ActionMenu } from "./ui/ActionMenu";
import { answerString, BUILT_IN_ADMISSION_KEYS, enabledAdmissionFields, mergeAdmissionBuiltIns } from "../lib/admissionBuiltIns";

type Tab = "registrations" | "forms" | "enquiries";

export function AdmissionsView({ section = "registrations" }: Readonly<{ section?: Tab }>) {
  const { t } = useTranslation();
  const { alert, confirm } = useDialog();
  const { hasPermission } = useAuth();
  const canMutate = !useSessionReadOnly();
  const canReview = hasPermission("admissions.manage");
  const canViewEnquiries = hasPermission("contact.enquiries.view");
  const [programs, setPrograms] = useState<Program[]>([]);

  useEffect(() => {
    void academicsApi.listPrograms().then(setPrograms).catch(() => setPrograms([]));
  }, []);

  return (
    <PageSection>
      <PageHeader
        title={t("admissions")}
        icon={<ClipboardList size={18} />}
        notice={t("descAdmissions")}
      />

      {section === "registrations" && <RegistrationsTab programs={programs} canReview={canReview} canMutate={canMutate} />}
      {section === "forms" && canReview && <AdmissionFormsTab programs={programs} canMutate={canMutate} />}
      {section === "enquiries" && canViewEnquiries && <EnquiriesTab canMutate={canMutate} />}
    </PageSection>
  );
}

// ------------------------------------------------------------- Registrations

function RegistrationsTab({ programs, canReview, canMutate }: Readonly<{ programs: Program[]; canReview: boolean; canMutate: boolean }>) {
  const { t } = useTranslation();
  const { confirm } = useDialog();
  const [applications, setApplications] = useState<AdmissionApplication[]>([]);
  const emptyForm = {
    form_id: "", program_id: "", notes: "",
  };
  const [form, setForm] = useState(emptyForm);
  const [formAnswers, setFormAnswers] = useState<Record<string, unknown>>({});
  const [admissionForms, setAdmissionForms] = useState<AdmissionForm[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [detail, setDetail] = useState<AdmissionApplication | null>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [pagination, setPagination] = useState<PageState>({ page: 0, pageSize: DEFAULT_PAGE_SIZE });
  const [total, setTotal] = useState(0);
  const [editing, setEditing] = useState<AdmissionApplication | null>(null);
  const [converting, setConverting] = useState<AdmissionApplication | null>(null);
  const [notifications, setNotifications] = useState<AdminNotification[]>([]);

  const load = async () => {
    if (!canReview) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    try {
      const result = await operationsApi.listAdmissionsPage(pageParams(pagination));
      if (recoverEmptyPage(result, pagination, setPagination)) return;
      setApplications(result.items);
      setTotal(result.total);
      setLoadError("");
      const [notificationRows, formRows] = await Promise.all([
        operationsApi.listAdminNotifications(),
        canMutate ? operationsApi.listAdmissionForms() : Promise.resolve([]),
      ]);
      setNotifications(notificationRows);
      setAdmissionForms(formRows.filter((item) => item.category === "General" && item.is_open));
    } catch (err: any) {
      setLoadError(err.response?.data?.detail ?? t("failedLoadApplications"));
    } finally {
      setIsLoading(false);
    }
  };
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pagination]);

  const changeStatus = async (application: AdmissionApplication, status: "pending" | "rejected" | "accepted") => {
    if (application.converted_student_id && status !== "accepted") {
      const approved = await confirm(t("reverseAcceptedApplicationWarning"), {
        title: t("reverseAcceptedApplicationTitle"),
        confirmLabel: t("continueBtn"),
      });
      if (!approved) return;
    }
    await operationsApi.setAdmissionStatus(application.id, status);
    await load();
  };
  const selectedCreateAdmissionForm = admissionForms.find((item) => item.id === form.form_id);

  return (
    <>
      {notifications.some((item) => !item.is_read) && <section className="adminNotifications" aria-label={t("adminNotificationsHeading")}>
        <h3><Bell size={16} /> {t("adminNotificationsHeading")}</h3>
        {notifications.filter((item) => !item.is_read).map((item) => <Button type="button" key={item.id} onClick={async () => { await operationsApi.markAdminNotificationRead(item.id); await load(); }}><strong>{item.title === "notificationAdmissionConvertedTitle" ? t("notificationAdmissionConvertedTitle", { name: item.message }) : item.title}</strong>{item.title !== "notificationAdmissionConvertedTitle" && <span>{item.message}</span>}</Button>)}
      </section>}
      {canMutate && <div className="formActions" style={{ marginBottom: 12 }}>
        <Button className="primaryAction" type="button" onClick={() => setShowCreate(true)}><Plus size={16} /> {t("submitApplicationBtn")}</Button>
      </div>}
      {canMutate && showCreate && <FormModal
            title={t("submitApplicationBtn")} onClose={() => setShowCreate(false)}
            onSubmit={async (e) => {
                    e.preventDefault();
                    setError("");
                    setNotice("");
                    try {
                      await operationsApi.createAdmission({
                        applicant_name: answerString(formAnswers, BUILT_IN_ADMISSION_KEYS.studentName),
                        guardian_contact: answerString(formAnswers, BUILT_IN_ADMISSION_KEYS.guardianPhoneNumbers),
                        form_id: form.form_id,
                        date_of_birth: answerString(formAnswers, BUILT_IN_ADMISSION_KEYS.studentDateOfBirth) || undefined,
                        notes: form.notes || undefined,
                        extra_data: formAnswers,
                      });
                      setForm(emptyForm);
                      setFormAnswers({});
                      setShowCreate(false);
                      setNotice(t("applicationSubmitted"));
                      await load();
                    } catch (err: any) {
                      setError(err.response?.data?.detail ?? t("failedSubmitApplication"));
                    }
                  }}
            submitLabel={t("submitApplicationBtn")}
            submitIcon={<Plus size={16} />}
          >
            <label>
              {t("admissionFormLabel")}
              <Select required value={form.form_id} onChange={(e) => {
                const selected = admissionForms.find((item) => item.id === e.target.value);
                setForm({ ...form, form_id: e.target.value, program_id: selected?.program_id ?? "" });
                setFormAnswers({});
              }}>
                <option value="">{t("selectEllipsis")}</option>
                {admissionForms.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
              </Select>
            </label>
            {admissionForms.length === 0 && <p className="notice notice-warning">{t("noOpenAdmissionForms")}</p>}

          <label>
                    {t("programLabel")}
                    <Select disabled value={form.program_id} onChange={(e) => setForm({ ...form, program_id: e.target.value })}>
                      <option value="">{t("selectEllipsis")}</option>
                      {programs.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </Select>
                  </label>

          <AdmissionAnswersFields fields={selectedCreateAdmissionForm?.fields_definition ?? []} answers={formAnswers} onChange={setFormAnswers} idPrefix="walk-in-admission" />

          <label>{t("notesLabel")}<Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></label>
          </FormModal>}
      {error && <p className="notice" style={{ color: "var(--rose)" }}>{error}</p>}
      {notice && <p className="notice">{notice}</p>}

      {canReview && (
        <DataTable<AdmissionApplication>
          columns={[
            { header: t("applicantNameLabel"), render: (a) => a.applicant_name },
            { header: t("guardianContactLabel"), render: (a) => a.guardian_contact },
            { header: t("programLabel"), render: (a) => programs.find((p) => p.id === a.program_id)?.name ?? "—" },
            { header: t("sourceCol"), render: (a) => a.form_id ? t("sourcePublicForm") : t("sourceWalkIn") },
            { header: t("statusCol"), render: (a) => a.status },
            { header: t("actionsCol"), render: (a) => (
              <ActionMenu items={[
                { label: t("viewBtn"), icon: <Eye size={14} />, onClick: () => setDetail(a) },
                ...(canMutate ? [{ label: t("editBtn"), icon: <Edit2 size={14} />, onClick: () => setEditing(a) }] : []),
                ...(canMutate && !a.converted_student_id ? [{ label: t("acceptAndCreatePeopleBtn"), icon: <CheckCircle2 size={14} />, onClick: () => setConverting(a) }] : []),
                ...(canMutate && a.status !== "rejected" ? [{ label: t("rejectApplicationBtn"), icon: <XCircle size={14} />, destructive: true, onClick: () => changeStatus(a, "rejected") }] : []),
                ...(canMutate && a.status !== "pending" ? [{ label: t("returnToPendingBtn"), icon: <RotateCcw size={14} />, onClick: () => changeStatus(a, "pending") }] : []),
                ...(canMutate && a.converted_student_id && a.status !== "accepted" ? [{ label: t("restoreAcceptedBtn"), icon: <CheckCircle2 size={14} />, onClick: () => changeStatus(a, "accepted") }] : []),
              ]} ariaLabel={`${t("actionsCol")}: ${a.applicant_name}`} />
            )},
          ]}
          data={applications}
          keyExtractor={(a) => a.id}
          isLoading={isLoading}
          error={loadError}
          emptyMessage={t("noApplicationsYet")}
        />
      )}
      {canReview && <PaginationControls state={pagination} total={total} onChange={setPagination} />}
      {detail && <Modal title={detail.applicant_name} onClose={() => setDetail(null)}>
        <dl className="detailGrid">
          <dt>{t("guardianContactLabel")}</dt><dd>{detail.guardian_contact}</dd>
          <dt>{t("dobLabel")}</dt><dd>{detail.date_of_birth ?? "—"}</dd>
          <dt>{t("notesLabel")}</dt><dd>{detail.notes ?? "—"}</dd>
          {Object.entries(detail.extra_data ?? {}).map(([key, value]) => <div key={key} style={{ display: "contents" }}><dt>{key.replaceAll("_", " ")}</dt><dd>{String(value || "—")}</dd></div>)}
        </dl>
        <section className="detailSection">
          <h4>{t("statusHistoryHeading")}</h4>
          <ol className="statusHistoryList">
            {(detail.status_history ?? []).map((event, index) => <li key={`${event.changed_at}-${index}`}><strong>{t(event.status)}</strong><span>{new Date(event.changed_at).toLocaleString()}</span></li>)}
          </ol>
        </section>
      </Modal>}
      {editing && <FormModal title={t("editApplicationHeading")} onClose={() => setEditing(null)} submitLabel={t("saveBtn")} submitIcon={<Edit2 size={16} />} error={error} onSubmit={async () => {
        try { await operationsApi.updateAdmission(editing.id, {
          applicant_name: editing.applicant_name, guardian_contact: editing.guardian_contact,
          program_id: editing.program_id, date_of_birth: editing.date_of_birth, notes: editing.notes,
          extra_data: editing.extra_data,
        }); setEditing(null); await load(); }
        catch (err: any) { setError(err.response?.data?.detail ?? t("failedUpdateApplication")); }
      }}>
        <label>{t("applicantNameLabel")}<Input required value={editing.applicant_name} onChange={(e) => setEditing({ ...editing, applicant_name: e.target.value })} /></label>
        <PhoneInput id="admission-edit-guardian-contact" required label={t("guardianContactLabel")} value={editing.guardian_contact} onChange={(value) => setEditing({ ...editing, guardian_contact: value })} />
        <label>{t("programLabel")}<Select value={editing.program_id ?? ""} onChange={(e) => setEditing({ ...editing, program_id: e.target.value || null })}><option value="">{t("selectEllipsis")}</option>{programs.map((program) => <option value={program.id} key={program.id}>{program.name}</option>)}</Select></label>
        <label>{t("dobLabel")}<Input type="date" value={editing.date_of_birth ?? ""} onChange={(e) => setEditing({ ...editing, date_of_birth: e.target.value || null })} /></label>
        {Object.entries(editing.extra_data ?? {}).map(([key, value]) => <label key={key}>{key.replaceAll("_", " ")}<Input value={String(value ?? "")} onChange={(e) => setEditing({ ...editing, extra_data: { ...(editing.extra_data ?? {}), [key]: e.target.value } })} /></label>)}
        <label>{t("notesLabel")}<Input value={editing.notes ?? ""} onChange={(e) => setEditing({ ...editing, notes: e.target.value || null })} /></label>
      </FormModal>}
      {converting && <AdmissionConversionModal application={converting} programs={programs} onClose={() => setConverting(null)} onSuccess={async () => { setConverting(null); setNotice(t("applicationConvertedNotice")); await load(); }} />}
    </>
  );
}

function AdmissionConversionModal({ application, programs, onClose, onSuccess }: Readonly<{ application: AdmissionApplication; programs: Program[]; onClose: () => void; onSuccess: () => Promise<void> }>) {
  const { t } = useTranslation();
  const [sessions, setSessions] = useState<AcademicSession[]>([]);
  const [classes, setClasses] = useState<AcademicClass[]>([]);
  const [sections, setSections] = useState<Section[]>([]);
  const [converted, setConverted] = useState<AdmissionConversion | null>(null);
  const [deliveryResults, setDeliveryResults] = useState<{ subject: string; status: "sent" | "copied" | "skipped"; message: string }[]>([]);
  const [form, setForm] = useState({
    student_username: "", guardian_username: "", student_portal_enabled: "enabled", guardian_portal_enabled: "enabled",
    student_delivery_phone: answerString(application.extra_data ?? {}, BUILT_IN_ADMISSION_KEYS.studentPhone),
    guardian_delivery_phone: answerString(application.extra_data ?? {}, BUILT_IN_ADMISSION_KEYS.guardianPhoneNumbers) || application.guardian_contact,
    session_id: "", class_id: "", section_id: "",
  });
  const [error, setError] = useState("");
  useEffect(() => { void Promise.all([academicsApi.listSessions(), academicsApi.listClasses()]).then(([sessionRows, classRows]) => { setSessions(sessionRows); setClasses(classRows); }); }, []);
  useEffect(() => { if (!form.class_id) setSections([]); else void academicsApi.listSections(form.class_id).then(setSections); }, [form.class_id]);
  const phoneOptions = (value: string) => Array.from(new Set(value.split(/[;,]/).map((part) => part.trim()).filter(Boolean)));
  const studentPhoneOptions = phoneOptions(answerString(application.extra_data ?? {}, BUILT_IN_ADMISSION_KEYS.studentPhone));
  const guardianPhoneOptions = phoneOptions(`${answerString(application.extra_data ?? {}, BUILT_IN_ADMISSION_KEYS.guardianPhoneNumbers)};${application.guardian_contact}`);
  const credentialUrl = (path: string) => path.startsWith("http") ? path : `${window.location.origin}${path}`;

  const sendConvertedCredentials = async (result: AdmissionConversion) => {
    const nextResults: { subject: string; status: "sent" | "copied" | "skipped"; message: string }[] = [];
    const tasks = [
      {
        enabled: Boolean(result.student_set_password_url),
        subject: t("studentLabel", "Student"),
        subjectType: "student" as const,
        subjectId: result.student.id,
        url: result.student_set_password_url,
        phone: form.student_delivery_phone || undefined,
      },
      {
        enabled: Boolean(result.guardian_set_password_url),
        subject: t("guardianLabel", "Guardian"),
        subjectType: "guardian" as const,
        subjectId: result.guardian.id,
        url: result.guardian_set_password_url,
        phone: form.guardian_delivery_phone || undefined,
      },
    ];
    for (const task of tasks) {
      if (!task.enabled || !task.url) {
        nextResults.push({ subject: task.subject, status: "skipped", message: t("credentialDeliverySkipped", "Portal disabled; no login link created.") });
        continue;
      }
      const fullUrl = credentialUrl(task.url);
      try {
        const link = await messagingApi.sendCredentials({
          subject_type: task.subjectType,
          subject_id: task.subjectId,
          set_password_url: fullUrl,
          phone_number: task.phone,
        });
        if (link.url) window.open(link.url, "_blank", "noopener,noreferrer");
        nextResults.push({ subject: task.subject, status: "sent", message: t("credentialsSentLabel") });
      } catch {
        await navigator.clipboard.writeText(fullUrl);
        nextResults.push({ subject: task.subject, status: "copied", message: t("credentialDeliveryCopiedFallback", "Delivery failed; login link copied to clipboard.") });
      }
      setDeliveryResults([...nextResults]);
    }
  };

  return <FormModal title={t("acceptApplicationHeading")} maxWidth={800} onClose={onClose} submitLabel={converted ? t("doneBtn", "Done") : t("acceptAndCreatePeopleBtn")} submitIcon={<CheckCircle2 size={16} />} error={error} onSubmit={async () => {
    if (converted) {
      await onSuccess();
      return;
    }
    setError("");
    setDeliveryResults([
      { subject: t("studentLabel", "Student"), status: "skipped", message: t("credentialDeliveryPending", "Waiting for acceptance...") },
      { subject: t("guardianLabel", "Guardian"), status: "skipped", message: t("credentialDeliveryPending", "Waiting for acceptance...") },
    ]);
    try {
      const result = await operationsApi.convertAdmission(application.id, {
        student_username: form.student_username,
        guardian_username: form.guardian_portal_enabled === "enabled" ? form.guardian_username : undefined,
        student_portal_enabled: form.student_portal_enabled === "enabled",
        guardian_portal_enabled: form.guardian_portal_enabled === "enabled",
        session_id: form.session_id,
        class_id: form.class_id,
        section_id: form.section_id,
      });
      setConverted(result);
      await sendConvertedCredentials(result);
    }
    catch (err: any) { setError(err.response?.data?.detail ?? t("failedConvertApplication")); }
  }}>
    <p className="notice">{t("acceptApplicationHint", { name: application.applicant_name })}</p>
    {!converted && <div className="formGridTwo">
      <label>{t("studentUsernameLabel")}<Input required value={form.student_username} onChange={(e) => setForm({ ...form, student_username: e.target.value })} /></label>
      <label>{t("studentPortalDecisionLabel", "Student portal")}<Select required value={form.student_portal_enabled} onChange={(e) => setForm({ ...form, student_portal_enabled: e.target.value })}><option value="enabled">{t("enabledLabel")}</option><option value="disabled">{t("disabledLabel")}</option></Select></label>
      {form.student_portal_enabled === "enabled" && <label>{t("studentDeliveryTargetLabel", "Student delivery target")}<Select value={form.student_delivery_phone} onChange={(e) => setForm({ ...form, student_delivery_phone: e.target.value })}><option value="">{t("copyFallbackOnlyLabel", "Copy fallback only")}</option>{studentPhoneOptions.map((phone) => <option key={phone} value={phone}>{phone}</option>)}</Select></label>}
      <label>{t("guardianPortalDecisionLabel", "Guardian portal")}<Select required value={form.guardian_portal_enabled} onChange={(e) => setForm({ ...form, guardian_portal_enabled: e.target.value, guardian_username: e.target.value === "disabled" ? "" : form.guardian_username })}><option value="enabled">{t("enabledLabel")}</option><option value="disabled">{t("disabledLabel")}</option></Select></label>
      {form.guardian_portal_enabled === "enabled" && <label>{t("guardianUsernameLabel")}<Input required value={form.guardian_username} onChange={(e) => setForm({ ...form, guardian_username: e.target.value })} /></label>}
      {form.guardian_portal_enabled === "enabled" && <label>{t("guardianDeliveryTargetLabel", "Guardian delivery target")}<Select value={form.guardian_delivery_phone} onChange={(e) => setForm({ ...form, guardian_delivery_phone: e.target.value })}><option value="">{t("copyFallbackOnlyLabel", "Copy fallback only")}</option>{guardianPhoneOptions.map((phone) => <option key={phone} value={phone}>{phone}</option>)}</Select></label>}
      <label>{t("sessionLabel")}<Select required value={form.session_id} onChange={(e) => setForm({ ...form, session_id: e.target.value })}><option value="">{t("selectEllipsis")}</option>{sessions.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</Select></label>
      <label>{t("classLabel")}<Select required value={form.class_id} onChange={(e) => setForm({ ...form, class_id: e.target.value, section_id: "" })}><option value="">{t("selectEllipsis")}</option>{classes.filter((item) => !application.program_id || item.program_id === application.program_id).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</Select></label>
      <label>{t("sectionLabel")}<Select required value={form.section_id} onChange={(e) => setForm({ ...form, section_id: e.target.value })}><option value="">{t("selectEllipsis")}</option>{sections.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</Select></label>
    </div>}
    {deliveryResults.length > 0 && (
      <div className="credentialDeliverySummary" role="status" aria-live="polite">
        <h4>{t("credentialDeliveryResultsHeading", "Credential delivery")}</h4>
        {deliveryResults.map((item) => (
          <p key={`${item.subject}-${item.status}`}>
            <strong>{item.subject}</strong>
            <span>{item.message}</span>
          </p>
        ))}
      </div>
    )}
  </FormModal>;
}

// ---------------------------------------------------- Public admission forms

function AdmissionFormsTab({ programs, canMutate }: Readonly<{ programs: Program[]; canMutate: boolean }>) {
  const { t } = useTranslation();
  const { confirm } = useDialog();
  const [forms, setForms] = useState<AdmissionForm[]>([]);
  const [form, setForm] = useState({ program_id: "", title: "", description: "", category: "General" });
  const [fields, setFields] = useState<FormFieldDefinition[]>(mergeAdmissionBuiltIns([]));
  const [editing, setEditing] = useState<AdmissionForm | null>(null);
  const [editFields, setEditFields] = useState<FormFieldDefinition[]>([]);
  const [copiedId, setCopiedId] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [pagination, setPagination] = useState<PageState>({ page: 0, pageSize: DEFAULT_PAGE_SIZE });
  const [categoryFilter, setCategoryFilter] = useState("");
  const [programFilter, setProgramFilter] = useState("");
  const [total, setTotal] = useState(0);
  const [showTypeSelection, setShowTypeSelection] = useState(false);
  const [showCreate, setShowCreate] = useState(false);

  const load = async () => {
    setIsLoading(true);
    try {
      const result = await operationsApi.listAdmissionFormsPage({ 
        ...pageParams(pagination),
        category: categoryFilter || undefined,
        program_id: programFilter || undefined,
      });
      if (recoverEmptyPage(result, pagination, setPagination)) return;
      setForms(result.items);
      setTotal(result.total);
      setLoadError("");
    } catch (err: any) {
      setLoadError(err.response?.data?.detail ?? t("failedLoadAdmissionForms"));
    } finally {
      setIsLoading(false);
    }
  };
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pagination, categoryFilter, programFilter]);

  const publicUrl = (token: string) => `${window.location.origin}/admission/${token}`;

  const copyLink = async (adm: AdmissionForm) => {
    await navigator.clipboard.writeText(publicUrl(adm.public_token));
    setCopiedId(adm.id);
    setTimeout(() => setCopiedId(""), 2500);
  };

  return (
    <>
      <p className="notice">{t("admissionFormsHint")}</p>
      
      <InlineFilter className="pwaFilterStack" filters={[
        {
          key: "category",
          type: "select",
          value: categoryFilter,
          placeholder: t("allCategories"),
          options: [
            { value: "General", label: t("generalFormLabel") },
            { value: "Inquiry", label: t("inquiryFormLabel") },
          ],
          onChange: (value) => { setCategoryFilter(value); setPagination({ ...pagination, page: 0 }); },
        },
        {
          key: "program",
          type: "select",
          value: programFilter,
          placeholder: t("allPrograms"),
          options: programs.map((program) => ({ value: program.id, label: program.name })),
          onChange: (value) => { setProgramFilter(value); setPagination({ ...pagination, page: 0 }); },
        },
      ]} />

      {canMutate && <div className="formActions" style={{ marginBottom: 12 }}>
        <Button className="primaryAction" type="button" onClick={() => setShowTypeSelection(true)}><Plus size={16} /> {t("createAdmissionFormBtn")}</Button>
      </div>}
      
      {showTypeSelection && (
        <Modal title={t("chooseAdmissionFormType")} onClose={() => setShowTypeSelection(false)}>
          <div className="modalChoiceGrid">
            <Button className="primaryAction" onClick={() => { setForm({ ...form, category: "General" }); setShowTypeSelection(false); setShowCreate(true); }}>
              {t("generalFormLabel")}
            </Button>
            <Button className="primaryAction" onClick={() => { setForm({ ...form, category: "Inquiry" }); setShowTypeSelection(false); setShowCreate(true); }}>
              {t("inquiryFormLabel")}
            </Button>
          </div>
        </Modal>
      )}

      {canMutate && showCreate && <FormModal
            title={t("createAdmissionFormBtn")} onClose={() => setShowCreate(false)} maxWidth={800}
            onSubmit={async (e) => {
                    e.preventDefault();
                    setError("");
                    const fieldError = validateFormFields(fields);
                    if (fieldError) {
                      setError(t(fieldError));
                      return;
                    }
                    try {
                      await operationsApi.createAdmissionForm({
                        program_id: form.program_id || undefined,
                        title: form.title,
                        category: form.category,
                        description: form.description,
                        fields: cleanFormFields(fields),
                      });
                      setForm({ program_id: "", title: "", description: "", category: "General" });
                      setFields(mergeAdmissionBuiltIns([]));
                      setShowCreate(false);
                      await load();
                    } catch (err: any) {
                      setError(err.response?.data?.detail ?? t("failedCreateForm"));
                    }
                  }}
            submitLabel={t("createAdmissionFormBtn")}
            submitIcon={<Plus size={16} />}
          >
            {form.category === "General" && (
              <label>
                {t("programLabel")}
                <Select required value={form.program_id} onChange={(e) => setForm({ ...form, program_id: e.target.value })}>
                  <option value="">{t("selectEllipsis")}</option>
                  {programs.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </Select>
              </label>
            )}

          <label>{t("titleLabel")}<Input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></label>

          <label>{t("descriptionLabel")}<Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></label>

          <FormFieldsEditor fields={fields} onChange={setFields} />
          </FormModal>}
      {error && <p className="notice" style={{ color: "var(--rose)" }}>{error}</p>}

      <DataTable<AdmissionForm>
        columns={[
          { header: t("titleCol"), render: (adm) => adm.title },
          { header: t("categoryFilterLabel"), render: (adm) => adm.category ?? "General" },
          { header: t("programLabel"), render: (adm) => adm.program_name ?? "—" },
          { header: t("fieldsCol"), render: (adm) => enabledAdmissionFields(adm.fields_definition).length },
          { header: t("statusCol"), render: (adm) => adm.is_open ? t("openLabel") : t("closedLabel") },
          { header: t("actionsCol"), render: (adm) => (
            <ActionMenu items={[
              { label: copiedId === adm.id ? t("linkCopied") : t("copyPublicLinkBtn"), icon: <Copy size={14} />, onClick: () => copyLink(adm) },
              ...(canMutate ? [{
                label: t("editBtn"),
                icon: <Edit2 size={14} />,
                onClick: () => {
                  setEditing({ ...adm });
                  setEditFields(mergeAdmissionBuiltIns(adm.fields_definition.map((field) => ({ ...field, options: [...field.options] }))));
                  setError("");
                },
              }, {
                label: adm.is_open ? t("closeFormBtn") : t("reopenFormBtn"),
                onClick: async () => {
                  await operationsApi.updateAdmissionForm(adm.id, { is_open: !adm.is_open });
                  await load();
                },
              }, {
                label: t("deleteBtn"),
                icon: <Trash2 size={14} />,
                destructive: true,
                onClick: async () => {
                  if (!(await confirm(t("deleteAdmissionFormConfirm")))) return;
                  try {
                    await operationsApi.deleteAdmissionForm(adm.id);
                    await load();
                  } catch (err: any) {
                    setError(err.response?.data?.detail ?? t("failedDeleteAdmissionForm"));
                  }
                },
              }] : []),
            ]} ariaLabel={`${t("actionsCol")}: ${adm.title}`} />
          )},
        ]}
        data={forms}
        keyExtractor={(adm) => adm.id}
        isLoading={isLoading}
        error={loadError}
        emptyMessage={t("noAdmissionFormsYet")}
      />
      <PaginationControls state={pagination} total={total} onChange={setPagination} />

      {editing && <FormModal
            title={t("editAdmissionFormHeading")} onClose={() => setEditing(null)} maxWidth={800}
            onSubmit={async (event) => {
                      event.preventDefault();
                      setError("");
                      const fieldError = validateFormFields(editFields);
                      if (fieldError) {
                        setError(t(fieldError));
                        return;
                      }
                      try {
                        await operationsApi.updateAdmissionForm(editing.id, {
                          title: editing.title,
                          description: editing.description,
                          fields: cleanFormFields(editFields),
                        });
                        setEditing(null);
                        await load();
                      } catch (err: any) {
                        setError(err.response?.data?.detail ?? t("failedUpdateForm"));
                      }
                    }}
            submitLabel={t("saveBtn")}
          >
            {editing.category === "General" && (
              <label>{t("programLabel")}<Input disabled value={editing.program_name ?? ""} /></label>
            )}

          <label>{t("titleLabel")}<Input required value={editing.title} onChange={(event) => setEditing({ ...editing, title: event.target.value })} /></label>

          <label>{t("descriptionLabel")}<Input value={editing.description} onChange={(event) => setEditing({ ...editing, description: event.target.value })} /></label>

          <FormFieldsEditor fields={editFields} onChange={setEditFields} />

          {error && <p className="notice notice-warning">{error}</p>}
          </FormModal>}
    </>
  );
}

// ------------------------------------------------------------------ Enquiries

function EnquiriesTab({ canMutate }: Readonly<{ canMutate: boolean }>) {
  const { t } = useTranslation();
  const [enquiries, setEnquiries] = useState<ContactEnquiry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [pagination, setPagination] = useState<PageState>({ page: 0, pageSize: DEFAULT_PAGE_SIZE });
  const [total, setTotal] = useState(0);

  const load = async () => {
    setIsLoading(true);
    try {
      const result = await operationsApi.listEnquiriesPage(pageParams(pagination));
      if (recoverEmptyPage(result, pagination, setPagination)) return;
      setEnquiries(result.items);
      setTotal(result.total);
      setLoadError("");
    } catch (err: any) {
      setLoadError(err.response?.data?.detail ?? t("failedLoadEnquiries"));
    } finally {
      setIsLoading(false);
    }
  };
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pagination]);

  return (
    <>
    <DataTable<ContactEnquiry>
      columns={[
        { header: t("nameLabel"), render: (e) => e.name },
        { header: t("contactCol"), render: (e) => e.contact },
        { header: t("messageCol"), render: (e) => e.message },
        { header: t("statusCol"), render: (e) => e.status },
        { header: t("actionsCol"), render: (e) => (
          canMutate && e.status === "new" ? (
            <Button className="tableAction" type="button" aria-label={t("markReviewedBtn", "Mark reviewed")} title={t("markReviewedBtn", "Mark reviewed")} onClick={async () => { await operationsApi.setEnquiryStatus(e.id, "reviewed"); await load(); }}>
              <CheckCircle2 size={14} />
            </Button>
          ) : null
        )},
      ]}
      data={enquiries}
      keyExtractor={(e) => e.id}
      isLoading={isLoading}
      error={loadError}
      emptyMessage={t("noEnquiriesYet")}
    />
    <PaginationControls state={pagination} total={total} onChange={setPagination} />
    </>
  );
}
