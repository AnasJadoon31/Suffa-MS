import { useEffect, useState } from "react";
import { Plus, Send, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";

import { operationsApi, type FormDef, type FormFieldDefinition, type FormResponse, type Scope } from "../lib/endpoints";
import { AudiencePicker } from "./AudiencePicker";
import { useAuth } from "../lib/AuthContext";
import { Input, Select } from "./ui/Field";


const FIELD_TYPES = ["text", "textarea", "radio", "checkbox_group", "dropdown", "label"];

export function FormsView() {
  const { t } = useTranslation();
  const { hasPermission } = useAuth();
  const canCreate = hasPermission("forms.create");
  const canViewResponses = hasPermission("forms.responses.view");
  const [forms, setForms] = useState<FormDef[]>([]);
  const [selected, setSelected] = useState<FormDef | null>(null);
  const [responses, setResponses] = useState<FormResponse[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [formTitle, setFormTitle] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [allowMultiple, setAllowMultiple] = useState(false);
  const [audience, setAudience] = useState<Scope>({ all: true });
  const [fields, setFields] = useState<FormFieldDefinition[]>([
    { key: "", label: "", type: "text", required: true, options: [] },
  ]);

  const load = async () => setForms(await operationsApi.listForms());
  useEffect(() => {
    void load();
  }, []);

  const openForm = async (form: FormDef) => {
    setSelected(form);
    setAnswers({});
    setNotice("");
    setError("");
    if (canViewResponses) setResponses(await operationsApi.listFormResponses(form.id));
  };

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
              await operationsApi.createForm({ title: formTitle, description: formDescription, fields: cleanFields, allow_multiple: allowMultiple, visibility_scope: audience });
              setFormTitle("");
              setFormDescription("");
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

      <div className="dataTable">
        <div className="dataRow header"><span>{t("titleCol")}</span><span>{t("descriptionLabel")}</span><span>{t("fieldsCol")}</span><span></span></div>
        {forms.length === 0 && <p className="emptyState">{t("noFormsYet")}</p>}
        {forms.map((f) => (
          <div className="dataRow" key={f.id}>
            <span>{f.title}</span>
            <span>{f.description || "—"}</span>
            <span>{f.fields_definition.length}</span>
            <span><button className="tableAction" type="button" onClick={() => void openForm(f)}>{t("openBtn")}</button></span>
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
                  value={answers[f.key] ?? ""}
                  onChange={(e) => setAnswers({ ...answers, [f.key]: e.target.value })}
                  placeholder={f.options.length > 0 ? f.options.join(" / ") : undefined}
                />
              </label>
            ))}
            <div className="formActions">
              <button className="primaryAction" type="submit"><Send size={16} /> {t("submitResponseBtn")}</button>
            </div>
          </form>

          {canViewResponses && (
            <div className="dataTable" style={{ marginTop: 16 }}>
              <div className="dataRow header"><span>{t("studentCol")}</span><span>{t("submittedCol")}</span><span>{t("answersCol")}</span></div>
              {responses.length === 0 && <p className="emptyState">{t("noResponsesYet")}</p>}
              {responses.map((r) => (
                <div className="dataRow" key={r.id}>
                  <span>{r.student_name ?? r.student_id}</span>
                  <span>{new Date(r.created_at).toLocaleString()}</span>
                  <span>{JSON.stringify(r.response_data)}</span>
                </div>
              ))}
            </div>
          )}
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
