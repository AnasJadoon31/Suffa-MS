import { useEffect, useMemo, useState } from "react";
import { Edit2, Plus, Send, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";

import { operationsApi, type FormDef, type FormFieldDefinition, type FormResponse, type Scope } from "../lib/endpoints";
import { AudiencePicker } from "./AudiencePicker";
import { useAuth } from "../lib/AuthContext";
import { Input, Select } from "./ui/Field";
import { ErrorState, LoadingState } from "./ui/AsyncState";
import { useSessionReadOnly } from "./SessionSwitcher";

const FIELD_TYPES = ["text", "textarea", "radio", "checkbox_group", "dropdown", "label"];

export function FormsView() {
  const { t } = useTranslation();
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
  const [audience, setAudience] = useState<Scope>({ all: true });
  const [fields, setFields] = useState<FormFieldDefinition[]>([
    { key: "", label: "", type: "text", required: true, options: [] },
  ]);

  const [editing, setEditing] = useState<FormDef | null>(null);
  const [editAudience, setEditAudience] = useState<Scope>({ all: true });
  const [editError, setEditError] = useState("");

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
    <section className="modulePanel">
      <div className="moduleHeader">
        <h2>{t("forms")}</h2>
        <p className="notice">{t("descForms")}</p>
      </div>

      {canCreate && (
        <form
          className="inlineForm"
          style={{ gridTemplateColumns: "1fr" }}
          onSubmit={async (e) => {
            e.preventDefault();
            setError("");
            const cleanFields = fields
              .filter((f) => f.key && f.label)
              .map((f) => ({ ...f, options: f.type === "label" || f.type === "text" || f.type === "textarea" ? [] : f.options }));
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
              setFields([{ key: "", label: "", type: "text", required: true, options: [] }]);
              await load();
            } catch (err: any) {
              setError(err.response?.data?.detail ?? t("failedCreateForm"));
            }
          }}
        >
          <div className="inlineForm" style={{ margin: 0, padding: 0, border: "none", background: "none" }}>
            <label>{t("titleLabel")}<Input required value={formTitle} onChange={(e) => setFormTitle(e.target.value)} /></label>
            <label>{t("descriptionLabel")}<Input value={formDescription} onChange={(e) => setFormDescription(e.target.value)} /></label>
            <label>{t("formCategoryLabel")}<Input value={formCategory} onChange={(e) => setFormCategory(e.target.value)} placeholder={t("formCategoryPlaceholder") ?? ""} list="form-categories" /></label>
            <label style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Input type="checkbox" checked={allowMultiple} onChange={(e) => setAllowMultiple(e.target.checked)} /> {t("allowMultipleLabel")}
            </label>
          </div>
          <AudiencePicker value={audience} onChange={setAudience} />

          <div style={{ display: "grid", gap: 8 }}>
            {fields.map((f, i) => (
              <div key={i} className="inlineForm" style={{ margin: 0 }}>
                <label>{t("fieldKeyLabel")}<Input required value={f.key} onChange={(e) => updateField(fields, setFields, i, { key: e.target.value })} placeholder="field_key" /></label>
                <label>{t("fieldLabelLabel")}<Input required value={f.label} onChange={(e) => updateField(fields, setFields, i, { label: e.target.value })} /></label>
                <label>
                  {t("fieldTypeLabel")}
                  <Select value={f.type} onChange={(e) => updateField(fields, setFields, i, { type: e.target.value })}>
                    {FIELD_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                  </Select>
                </label>
                {(f.type === "radio" || f.type === "checkbox_group" || f.type === "dropdown") && (
                  <label>
                    {t("fieldOptionsLabel")}
                    <Input value={f.options.join(", ")} onChange={(e) => updateField(fields, setFields, i, { options: e.target.value.split(",").map((o) => o.trim()).filter(Boolean) })} />
                  </label>
                )}
                <label style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <Input type="checkbox" checked={f.required} onChange={(e) => updateField(fields, setFields, i, { required: e.target.checked })} /> {t("requiredLabel")}
                </label>
                <div className="formActions">
                  <button className="tableAction" type="button" onClick={() => setFields(fields.filter((_, idx) => idx !== i))}>
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
          <div className="formActions">
            <button className="secondaryAction" type="button" onClick={() => setFields([...fields, { key: "", label: "", type: "text", required: true, options: [] }])}>
              <Plus size={16} /> {t("addFieldBtn")}
            </button>
            <button className="primaryAction" type="submit"><Plus size={16} /> {t("createFormBtn")}</button>
          </div>
        </form>
      )}
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

      <div className="dataTable">
        <div className="dataRow header"><span>{t("titleCol")}</span><span>{t("categoryFilterLabel")}</span><span>{t("fieldsCol")}</span><span></span></div>
        {isLoading && <LoadingState />}
        {!isLoading && loadError && <ErrorState message={loadError} />}
        {!isLoading && !loadError && forms.length === 0 && <p className="emptyState">{t("noFormsYet")}</p>}
        {!isLoading && !loadError && forms.map((f) => (
          <div className="dataRow" key={f.id}>
            <span>{f.title}</span>
            <span>{f.category ?? "—"}</span>
            <span>{f.fields_definition.length}</span>
            <span style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button className="tableAction" type="button" onClick={() => void openForm(f)}>{t("openBtn")}</button>
              {canEditForm(f) && (
                <>
                  <button
                    className="iconBtn" type="button" title={t("editBtn") ?? ""}
                    onClick={() => {
                      setEditing(f);
                      setEditAudience(f.visibility_scope);
                      setEditError("");
                    }}
                  >
                    <Edit2 size={14} />
                  </button>
                  <button
                    className="iconBtn" type="button" title={t("deleteBtn") ?? ""}
                    onClick={async () => {
                      if (!confirm(t("deleteFormConfirm") ?? "")) return;
                      try {
                        await operationsApi.deleteForm(f.id);
                        if (selected?.id === f.id) setSelected(null);
                        await load();
                      } catch (err: any) {
                        alert(err.response?.data?.detail ?? t("failedDeleteForm"));
                      }
                    }}
                  >
                    <Trash2 size={14} />
                  </button>
                </>
              )}
            </span>
          </div>
        ))}
      </div>

      {selected && (
        <div className="modulePanel" style={{ marginTop: 16 }}>
          <h3>{selected.title}</h3>
          {notice && <p className="notice">{notice}</p>}
          <form
            className="inlineForm"
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
            <div className="formActions">
              <button className="primaryAction" type="submit" disabled={readOnly}><Send size={16} /> {t("submitResponseBtn")}</button>
            </div>
          </form>

          {canViewResponses && (
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
        </div>
      )}

      {editing && (
        <div
          style={{
            position: "fixed", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.5)",
            display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000,
          }}
          onClick={() => setEditing(null)}
        >
          <div
            style={{
              backgroundColor: "var(--surface)", padding: "2rem", borderRadius: "8px", width: "100%",
              maxWidth: "600px", maxHeight: "90vh", overflowY: "auto",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ marginTop: 0 }}>{t("editFormHeading")}</h3>
            <form
              className="inlineForm"
              style={{ gridTemplateColumns: "1fr", border: "none", padding: 0 }}
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
              {editError && <p className="notice" style={{ color: "var(--rose)" }}>{editError}</p>}
              <div className="formActions" style={{ justifyContent: "flex-end" }}>
                <button type="button" onClick={() => setEditing(null)}>{t("cancelBtn")}</button>
                <button className="primaryAction" type="submit">{t("editBtn")}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}

function updateField(
  fields: FormFieldDefinition[],
  setFields: (f: FormFieldDefinition[]) => void,
  index: number,
  patch: Partial<FormFieldDefinition>,
) {
  setFields(fields.map((f, i) => (i === index ? { ...f, ...patch } : f)));
}
