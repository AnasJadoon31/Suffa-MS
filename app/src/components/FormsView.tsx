import { Button } from "./ui/Button";
import { useEffect, useMemo, useState } from "react";
import { Edit2, FileText, Plus, Send, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useDialog } from "../lib/DialogContext";

import { operationsApi, type FormDef, type FormFieldDefinition, type FormResponse, type Scope } from "../lib/endpoints";
import { AudiencePicker } from "./AudiencePicker";
import { useAuth } from "../lib/AuthContext";
import { Input, Select, Checkbox } from "./ui/Field";
import { ErrorState, LoadingState } from "./ui/AsyncState";
import { DataTable } from "./ui/DataTable";
import { useSessionReadOnly } from "./SessionSwitcher";
import { Modal, FormModal } from "./ui/Modal";
import { PageSection, PageHeader } from "./ui/Layout";
import { cleanFormFields, emptyFormField, FormFieldsEditor, validateFormFields } from "./FormFieldsEditor";

export function FormsView() {
  const { t } = useTranslation();
  const { alert, confirm } = useDialog();
  const { user, hasPermission } = useAuth();
  const readOnly = useSessionReadOnly();
  const canCreate = !readOnly && hasPermission("forms.create");
  const canManageAll = hasPermission("forms.manage_all");
  const canViewResponses = hasPermission("forms.responses.view");
  const [forms, setForms] = useState<FormDef[]>([]);
  const [categoryFilter, setCategoryFilter] = useState("");
  const [selected, setSelected] = useState<FormDef | null>(null);
  const [responses, setResponses] = useState<FormResponse[]>([]);
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

  const openForm = async (form: FormDef) => {
    setSelected(form);
    setAnswers({});
    setNotice("");
    setError("");
    if (canViewResponses) setResponses(await operationsApi.listFormResponses(form.id));
  };

  const canEditForm = (form: FormDef) => !readOnly && (canManageAll || form.created_by_id === user?.id);

  return (
    <PageSection>
      <PageHeader
        title={t("forms")}
        icon={<FileText size={18} />}
        notice={t("descForms")}
      />

      {canCreate && <div className="formActions" style={{ marginBottom: 12 }}>
        <Button className="primaryAction" type="button" onClick={() => setShowCreate(true)}><Plus size={16} /> {t("createFormBtn")}</Button>
      </div>}

      {canCreate && showCreate && <FormModal
            title={t("createFormBtn")} onClose={() => setShowCreate(false)}
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

          <AudiencePicker value={audience} onChange={setAudience} />

          <FormFieldsEditor fields={fields} onChange={setFields} />
          </FormModal>}
      {error && <p className="notice" style={{ color: "var(--rose)" }}>{error}</p>}
      <datalist id="form-categories">
        {knownCategories.map((c) => <option key={c} value={c} />)}
      </datalist>

      <div className="moduleToolbar">
        <Select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
          <option value="">{t("allCategories")}</option>
          {knownCategories.map((c) => <option key={c} value={c}>{c}</option>)}
        </Select>
      </div>

      <DataTable<FormDef>
        columns={[
          { header: t("titleCol"), render: (f) => f.title },
          { header: t("categoryFilterLabel"), render: (f) => f.category ?? "—" },
          { header: t("fieldsCol"), render: (f) => f.fields_definition.length },
          { header: t("actionsCol"), render: (f) => (
            <span style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <Button className="tableAction" type="button" onClick={() => void openForm(f)}>{t("openBtn")}</Button>
              {canEditForm(f) && (
                <>
                  <Button
                    className="iconBtn" type="button" title={t("editBtn") ?? ""}
                    onClick={() => {
                      setEditing(f);
                      setEditAudience(f.visibility_scope);
                      setEditError("");
                    }}
                  >
                    <Edit2 size={14} />
                  </Button>
                  <Button
                    className="iconBtn" type="button" title={t("deleteBtn") ?? ""}
                    onClick={async () => {
                      if (!(await confirm(t("deleteFormConfirm") ?? ""))) return;
                      try {
                        await operationsApi.deleteForm(f.id);
                        if (selected?.id === f.id) setSelected(null);
                        await load();
                      } catch (err: any) {
                        await alert(err.response?.data?.detail ?? t("failedDeleteForm"));
                      }
                    }}
                  >
                    <Trash2 size={14} />
                  </Button>
                </>
              )}
            </span>
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
          onClose={() => setSelected(null)}
          submitLabel={t("submitResponseBtn")}
          submitIcon={<Send size={16} />}
          error={error}
          onSubmit={async (e) => {
            e.preventDefault();
            setError("");
            try {
              await operationsApi.submitFormResponse(selected.id, answers);
              setNotice(t("responseSubmitted"));
              setAnswers({});
            } catch (err: any) {
              setError(err.response?.data?.detail ?? t("failedSubmitResponse"));
            }
          }}
        >
          {notice && <p className="notice">{notice}</p>}
          <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            {selected.fields_definition.map((f) => (
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
          </div>          {canViewResponses && (
            <div className="dataTable" style={{ marginTop: 16 }}>
              <div className="dataRow header"><span>{t("studentCol")}</span><span>{t("submittedCol")}</span><span>{t("answersCol")}</span></div>
              {responses.length === 0 && <p className="emptyState">{t("noResponsesYet")}</p>}
              {responses.map((r) => (
                <div className="dataRow" key={r.id}>
                  <span>{r.student_name ?? t("unknownPersonLabel")}</span>
                  <span>{new Date(r.created_at).toLocaleString()}</span>
                  <span>{JSON.stringify(r.response_data)}</span>
                </div>
              ))}
            </div>
          )}
        </FormModal>
      )}

      {editing && (
        <FormModal
          title={t("editFormHeading")}
          onClose={() => setEditing(null)}
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
          <AudiencePicker value={editAudience} onChange={setEditAudience} />
        </FormModal>
      )}
    </PageSection>
  );
}
