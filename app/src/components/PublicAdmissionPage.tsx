import { Button } from "./ui/Button";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useParams } from "react-router-dom";

import { publicApi, type PublicAdmissionForm } from "../lib/endpoints";
import { ErrorState, LoadingState } from "./ui/AsyncState";
import { Input, Select, Checkbox, Radio } from "./ui/Field";

export function PublicAdmissionPage() {
  const { token = "" } = useParams();
  const { t } = useTranslation();
  const [definition, setDefinition] = useState<PublicAdmissionForm | null>(null);
  const [form, setForm] = useState({ applicant_name: "", guardian_contact: "", date_of_birth: "", website: "" });
  const [extra, setExtra] = useState<Record<string, string | string[]>>({});
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    void publicApi.admissionForm(token)
      .then(setDefinition)
      .catch((err: any) => setError(err.response?.data?.detail ?? t("failedLoadAdmissionForms")))
      .finally(() => setLoading(false));
  }, [t, token]);

  if (loading) return <main className="publicFormPage"><LoadingState /></main>;
  if (error || !definition) return <main className="publicFormPage"><ErrorState message={error || t("failedLoadAdmissionForms")} /></main>;
  if (submitted) return <main className="publicFormPage"><section className="publicFormCard"><h1>{t("applicationSubmitted")}</h1></section></main>;

  return (
    <main className="publicFormPage">
      <section className="publicFormCard">
        <header className="moduleHeader">
          <span className="eyebrow">{definition.program_name}</span>
          <h1>{definition.title}</h1>
          {definition.description && <p className="notice">{definition.description}</p>}
        </header>
        {!definition.is_open && <p className="notice notice-warning">{t("closedLabel")}</p>}
        {definition.is_open && <form className="publicAdmissionForm" onSubmit={async (event) => {
          event.preventDefault();
          setError("");
          const missingRequired = definition.fields_definition.find((field) => {
            if (!field.required || field.type === "label") return false;
            const value = extra[field.key];
            return value === undefined || value === "" || (Array.isArray(value) && value.length === 0);
          });
          if (missingRequired) {
            setError(t("requiredFieldMissingError", { field: missingRequired.label }));
            return;
          }
          try {
            await publicApi.submitAdmission(token, {
              applicant_name: form.applicant_name,
              guardian_contact: form.guardian_contact,
              date_of_birth: form.date_of_birth || undefined,
              extra_data: extra,
              website: form.website,
            });
            setSubmitted(true);
          } catch (err: any) {
            setError(err.response?.data?.detail ?? t("failedSubmitApplication"));
          }
        }}>
          <label>{t("applicantNameLabel")}<Input required value={form.applicant_name} onChange={(event) => setForm({ ...form, applicant_name: event.target.value })} /></label>
          <label>{t("guardianContactLabel")}<Input value={form.guardian_contact} onChange={(event) => setForm({ ...form, guardian_contact: event.target.value })} /></label>
          <label>{t("dobLabel")}<Input type="date" value={form.date_of_birth} onChange={(event) => setForm({ ...form, date_of_birth: event.target.value })} /></label>
          {definition.fields_definition.map((field) => {
            if (field.type === "label") return <p key={field.key}>{field.label}</p>;
            if (field.type === "textarea") return <label key={field.key}>{field.label}<textarea required={field.required} value={String(extra[field.key] ?? "")} onChange={(event) => setExtra({ ...extra, [field.key]: event.target.value })} /></label>;
            if (field.type === "dropdown") return <label key={field.key}>{field.label}<Select required={field.required} value={String(extra[field.key] ?? "")} onChange={(event) => setExtra({ ...extra, [field.key]: event.target.value })}><option value="">{t("selectEllipsis")}</option>{field.options.map((option) => <option key={option} value={option}>{option}</option>)}</Select></label>;
            if (field.type === "radio") return <fieldset key={field.key}><legend>{field.label}</legend>{field.options.map((option) => <label className="checkboxLabel" key={option}><Radio  name={field.key} required={field.required} checked={extra[field.key] === option} onChange={() => setExtra({ ...extra, [field.key]: option })} />{option}</label>)}</fieldset>;
            if (field.type === "checkbox_group") return <fieldset key={field.key}><legend>{field.label}</legend>{field.options.map((option) => {
              const selected = Array.isArray(extra[field.key]) ? extra[field.key] as string[] : [];
              return <label className="checkboxLabel" key={option}><Checkbox  checked={selected.includes(option)} onChange={() => setExtra({ ...extra, [field.key]: selected.includes(option) ? selected.filter((item) => item !== option) : [...selected, option] })} />{option}</label>;
            })}</fieldset>;
            return <label key={field.key}>{field.label}<Input required={field.required} value={String(extra[field.key] ?? "")} onChange={(event) => setExtra({ ...extra, [field.key]: event.target.value })} /></label>;
          })}
          <label className="visuallyHidden">{t("websiteLabel")}<Input tabIndex={-1} autoComplete="off" value={form.website} onChange={(event) => setForm({ ...form, website: event.target.value })} /></label>
          {error && <p className="notice notice-warning">{error}</p>}
          <Button className="primaryAction" type="submit">{t("submitApplicationBtn")}</Button>
        </form>}
      </section>
    </main>
  );
}
