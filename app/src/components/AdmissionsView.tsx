import { Button } from "./ui/Button";
import { useEffect, useState } from "react";
import { CheckCircle2, ClipboardList, Copy, Edit2, Eye, Plus, Trash2, XCircle } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useDialog } from "../lib/DialogContext";

import {
  academicsApi,
  operationsApi,
  type AdmissionApplication,
  type AdmissionForm,
  type ContactEnquiry,
  type FormFieldDefinition,
  type Program,
} from "../lib/endpoints";
import { useAuth } from "../lib/AuthContext";
import { Input, Select } from "./ui/Field";
import { ErrorState, LoadingState } from "./ui/AsyncState";
import { DataTable } from "./ui/DataTable";
import { DEFAULT_PAGE_SIZE, pageParams, PaginationControls, recoverEmptyPage, type PageState } from "./ui/Pagination";
import { useSessionReadOnly } from "./SessionSwitcher";
import { Modal, FormModal } from "./ui/Modal";
import { PageSection, PageHeader } from "./ui/Layout";
import { cleanFormFields, emptyFormField, FormFieldsEditor, validateFormFields } from "./FormFieldsEditor";

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
  const [applications, setApplications] = useState<AdmissionApplication[]>([]);
  const emptyForm = {
    applicant_name: "", guardian_name: "", guardian_relationship: "", guardian_contact: "", guardian_cnic: "",
    program_id: "", date_of_birth: "", gender: "", b_form_number: "", address: "", previous_school: "",
    previous_class: "", medical_notes: "", notes: "",
  };
  const [form, setForm] = useState(emptyForm);
  const [showCreate, setShowCreate] = useState(false);
  const [detail, setDetail] = useState<AdmissionApplication | null>(null);
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
                        applicant_name: form.applicant_name,
                        guardian_contact: form.guardian_contact,
                        program_id: form.program_id || undefined,
                        date_of_birth: form.date_of_birth || undefined,
                        notes: form.notes || undefined,
                        extra_data: {
                          guardian_name: form.guardian_name,
                          guardian_relationship: form.guardian_relationship,
                          guardian_cnic: form.guardian_cnic,
                          gender: form.gender,
                          b_form_number: form.b_form_number,
                          address: form.address,
                          previous_school: form.previous_school,
                          previous_class: form.previous_class,
                          medical_notes: form.medical_notes,
                        },
                      });
                      setForm(emptyForm);
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
            <label>{t("applicantNameLabel")}<Input required value={form.applicant_name} onChange={(e) => setForm({ ...form, applicant_name: e.target.value })} /></label>

          <label>{t("guardianNameLabel")}<Input required value={form.guardian_name} onChange={(e) => setForm({ ...form, guardian_name: e.target.value })} /></label>

          <label>{t("relationshipLabel")}<Input required value={form.guardian_relationship} onChange={(e) => setForm({ ...form, guardian_relationship: e.target.value })} /></label>

          <label>{t("guardianContactLabel")}<Input required value={form.guardian_contact} onChange={(e) => setForm({ ...form, guardian_contact: e.target.value })} /></label>

          <label>{t("guardianCnicLabel")}<Input value={form.guardian_cnic} onChange={(e) => setForm({ ...form, guardian_cnic: e.target.value })} /></label>

          <label>
                    {t("programLabel")}
                    <Select required value={form.program_id} onChange={(e) => setForm({ ...form, program_id: e.target.value })}>
                      <option value="">{t("selectEllipsis")}</option>
                      {programs.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </Select>
                  </label>

          <label>{t("dobLabel")}<Input required type="date" value={form.date_of_birth} onChange={(e) => setForm({ ...form, date_of_birth: e.target.value })} /></label>

          <label>{t("genderLabel")}<Select required value={form.gender} onChange={(e) => setForm({ ...form, gender: e.target.value })}><option value="">{t("selectEllipsis")}</option><option value="male">{t("maleLabel")}</option><option value="female">{t("femaleLabel")}</option></Select></label>

          <label>{t("bFormLabel")}<Input required value={form.b_form_number} onChange={(e) => setForm({ ...form, b_form_number: e.target.value })} /></label>

          <label>{t("addressLabel")}<Input required value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></label>

          <label>{t("previousSchoolLabel")}<Input value={form.previous_school} onChange={(e) => setForm({ ...form, previous_school: e.target.value })} /></label>

          <label>{t("previousClassLabel")}<Input value={form.previous_class} onChange={(e) => setForm({ ...form, previous_class: e.target.value })} /></label>

          <label>{t("medicalNotesLabel")}<Input value={form.medical_notes} onChange={(e) => setForm({ ...form, medical_notes: e.target.value })} /></label>

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
              <>
                <Button className="tableAction" type="button" title={t("viewBtn")} onClick={() => setDetail(a)}><Eye size={14} /></Button>
                {canMutate && a.status === "pending" && (
                  <>
                    <Button className="tableAction" type="button" onClick={async () => { await operationsApi.setAdmissionStatus(a.id, "accepted"); await load(); }}>
                      <CheckCircle2 size={14} />
                    </Button>
                    <Button className="tableAction" type="button" onClick={async () => { await operationsApi.setAdmissionStatus(a.id, "rejected"); await load(); }}>
                      <XCircle size={14} />
                    </Button>
                  </>
                )}
              </>
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
      </Modal>}
    </>
  );
}

// ---------------------------------------------------- Public admission forms

function AdmissionFormsTab({ programs, canMutate }: Readonly<{ programs: Program[]; canMutate: boolean }>) {
  const { t } = useTranslation();
  const [forms, setForms] = useState<AdmissionForm[]>([]);
  const [form, setForm] = useState({ program_id: "", title: "", description: "" });
  const [fields, setFields] = useState<FormFieldDefinition[]>([emptyFormField()]);
  const [editing, setEditing] = useState<AdmissionForm | null>(null);
  const [editFields, setEditFields] = useState<FormFieldDefinition[]>([]);
  const [copiedId, setCopiedId] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [pagination, setPagination] = useState<PageState>({ page: 0, pageSize: DEFAULT_PAGE_SIZE });
  const [total, setTotal] = useState(0);
  const [showCreate, setShowCreate] = useState(false);

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

  const publicUrl = (token: string) => `${window.location.origin}/public/admission/${token}`;

  const copyLink = async (adm: AdmissionForm) => {
    await navigator.clipboard.writeText(publicUrl(adm.public_token));
    setCopiedId(adm.id);
    setTimeout(() => setCopiedId(""), 2500);
  };

  return (
    <>
      <p className="notice">{t("admissionFormsHint")}</p>
      {canMutate && <div className="formActions" style={{ marginBottom: 12 }}>
        <Button className="primaryAction" type="button" onClick={() => setShowCreate(true)}><Plus size={16} /> {t("createAdmissionFormBtn")}</Button>
      </div>}
      {canMutate && showCreate && <FormModal
            title={t("createAdmissionFormBtn")} onClose={() => setShowCreate(false)}
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
                        program_id: form.program_id,
                        title: form.title,
                        description: form.description,
                        fields: cleanFormFields(fields),
                      });
                      setForm({ program_id: "", title: "", description: "" });
                      setFields([emptyFormField()]);
                      setShowCreate(false);
                      await load();
                    } catch (err: any) {
                      setError(err.response?.data?.detail ?? t("failedCreateForm"));
                    }
                  }}
            submitLabel={t("createAdmissionFormBtn")}
            submitIcon={<Plus size={16} />}
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

          <FormFieldsEditor fields={fields} onChange={setFields} />
          </FormModal>}
      {error && <p className="notice" style={{ color: "var(--rose)" }}>{error}</p>}

      <DataTable<AdmissionForm>
        columns={[
          { header: t("titleCol"), render: (adm) => adm.title },
          { header: t("programLabel"), render: (adm) => adm.program_name ?? "—" },
          { header: t("fieldsCol"), render: (adm) => adm.fields_definition.length },
          { header: t("statusCol"), render: (adm) => adm.is_open ? t("openLabel") : t("closedLabel") },
          { header: t("actionsCol"), render: (adm) => (
            <span style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <Button className="tableAction" type="button" onClick={() => void copyLink(adm)}>
                <Copy size={14} /> {copiedId === adm.id ? t("linkCopied") : t("copyPublicLinkBtn")}
              </Button>
              {canMutate && <Button
                className="tableAction"
                type="button"
                aria-label={`${t("editBtn")} ${adm.title}`}
                onClick={() => {
                  setEditing({ ...adm });
                  setEditFields(adm.fields_definition.map((field) => ({ ...field, options: [...field.options] })));
                  setError("");
                }}
              >
                <Edit2 size={14} /> {t("editBtn")}
              </Button>}
              {canMutate && <Button
                className="tableAction"
                type="button"
                onClick={async () => {
                  await operationsApi.updateAdmissionForm(adm.id, { is_open: !adm.is_open });
                  await load();
                }}
              >
                {adm.is_open ? t("closeFormBtn") : t("reopenFormBtn")}
              </Button>}
              {canMutate && <Button
                className="tableAction danger"
                type="button"
                aria-label={t("deleteAdmissionFormBtn")}
                onClick={async () => {
                  if (!(await confirm(t("deleteAdmissionFormConfirm")))) return;
                  try {
                    await operationsApi.deleteAdmissionForm(adm.id);
                    await load();
                  } catch (err: any) {
                    setError(err.response?.data?.detail ?? t("failedDeleteAdmissionForm"));
                  }
                }}
              >
                <Trash2 size={14} /> {t("deleteBtn")}
              </Button>}
            </span>
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
            title={t("editAdmissionFormHeading")} onClose={() => setEditing(null)}
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
            <label>{t("programLabel")}<Input disabled value={editing.program_name ?? ""} /></label>

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
            <Button className="tableAction" type="button" onClick={async () => { await operationsApi.setEnquiryStatus(e.id, "reviewed"); await load(); }}>
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
