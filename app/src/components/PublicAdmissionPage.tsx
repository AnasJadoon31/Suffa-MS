import { Button } from "./ui/Button";
import Paper from "@mui/material/Paper";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Alert from "@mui/material/Alert";
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

  if (loading) return <Box component="main" sx={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "100vh", p: 2 }}><LoadingState /></Box>;
  if (error || !definition) return <Box component="main" sx={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "100vh", p: 2 }}><ErrorState message={error || t("failedLoadAdmissionForms")} /></Box>;
  if (submitted) return (
    <Box component="main" sx={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "100vh", p: 2 }}>
      <Paper component="section" variant="outlined" sx={{ border: 1, borderColor: "divider", borderRadius: 2, p: 4, maxWidth: 600, width: "100%" }}>
        <Typography variant="h4" sx={{ fontWeight: 700 }}>{t("applicationSubmitted")}</Typography>
      </Paper>
    </Box>
  );

  return (
    <Box component="main" sx={{ display: "flex", justifyContent: "center", alignItems: "flex-start", minHeight: "100vh", p: 2, bgcolor: "background.default" }}>
      <Paper component="section" variant="outlined" sx={{ border: 1, borderColor: "divider", borderRadius: 2, p: 4, maxWidth: 800, width: "100%", my: 4 }}>
        <Box component="header" sx={{ mb: 3 }}>
          <Typography component="span" sx={{ display: "block", color: "text.secondary", fontSize: "0.875rem", textTransform: "uppercase", letterSpacing: "0.08em" }}>
            {definition.program_name}
          </Typography>
          <Typography variant="h4" sx={{ fontWeight: 700 }}>{definition.title}</Typography>
          {definition.description && <Typography sx={{ color: "text.secondary", mt: 1 }}>{definition.description}</Typography>}
        </Box>
        {!definition.is_open && <Alert severity="warning" sx={{ mb: 2 }}>{t("closedLabel")}</Alert>}
        {definition.is_open && (
          <form onSubmit={async (event) => {
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
            <Box component="label" sx={{ display: "none" }}>
              {t("websiteLabel")}
              <Input tabIndex={-1} autoComplete="off" value={website} onChange={(event) => setWebsite(event.target.value)} />
            </Box>
            {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}
            <Button type="submit">{t("submitApplicationBtn")}</Button>
          </form>
        )}
      </Paper>
    </Box>
  );
}
