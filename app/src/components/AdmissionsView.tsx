import { useEffect, useState } from "react";
import { CheckCircle2, ClipboardList, Copy, FileText, MessageCircle, Plus, XCircle } from "lucide-react";
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

type Tab = "registrations" | "forms" | "enquiries";

export function AdmissionsView() {
  const { t } = useTranslation();
  const { hasPermission } = useAuth();
  const canReview = hasPermission("admissions.manage");
  const canViewEnquiries = hasPermission("contact.enquiries.view");
  const [tab, setTab] = useState<Tab>("registrations");
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

      <div className="formActions" style={{ marginBottom: 16 }}>
        <button className={tab === "registrations" ? "primaryAction" : "secondaryAction"} type="button" onClick={() => setTab("registrations")}>
          <ClipboardList size={16} /> {t("registrationsTab")}
        </button>
        {canReview && (
          <button className={tab === "forms" ? "primaryAction" : "secondaryAction"} type="button" onClick={() => setTab("forms")}>
            <FileText size={16} /> {t("admissionFormsTab")}
          </button>
        )}
        {canViewEnquiries && (
          <button className={tab === "enquiries" ? "primaryAction" : "secondaryAction"} type="button" onClick={() => setTab("enquiries")}>
            <MessageCircle size={16} /> {t("enquiriesTab")}
          </button>
        )}
      </div>

      {tab === "registrations" && <RegistrationsTab programs={programs} canReview={canReview} />}
      {tab === "forms" && canReview && <AdmissionFormsTab programs={programs} />}
      {tab === "enquiries" && canViewEnquiries && <EnquiriesTab />}
    </section>
  );
}

// ------------------------------------------------------------- Registrations

function RegistrationsTab({ programs, canReview }: Readonly<{ programs: Program[]; canReview: boolean }>) {
  const { t } = useTranslation();
  const [applications, setApplications] = useState<AdmissionApplication[]>([]);
  const [form, setForm] = useState({ applicant_name: "", guardian_contact: "", program_id: "", date_of_birth: "", notes: "" });
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const load = async () => {
    if (!canReview) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    try {
      setApplications(await operationsApi.listAdmissions());
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
  }, []);

  return (
    <>
      <form
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
      </form>
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
                {a.status === "pending" && (
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
    </>
  );
}

// ---------------------------------------------------- Public admission forms

function AdmissionFormsTab({ programs }: Readonly<{ programs: Program[] }>) {
  const { t } = useTranslation();
  const [forms, setForms] = useState<AdmissionForm[]>([]);
  const [form, setForm] = useState({ program_id: "", title: "", description: "" });
  const [copiedId, setCopiedId] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const load = async () => {
    setIsLoading(true);
    try {
      setForms(await operationsApi.listAdmissionForms());
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
  }, []);

  const publicUrl = (token: string) => `${API_BASE}/api/v1/public/admission-forms/${token}`;

  const copyLink = async (adm: AdmissionForm) => {
    await navigator.clipboard.writeText(publicUrl(adm.public_token));
    setCopiedId(adm.id);
    setTimeout(() => setCopiedId(""), 2500);
  };

  return (
    <>
      <p className="notice">{t("admissionFormsHint")}</p>
      <form
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
      </form>
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
              <button
                className="tableAction"
                type="button"
                onClick={async () => {
                  await operationsApi.updateAdmissionForm(adm.id, { is_open: !adm.is_open });
                  await load();
                }}
              >
                {adm.is_open ? t("closeFormBtn") : t("reopenFormBtn")}
              </button>
            </span>
          </div>
        ))}
      </div>
    </>
  );
}

// ------------------------------------------------------------------ Enquiries

function EnquiriesTab() {
  const { t } = useTranslation();
  const [enquiries, setEnquiries] = useState<ContactEnquiry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const load = async () => {
    setIsLoading(true);
    try {
      setEnquiries(await operationsApi.listEnquiries());
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
  }, []);

  return (
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
            {e.status === "new" && (
              <button className="tableAction" type="button" onClick={async () => { await operationsApi.setEnquiryStatus(e.id, "reviewed"); await load(); }}>
                <CheckCircle2 size={14} />
              </button>
            )}
          </span>
        </div>
      ))}
    </div>
  );
}
