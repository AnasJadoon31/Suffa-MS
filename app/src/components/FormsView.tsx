import { useEffect, useState } from "react";
import { Plus, Send, Trash2 } from "lucide-react";

import { operationsApi, type FormDef, type FormFieldDefinition, type FormResponse } from "../lib/endpoints";
import { useAuth } from "../lib/AuthContext";

const FIELD_TYPES = ["text", "textarea", "radio", "checkbox_group", "dropdown", "label"];

export function FormsView() {
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
        <h2>Forms</h2>
        <p className="notice">Build forms, collect responses from students.</p>
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
              await operationsApi.createForm({ title: formTitle, description: formDescription, fields: cleanFields, allow_multiple: allowMultiple });
              setFormTitle("");
              setFormDescription("");
              setAllowMultiple(false);
              setFields([{ key: "", label: "", type: "text", required: true, options: [] }]);
              await load();
            } catch (err: any) {
              setError(err.response?.data?.detail ?? "Failed to create form");
            }
          }}
        >
          <div className="inlineForm" style={{ margin: 0, padding: 0, border: "none", background: "none" }}>
            <label>Title<input required value={formTitle} onChange={(e) => setFormTitle(e.target.value)} /></label>
            <label>Description<input value={formDescription} onChange={(e) => setFormDescription(e.target.value)} /></label>
            <label style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <input type="checkbox" checked={allowMultiple} onChange={(e) => setAllowMultiple(e.target.checked)} /> Allow multiple submissions
            </label>
          </div>

          <div style={{ display: "grid", gap: 8 }}>
            {fields.map((f, i) => (
              <div key={i} className="inlineForm" style={{ margin: 0 }}>
                <label>Key<input required value={f.key} onChange={(e) => updateField(fields, setFields, i, { key: e.target.value })} placeholder="field_key" /></label>
                <label>Label<input required value={f.label} onChange={(e) => updateField(fields, setFields, i, { label: e.target.value })} /></label>
                <label>
                  Type
                  <select value={f.type} onChange={(e) => updateField(fields, setFields, i, { type: e.target.value })}>
                    {FIELD_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </label>
                {(f.type === "radio" || f.type === "checkbox_group" || f.type === "dropdown") && (
                  <label>
                    Options (comma separated)
                    <input value={f.options.join(", ")} onChange={(e) => updateField(fields, setFields, i, { options: e.target.value.split(",").map((o) => o.trim()).filter(Boolean) })} />
                  </label>
                )}
                <label style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <input type="checkbox" checked={f.required} onChange={(e) => updateField(fields, setFields, i, { required: e.target.checked })} /> Required
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
              <Plus size={16} /> Add field
            </button>
            <button className="primaryAction" type="submit"><Plus size={16} /> Create form</button>
          </div>
        </form>
      )}
      {error && <p className="notice" style={{ color: "var(--rose)" }}>{error}</p>}

      <div className="dataTable">
        <div className="dataRow header"><span>Title</span><span>Description</span><span>Fields</span><span></span></div>
        {forms.length === 0 && <p className="emptyState">No forms yet.</p>}
        {forms.map((f) => (
          <div className="dataRow" key={f.id}>
            <span>{f.title}</span>
            <span>{f.description || "—"}</span>
            <span>{f.fields_definition.length}</span>
            <span><button className="tableAction" type="button" onClick={() => void openForm(f)}>Open</button></span>
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
                setNotice("Response submitted.");
                setAnswers({});
              } catch (err: any) {
                setError(err.response?.data?.detail ?? "Failed to submit response");
              }
            }}
          >
            {selected.fields_definition.map((f) => (
              <label key={f.key}>
                {f.label}
                <input
                  required={f.required}
                  value={answers[f.key] ?? ""}
                  onChange={(e) => setAnswers({ ...answers, [f.key]: e.target.value })}
                  placeholder={f.options.length > 0 ? f.options.join(" / ") : undefined}
                />
              </label>
            ))}
            <div className="formActions">
              <button className="primaryAction" type="submit"><Send size={16} /> Submit response</button>
            </div>
          </form>

          {canViewResponses && (
            <div className="dataTable" style={{ marginTop: 16 }}>
              <div className="dataRow header"><span>Student</span><span>Submitted</span><span>Answers</span></div>
              {responses.length === 0 && <p className="emptyState">No responses yet.</p>}
              {responses.map((r) => (
                <div className="dataRow" key={r.id}>
                  <span>{r.student_id}</span>
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
