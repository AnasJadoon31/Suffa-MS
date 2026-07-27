import { Button } from "./ui/Button";
import Paper from "@mui/material/Paper";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useParams } from "react-router";

import { AdmissionAnswersFields } from "./AdmissionAnswersFields";
import { answerString, BUILT_IN_ADMISSION_KEYS, enabledAdmissionFields } from "../lib/admissionBuiltIns";
import { publicApi, type PublicAdmissionForm } from "../lib/endpoints";
import { ErrorState, LoadingState } from "./ui/AsyncState";
import { Input } from "./ui/Field";

export function PublicAdmissionPage() {
  const { token = "" } = useParams();
  const { t } = useTranslation();
  const [definition, setDefinition] = useState<PublicAdmissionForm | null>(null);
  const [website, setWebsite] = useState("");
  const [extra, setExtra] = useState<Record<string, unknown>>({});
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
  if (submitted) return <main className="publicFormPage"><Paper component="section" variant="outlined" className="publicFormCard"><h1>{t("applicationSubmitted")}</h1></Paper></main>;

  return (
    <main className="publicFormPage">
      <Paper component="section" variant="outlined" className="publicFormCard">
        <header className="moduleHeader">
          <span className="eyebrow">{definition.program_name}</span>
          <h1>{definition.title}</h1>
          {definition.description && <p className="notice">{definition.description}</p>}
        </header>
        {!definition.is_open && <p className="notice notice-warning">{t("closedLabel")}</p>}
        {definition.is_open && <form className="publicAdmissionForm" onSubmit={async (event) => {
          event.preventDefault();
          setError("");
          const fields = enabledAdmissionFields(definition.fields_definition);
          const missingRequired = fields.find((field) => {
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
              applicant_name: answerString(extra, BUILT_IN_ADMISSION_KEYS.studentName),
              guardian_contact: answerString(extra, BUILT_IN_ADMISSION_KEYS.guardianPhoneNumbers),
              date_of_birth: answerString(extra, BUILT_IN_ADMISSION_KEYS.studentDateOfBirth) || undefined,
              extra_data: extra,
              website,
            });
            setSubmitted(true);
          } catch (err: any) {
            setError(err.response?.data?.detail ?? t("failedSubmitApplication"));
          }
        }}>
          <AdmissionAnswersFields fields={definition.fields_definition} answers={extra} onChange={setExtra} idPrefix="public-admission" />
          <label className="visuallyHidden">{t("websiteLabel")}<Input tabIndex={-1} autoComplete="off" value={website} onChange={(event) => setWebsite(event.target.value)} /></label>
          {error && <p className="notice notice-warning">{error}</p>}
          <Button className="primaryAction" type="submit">{t("submitApplicationBtn")}</Button>
        </form>}
      </Paper>
    </main>
  );
}
