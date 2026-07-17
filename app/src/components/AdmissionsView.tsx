import { useEffect, useState } from "react";
import { CheckCircle2, ClipboardList, Copy, Plus, Trash2, XCircle } from "lucide-react";
import { useTranslation } from "react-i18next";

import {
  academicsApi,
  operationsApi,
  type AdmissionApplication,
  type AdmissionForm,
  type ContactEnquiry,
  type Program,
} from "../lib/endpoints";
import { useAuth } from "../lib/AuthContext";
import { API_BASE } from "../lib/config";
import { Input, Select } from "./ui/Field";
import { ErrorState, LoadingState } from "./ui/AsyncState";
import { DEFAULT_PAGE_SIZE, pageParams, PaginationControls, recoverEmptyPage, type PageState } from "./ui/Pagination";
import { useSessionReadOnly } from "./SessionSwitcher";

type Tab = "registrations" | "forms" | "enquiries";

export function AdmissionsView({ section = "registrations" }: Readonly<{ section?: Tab }>) {
  const { t } = useTranslation();
  const { hasPermission } = useAuth();
  const canMutate = !useSessionReadOnly();
  const canReview = hasPermission("admissions.manage");
  const canViewEnquiries = hasPermission("contact.enquiries.view");
  const [programs, setPrograms] = useState<Program[]>([]);

  useEffect(() => {
    void academicsApi.listPrograms().then(setPrograms).catch(() => setPrograms([]));
  }, []);

  return (
    <section className="modulePanel">
      <div className="moduleHeader">
        <h2><ClipboardList size={18} /> {t("admissions")}</h2>
        <p className="notice">{t("descAdmissions")}</p>
      </div>

      {section === "registrations" && <RegistrationsTab programs={programs} canReview={canReview} canMutate={canMutate} />}
      {section === "forms" && canReview && <AdmissionFormsTab programs={programs} canMutate={canMutate} />}
      {section === "enquiries" && canViewEnquiries && <EnquiriesTab canMutate={canMutate} />}
    </section>
  );
}

// ------------------------------------------------------------- Registrations

function RegistrationsTab({ programs, canReview, canMutate }: Readonly<{ programs: Program[]; canReview: boolean; canMutate: boolean }>) {
  const { t } = useTranslation();
  const [applications, setApplications] = useState<AdmissionApplication[]>([]);
  const [form, setForm] = useState({ applicant_name: "", guardian_contact: "", program_id: "", date_of_birth: "", notes: "" });
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [pagination, setPagination] = useState<PageState>({ page: 0, pageSize: DEFAULT_PAGE_SIZE });
  const [total, setTotal] = useState(0);

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

  return (
    <>
      {canMutate && <form
        className="inlineForm"
        onSubmit={async (e) => {
          e.preventDefault();
          setError("");
          setNotice("");
          try {
            await operationsApi.createAdmission({
              applicant_name: form.applicant_name,
              guardian_contact: form.guardian_contact,
              program_id: form.program_id || undefined,
              date_of_birth: form.date_of_birth || undefined,
              notes: form.notes || undefined,
            });
            setForm({ applicant_name: "", guardian_contact: "", program_id: "", date_of_birth: "", notes: "" });
            setNotice(t("applicationSubmitted"));
            await load();
          } catch (err: any) {
            setError(err.response?.data?.detail ?? t("failedSubmitApplication"));
          }
        }}
      >
        <label>{t("applicantNameLabel")}<Input required value={form.applicant_name} onChange={(e) => setForm({ ...form, applicant_name: e.target.value })} /></label>
        <label>{t("guardianContactLabel")}<Input required value={form.guardian_contact} onChange={(e) => setForm({ ...form, guardian_contact: e.target.value })} /></label>
        <label>
          {t("programLabel")}
          <Select value={form.program_id} onChange={(e) => setForm({ ...form, program_id: e.target.value })}>
            <option value="">{t("selectEllipsis")}</option>
            {programs.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </Select>
        </label>
        <label>{t("dobLabel")}<Input type="date" value={form.date_of_birth} onChange={(e) => setForm({ ...form, date_of_birth: e.target.value })} /></label>
        <label>{t("notesLabel")}<Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></label>
        <div className="formActions"><button className="primaryAction" type="submit"><Plus size={16} /> {t("submitApplicationBtn")}</button></div>
      </form>}
      {error && <p className="notice" style={{ color: "var(--rose)" }}>{error}</p>}
      {notice && <p className="notice">{notice}</p>}

      {canReview && (
        <div className="dataTable">
          <div className="dataRow header">
            <span>{t("applicantNameLabel")}</span>
            <span>{t("guardianContactLabel")}</span>
            <span>{t("programLabel")}</span>
            <span>{t("sourceCol")}</span>
            <span>{t("statusCol")}</span>
            <span></span>
          </div>
          {isLoading && <LoadingState />}
          {!isLoading && loadError && <ErrorState message={loadError} />}
          {!isLoading && !loadError && applications.length === 0 && <p className="emptyState">{t("noApplicationsYet")}</p>}
          {!isLoading && !loadError && applications.map((a) => (
            <div className="dataRow" key={a.id}>
              <span>{a.applicant_name}</span>
              <span>{a.guardian_contact}</span>
              <span>{programs.find((p) => p.id === a.program_id)?.name ?? "—"}</span>
              <span>{a.form_id ? t("sourcePublicForm") : t("sourceWalkIn")}</span>
              <span>{a.status}</span>
              <span>
                {canMutate && a.status === "pending" && (
                  <>
                    <button className="tableAction" type="button" onClick={async () => { await operationsApi.setAdmissionStatus(a.id, "accepted"); await load(); }}>
                      <CheckCircle2 size={14} />
                    </button>
                    <button className="tableAction" type="button" onClick={async () => { await operationsApi.setAdmissionStatus(a.id, "rejected"); await load(); }}>
                      <XCircle size={14} />
                    </button>
                  </>
                )}
              </span>
            </div>
          ))}
        </div>
      )}
      {canReview && <PaginationControls state={pagination} total={total} onChange={setPagination} />}
    </>
  );
}

// ---------------------------------------------------- Public admission forms

function AdmissionFormsTab({ programs, canMutate }: Readonly<{ programs: Program[]; canMutate: boolean }>) {
  const { t } = useTranslation();
  const [forms, setForms] = useState<AdmissionForm[]>([]);
  const [form, setForm] = useState({ program_id: "", title: "", description: "" });
  const [copiedId, setCopiedId] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [pagination, setPagination] = useState<PageState>({ page: 0, pageSize: DEFAULT_PAGE_SIZE });
  const [total, setTotal] = useState(0);

  const load = async () => {
    setIsLoading(true);
    try {
      const result = await operationsApi.listAdmissionFormsPage(pageParams(pagination));
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
  }, [pagination]);

  const publicUrl = (token: string) => `${API_BASE}/api/v1/public/admission-forms/${token}`;

  const copyLink = async (adm: AdmissionForm) => {
    await navigator.clipboard.writeText(publicUrl(adm.public_token));
    setCopiedId(adm.id);
    setTimeout(() => setCopiedId(""), 2500);
  };

  return (
    <>
      <p className="notice">{t("admissionFormsHint")}</p>
      {canMutate && <form
        className="inlineForm"
        onSubmit={async (e) => {
          e.preventDefault();
          setError("");
          try {
            await operationsApi.createAdmissionForm({
              program_id: form.program_id,
              title: form.title,
              description: form.description,
            });
            setForm({ program_id: "", title: "", description: "" });
            await load();
          } catch (err: any) {
            setError(err.response?.data?.detail ?? t("failedCreateForm"));
          }
        }}
      >
        <label>
          {t("programLabel")}
          <Select required value={form.program_id} onChange={(e) => setForm({ ...form, program_id: e.target.value })}>
            <option value="">{t("selectEllipsis")}</option>
            {programs.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </Select>
        </label>
        <label>{t("titleLabel")}<Input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></label>
        <label>{t("descriptionLabel")}<Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></label>
        <div className="formActions"><button className="primaryAction" type="submit"><Plus size={16} /> {t("createAdmissionFormBtn")}</button></div>
      </form>}
      {error && <p className="notice" style={{ color: "var(--rose)" }}>{error}</p>}

      <div className="dataTable">
        <div className="dataRow header">
          <span>{t("titleCol")}</span>
          <span>{t("programLabel")}</span>
          <span>{t("statusCol")}</span>
          <span></span>
        </div>
        {isLoading && <LoadingState />}
        {!isLoading && loadError && <ErrorState message={loadError} />}
        {!isLoading && !loadError && forms.length === 0 && <p className="emptyState">{t("noAdmissionFormsYet")}</p>}
        {!isLoading && !loadError && forms.map((adm) => (
          <div className="dataRow" key={adm.id}>
            <span>{adm.title}</span>
            <span>{adm.program_name ?? "—"}</span>
            <span>{adm.is_open ? t("openLabel") : t("closedLabel")}</span>
            <span>
              <button className="tableAction" type="button" onClick={() => void copyLink(adm)}>
                <Copy size={14} /> {copiedId === adm.id ? t("linkCopied") : t("copyPublicLinkBtn")}
              </button>
              {canMutate && <button
                className="tableAction"
                type="button"
                onClick={async () => {
                  await operationsApi.updateAdmissionForm(adm.id, { is_open: !adm.is_open });
                  await load();
                }}
              >
                {adm.is_open ? t("closeFormBtn") : t("reopenFormBtn")}
              </button>}
              {canMutate && <button
                className="tableAction danger"
                type="button"
                aria-label={t("deleteAdmissionFormBtn")}
                onClick={async () => {
                  if (!window.confirm(t("deleteAdmissionFormConfirm"))) return;
                  try {
                    await operationsApi.deleteAdmissionForm(adm.id);
                    await load();
                  } catch (err: any) {
                    setError(err.response?.data?.detail ?? t("failedDeleteAdmissionForm"));
                  }
                }}
              >
                <Trash2 size={14} /> {t("deleteBtn")}
              </button>}
            </span>
          </div>
        ))}
      </div>
      <PaginationControls state={pagination} total={total} onChange={setPagination} />
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
    <div className="dataTable">
      <div className="dataRow header">
        <span>{t("nameLabel")}</span>
        <span>{t("contactCol")}</span>
        <span>{t("messageCol")}</span>
        <span>{t("statusCol")}</span>
        <span></span>
      </div>
      {isLoading && <LoadingState />}
      {!isLoading && loadError && <ErrorState message={loadError} />}
      {!isLoading && !loadError && enquiries.length === 0 && <p className="emptyState">{t("noEnquiriesYet")}</p>}
      {!isLoading && !loadError && enquiries.map((e) => (
        <div className="dataRow" key={e.id}>
          <span>{e.name}</span>
          <span>{e.contact}</span>
          <span>{e.message}</span>
          <span>{e.status}</span>
          <span>
            {canMutate && e.status === "new" && (
              <button className="tableAction" type="button" onClick={async () => { await operationsApi.setEnquiryStatus(e.id, "reviewed"); await load(); }}>
                <CheckCircle2 size={14} />
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
