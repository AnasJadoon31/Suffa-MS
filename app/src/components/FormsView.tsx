import { Button } from "./ui/Button";
import { useEffect, useMemo, useState } from "react";
import { Edit2, Eye, FileText, Plus, Send, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useDialog } from "../lib/DialogContext";

import { operationsApi, reportingApi, type FormDef, type FormFieldDefinition, type FormResponse, type ParentDashboard, type Scope } from "../lib/endpoints";
import { StagedAudiencePicker } from "./StagedAudiencePicker";
import { useAuth } from "../lib/AuthContext";
import { Input, Select, Checkbox } from "./ui/Field";
import { ErrorState, LoadingState } from "./ui/AsyncState";
import { DataTable } from "./ui/DataTable";
import { useSessionReadOnly } from "./SessionSwitcher";
import { Modal, FormModal } from "./ui/Modal";
import { PageSection, PageHeader } from "./ui/Layout";
import { cleanFormFields, emptyFormField, FormFieldsEditor, validateFormFields } from "./FormFieldsEditor";
import { InlineFilter } from "./ui/InlineFilter";
import { ActionMenu } from "./ui/ActionMenu";
import { PhoneInput } from "./ui/PhoneInput";

export function FormsView() {
  const { t } = useTranslation();
  const { alert, confirm } = useDialog();
  const { user, hasPermission } = useAuth();
  const readOnly = useSessionReadOnly();
  const canCreate = !readOnly && hasPermission("forms.create");
  const canManageAll = hasPermission("forms.manage_all");
  const canViewResponses = hasPermission("forms.responses.view");
  const [forms, setForms] = useState<FormDef[]>([]);
  const [activeTab, setActiveTab] = useState<"forms" | "responses">("forms");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [selected, setSelected] = useState<FormDef | null>(null);
  const [responses, setResponses] = useState<FormResponse[]>([]);
  const [responseFilters, setResponseFilters] = useState({ form_id: "", respondent_role: "", student_id: "", date_from: "", date_to: "" });
  const [wards, setWards] = useState<ParentDashboard["children"]>([]);
  const [selectedWardId, setSelectedWardId] = useState("");
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const [formTitle, setFormTitle] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formCategory, setFormCategory] = useState("");
  const [allowMultiple, setAllowMultiple] = useState(false);
  const [audience, setAudience] = useState<Scope>(user?.role === "teacher" ? { all: false } : { all: true });
  const [fields, setFields] = useState<FormFieldDefinition[]>([
    emptyFormField(),
  ]);

  const [editing, setEditing] = useState<FormDef | null>(null);
  const [editAudience, setEditAudience] = useState<Scope>({ all: true });
  const [editError, setEditError] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [selectedResponse, setSelectedResponse] = useState<FormResponse | null>(null);

  const knownCategories = useMemo(
    () => [...new Set(forms.map((f) => f.category).filter(Boolean))] as string[],
    [forms]
  );

  const load = async () => {
    setIsLoading(true);
    try {
      setForms(await operationsApi.listForms({ category: categoryFilter || undefined }));
      setLoadError("");
    } catch (err: any) {
      setLoadError(err.response?.data?.detail ?? t("failedLoadForms"));
    } finally {
      setIsLoading(false);
    }
  };
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categoryFilter]);

  useEffect(() => {
    if (user?.role !== "parent") return;
    void reportingApi.dashboard().then((dashboard) => {
      if (dashboard.role !== "parent") return;
      setWards(dashboard.children);
      setSelectedWardId((current) => current || dashboard.children[0]?.id || "");
    });
  }, [user?.role]);

  useEffect(() => {
    if (activeTab !== "responses" || !canViewResponses) return;
    void operationsApi.listAllFormResponses({
      form_id: responseFilters.form_id || undefined,
      respondent_role: responseFilters.respondent_role || undefined,
      student_id: responseFilters.student_id || undefined,
      date_from: responseFilters.date_from || undefined,
      date_to: responseFilters.date_to || undefined,
    }).then(setResponses).catch(() => setResponses([]));
  }, [activeTab, canViewResponses, responseFilters]);

  const openForm = async (form: FormDef) => {
    setSelected(form);
    setAnswers({});
    setNotice("");
    setError("");
  };

  const canEditForm = (form: FormDef) => !readOnly && (canManageAll || form.created_by_id === user?.id);

  return (
    <PageSection>
      <PageHeader
        title={t("forms")}
        icon={<FileText size={18} />}
        notice={t("descForms")}
      />

      <div className="tabs" role="tablist" aria-label={t("forms")}>
        <Button className={activeTab === "forms" ? "primaryAction" : "secondaryAction"} type="button" role="tab" aria-selected={activeTab === "forms"} onClick={() => setActiveTab("forms")}>{t("formsTabLabel")}</Button>
        {canViewResponses && <Button className={activeTab === "responses" ? "primaryAction" : "secondaryAction"} type="button" role="tab" aria-selected={activeTab === "responses"} onClick={() => setActiveTab("responses")}>{t("responsesTabLabel")}</Button>}
      </div>

      {activeTab === "forms" && (<>
      {canCreate && <div className="formActions" style={{ marginBottom: 12 }}>
        <Button className="primaryAction" type="button" onClick={() => setShowCreate(true)}><Plus size={16} /> {t("createFormBtn")}</Button>
      </div>}

      {canCreate && showCreate && <FormModal
            title={t("createFormBtn")} onClose={() => setShowCreate(false)} maxWidth={800}
            onSubmit={async (e) => {
                      e.preventDefault();
                      setError("");
                      const fieldError = validateFormFields(fields);
                      if (fieldError) {
                        setError(t(fieldError));
                        return;
                      }
                      const cleanFields = cleanFormFields(fields);
                      if (!formTitle || cleanFields.length === 0) return;
                      try {
                        await operationsApi.createForm({
                          title: formTitle, description: formDescription, category: formCategory || undefined,
                          fields: cleanFields, allow_multiple: allowMultiple, visibility_scope: audience,
                        });
                        setFormTitle("");
                        setFormDescription("");
                        setFormCategory("");
                        setAllowMultiple(false);
                        setFields([emptyFormField()]);
                        setShowCreate(false);
                        await load();
                      } catch (err: any) {
                        setError(err.response?.data?.detail ?? t("failedCreateForm"));
                      }
                    }}
            submitLabel={t("createFormBtn")}
            submitIcon={<Plus size={16} />}
          >
            <div style={{ display: "flex", flexDirection: "column", gap: "1rem", margin: 0, padding: 0, border: "none", background: "none" }}>
                      <label>{t("titleLabel")}<Input required value={formTitle} onChange={(e) => setFormTitle(e.target.value)} /></label>
                      <label>{t("descriptionLabel")}<Input value={formDescription} onChange={(e) => setFormDescription(e.target.value)} /></label>
                      <label>{t("formCategoryLabel")}<Input value={formCategory} onChange={(e) => setFormCategory(e.target.value)} placeholder={t("formCategoryPlaceholder") ?? ""} list="form-categories" /></label>
                      <label style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                        <Input type="checkbox" checked={allowMultiple} onChange={(e) => setAllowMultiple(e.target.checked)} /> {t("allowMultipleLabel")}
                      </label>
                    </div>

          <StagedAudiencePicker value={audience} onChange={setAudience} />

          <FormFieldsEditor fields={fields} onChange={setFields} />
          </FormModal>}
      {error && <p className="notice" style={{ color: "var(--rose)" }}>{error}</p>}
      <datalist id="form-categories">
        {knownCategories.map((c) => <option key={c} value={c} />)}
      </datalist>

      <InlineFilter filters={[{
        key: "category", type: "select", value: categoryFilter,
        ariaLabel: t("categoryFilterLabel"), placeholder: t("allCategories"),
        options: knownCategories.map((category) => ({ value: category, label: category })),
        onChange: setCategoryFilter,
      }]} />

      <DataTable<FormDef>
        columns={[
          { header: t("titleCol"), render: (f) => f.title },
          { header: t("categoryFilterLabel"), render: (f) => f.category ?? "—" },
          { header: t("fieldsCol"), render: (f) => f.fields_definition.length },
          { header: t("actionsCol"), render: (f) => (
            <ActionMenu items={[
              { label: t("openBtn"), onClick: () => openForm(f) },
              ...(canEditForm(f) ? [{
                label: t("editBtn"),
                icon: <Edit2 size={14} />,
                onClick: () => {
                      setEditing(f);
                      setEditAudience(f.visibility_scope);
                      setEditError("");
                },
              }, {
                label: t("deleteBtn"),
                icon: <Trash2 size={14} />,
                destructive: true,
                onClick: async () => {
                      if (!(await confirm(t("deleteFormConfirm") ?? ""))) return;
                      try {
                        await operationsApi.deleteForm(f.id);
                        if (selected?.id === f.id) setSelected(null);
                        await load();
                      } catch (err: any) {
                        await alert(err.response?.data?.detail ?? t("failedDeleteForm"));
                      }
                },
              }] : []),
            ]} ariaLabel={`${t("actionsCol")}: ${f.title}`} />
          )},
        ]}
        data={forms}
        keyExtractor={(f) => f.id}
        isLoading={isLoading}
        error={loadError}
        emptyMessage={t("noFormsYet")}
      />

      {selected && (
        <FormModal
          title={selected.title}
          maxWidth={800}
          onClose={() => setSelected(null)}
          submitLabel={t("submitResponseBtn")}
          submitIcon={<Send size={16} />}
          error={error}
          onSubmit={async (e) => {
            e.preventDefault();
            setError("");
            try {
              await operationsApi.submitFormResponse(selected.id, answers, user?.role === "parent" ? selectedWardId : undefined);
              setNotice(t("responseSubmitted"));
              setAnswers({});
            } catch (err: any) {
              setError(err.response?.data?.detail ?? t("failedSubmitResponse"));
            }
          }}
        >
          {notice && <p className="notice">{notice}</p>}
          {user?.role === "parent" && (
            <label>{t("wardLabel")}<Select required value={selectedWardId} onChange={(event) => setSelectedWardId(event.target.value)}>{wards.map((ward) => <option key={ward.id} value={ward.id}>{ward.name}</option>)}</Select></label>
          )}
          <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            {selected.fields_definition.map((f) => (
              f.type === "phone"
                ? <PhoneInput key={f.key} id={`form-${f.key}`} label={f.label} required={f.required} value={answers[f.key] ?? ""} onChange={(value) => setAnswers({ ...answers, [f.key]: value })} />
                :
              <label key={f.key}>
                {f.label}
                <Input
                  required={f.required}
                  disabled={readOnly}
                  value={answers[f.key] ?? ""}
                  onChange={(e) => setAnswers({ ...answers, [f.key]: e.target.value })}
                  placeholder={f.options.length > 0 ? f.options.join(" / ") : undefined}
                />
              </label>
            ))}
          </div>
        </FormModal>
      )}

      {editing && (
        <FormModal
          title={t("editFormHeading")}
          onClose={() => setEditing(null)}
          maxWidth={800}
          submitLabel={t("editBtn")}
          error={editError}
          onSubmit={async (e) => {
            e.preventDefault();
            if (!editing) return;
            setEditError("");
            try {
              await operationsApi.updateForm(editing.id, {
                title: editing.title, description: editing.description, category: editing.category ?? undefined,
                allow_multiple: editing.allow_multiple, visibility_scope: editAudience,
              });
              setEditing(null);
              await load();
            } catch (err: any) {
              setEditError(err.response?.data?.detail ?? t("failedUpdateForm"));
            }
          }}
        >
          <label>{t("titleLabel")}<Input required value={editing.title} onChange={(e) => setEditing({ ...editing, title: e.target.value })} /></label>
          <label>{t("descriptionLabel")}<Input value={editing.description} onChange={(e) => setEditing({ ...editing, description: e.target.value })} /></label>
          <label>{t("formCategoryLabel")}<Input value={editing.category ?? ""} onChange={(e) => setEditing({ ...editing, category: e.target.value })} list="form-categories" /></label>
          <StagedAudiencePicker value={editAudience} onChange={setEditAudience} />
        </FormModal>
      )}
      </>)}

      {activeTab === "responses" && canViewResponses && (
        <>
          <InlineFilter filters={[
            { key: "response-form", type: "select", value: responseFilters.form_id, placeholder: t("allFormsLabel"), options: forms.map((form) => ({ value: form.id, label: form.title })), onChange: (value) => setResponseFilters({ ...responseFilters, form_id: value }) },
            { key: "response-role", type: "select", value: responseFilters.respondent_role, placeholder: t("allRolesLabel"), options: [{ value: "student", label: t("students") }, { value: "teacher", label: t("teachers") }, { value: "parent", label: t("guardians") }], onChange: (value) => setResponseFilters({ ...responseFilters, respondent_role: value }) },
            { key: "response-student", type: "input", value: responseFilters.student_id, placeholder: t("studentIdFilterPlaceholder"), onChange: (value) => setResponseFilters({ ...responseFilters, student_id: value }) },
            { key: "response-from", type: "input", inputType: "date", value: responseFilters.date_from, ariaLabel: t("fromLabel"), onChange: (value) => setResponseFilters({ ...responseFilters, date_from: value }) },
            { key: "response-to", type: "input", inputType: "date", value: responseFilters.date_to, ariaLabel: t("toLabel"), onChange: (value) => setResponseFilters({ ...responseFilters, date_to: value }) },
          ]} />
          <DataTable<FormResponse>
            columns={[
              { header: t("formLabel"), render: (response) => forms.find((form) => form.id === response.form_id)?.title ?? "—" },
              { header: t("respondentLabel"), render: (response) => response.submitted_by_name ?? t("deletedPersonLabel") },
              { header: t("wardLabel"), render: (response) => response.ward_name ?? response.student_name ?? "—" },
              { header: t("submittedCol"), render: (response) => new Date(response.created_at).toLocaleString() },
              { header: t("actionsCol"), render: (response) => <ActionMenu items={[{ label: t("viewResponseBtn"), icon: <Eye size={14} />, onClick: () => setSelectedResponse(response) }]} /> },
            ]}
            data={responses}
            keyExtractor={(response) => response.id}
            emptyMessage={t("noResponsesYet")}
          />
        </>
      )}
      {selectedResponse && (
        <Modal title={t("responseDetailsHeading")} onClose={() => setSelectedResponse(null)}>
          <dl className="responseDetails">
            <dt>{t("respondentLabel")}</dt><dd>{selectedResponse.submitted_by_name ?? t("deletedPersonLabel")}</dd>
            <dt>{t("wardLabel")}</dt><dd>{selectedResponse.ward_name ?? selectedResponse.student_name ?? "—"}</dd>
            <dt>{t("submittedCol")}</dt><dd>{new Date(selectedResponse.created_at).toLocaleString()}</dd>
            {(forms.find((form) => form.id === selectedResponse.form_id)?.fields_definition ?? []).map((field) => {
              const value = selectedResponse.response_data[field.key];
              const display = Array.isArray(value) ? value.join(", ") : value && typeof value === "object" ? JSON.stringify(value) : String(value ?? "—");
              return <div key={field.key} className="responseDetailRow"><dt>{field.label}</dt><dd>{display}</dd></div>;
            })}
          </dl>
        </Modal>
      )}
    </PageSection>
  );
}
