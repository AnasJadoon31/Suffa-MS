import { useTranslation } from "react-i18next";
import { styled } from "@mui/material/styles";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";

import { BUILT_IN_ADMISSION_KEYS, enabledAdmissionFields } from "../lib/admissionBuiltIns";
import type { FormFieldDefinition } from "../lib/endpoints";
import { Button } from "./ui/Button";
import { CheckboxField, Input, RadioField, Select, Textarea } from "./ui/Field";
import { PhoneInput } from "./ui/PhoneInput";

type AdmissionAnswers = Record<string, unknown>;

const ChoiceField = styled("fieldset")({
  border: "none",
  padding: 0,
  margin: 0,
  marginBottom: 16,
});

const FieldLabel = styled("label")({
  display: "flex",
  flexDirection: "column",
  gap: 4,
  fontSize: "0.875rem",
  marginBottom: 12,
});

const Legend = styled("legend")({
  fontSize: "0.875rem",
  fontWeight: 500,
  marginBottom: 8,
});

const SectionLabel = styled("p")(({ theme }) => ({
  fontSize: "1rem",
  fontWeight: 600,
  color: theme.palette.text.primary,
  margin: "16px 0 8px",
}));

const GuardianSection = styled("section")({
  marginTop: 24,
});

const FormFieldsHeader = styled("div")({
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  marginBottom: 16,
});

const FieldHint = styled("p")({
  margin: 0,
  fontSize: "0.875rem",
});

export function AdmissionAnswersFields({
  fields,
  answers,
  onChange,
  idPrefix,
  hideGuardianFields = false,
  allowAdditionalGuardians = true,
}: Readonly<{
  fields: FormFieldDefinition[];
  answers: AdmissionAnswers;
  onChange: (answers: AdmissionAnswers) => void;
  idPrefix: string;
  hideGuardianFields?: boolean;
  allowAdditionalGuardians?: boolean;
}>) {
  const { t } = useTranslation();
  const visibleFields = enabledAdmissionFields(fields).filter((field) => !hideGuardianFields || !field.key.startsWith("guardian_"));
  const guardianFields = enabledAdmissionFields(fields).filter((field) => field.key.startsWith("guardian_"));
  const additionalGuardians = Array.isArray(answers.guardians) ? answers.guardians as Record<string, unknown>[] : [];

  const updateAnswer = (key: string, value: unknown) => {
    onChange({ ...answers, [key]: value });
  };
  const updateGuardian = (index: number, key: string, value: unknown) => {
    onChange({
      ...answers,
      guardians: additionalGuardians.map((guardian, guardianIndex) => (
        guardianIndex === index ? { ...guardian, [key]: value } : guardian
      )),
    });
  };

  const renderField = (
    field: FormFieldDefinition,
    value: unknown,
    onValueChange: (value: unknown) => void,
    keyPrefix: string,
  ) => {
        if (field.type === "label") return <SectionLabel key={field.key}>{field.label}</SectionLabel>;
        if (field.key === BUILT_IN_ADMISSION_KEYS.studentDateOfBirth) {
          return (
            <FieldLabel key={`${keyPrefix}-${field.key}`}>
              {field.label}
              <Input
                required={field.required}
                type="date"
                value={String(value ?? "")}
                onChange={(event) => onValueChange(event.target.value)}
              />
            </FieldLabel>
          );
        }
        if (field.type === "textarea") {
          return (
            <FieldLabel key={`${keyPrefix}-${field.key}`}>
              {field.label}
              <Textarea required={field.required} value={String(value ?? "")} onChange={(event) => onValueChange(event.target.value)} />
            </FieldLabel>
          );
        }
        if (field.type === "phone") {
          return (
            <PhoneInput
              key={`${keyPrefix}-${field.key}`}
              id={`${idPrefix}-${keyPrefix}-${field.key}`}
              label={field.label}
              required={field.required}
              value={String(value ?? "")}
              onChange={onValueChange}
            />
          );
        }
        if (field.type === "dropdown") {
          return (
            <FieldLabel key={`${keyPrefix}-${field.key}`}>
              {field.label}
              <Select required={field.required} value={String(value ?? "")} onChange={(event) => onValueChange(event.target.value)}>
                <option value="">{t("selectEllipsis")}</option>
                {field.options.map((option) => <option key={option} value={option}>{option}</option>)}
              </Select>
            </FieldLabel>
          );
        }
        if (field.type === "radio") {
          return (
            <ChoiceField key={`${keyPrefix}-${field.key}`}>
              <Legend>{field.label}</Legend>
              {field.options.map((option) => (
                <RadioField
                  key={option}
                  name={`${idPrefix}-${keyPrefix}-${field.key}`}
                  required={field.required}
                  value={option}
                  checked={value === option}
                  onChange={() => onValueChange(option)}
                  label={option}
                />
              ))}
            </ChoiceField>
          );
        }
        if (field.type === "checkbox_group") {
          const chosen = Array.isArray(value) ? value as string[] : [];
          return (
            <ChoiceField key={`${keyPrefix}-${field.key}`}>
              <Legend>{field.label}</Legend>
              {field.options.map((option) => (
                <CheckboxField
                  key={option}
                  checked={chosen.includes(option)}
                  onChange={(event) => onValueChange(event.target.checked ? [...chosen, option] : chosen.filter((item) => item !== option))}
                  label={option}
                />
              ))}
            </ChoiceField>
          );
        }
        return (
          <FieldLabel key={`${keyPrefix}-${field.key}`}>
            {field.label}
            <Input required={field.required} value={String(value ?? "")} onChange={(event) => onValueChange(event.target.value)} />
          </FieldLabel>
        );
  };

  return (
    <>
      {visibleFields.map((field) => renderField(field, answers[field.key], (value) => updateAnswer(field.key, value), "primary"))}
      {!hideGuardianFields && allowAdditionalGuardians && guardianFields.length > 0 && (
        <GuardianSection>
          <FormFieldsHeader>
            <div>
              <Typography variant="h6" component="h4">{t("additionalGuardiansHeading", "Additional guardians")}</Typography>
              <FieldHint>{t("additionalGuardiansHint", "Use this when the applicant has more than one guardian to create and link.")}</FieldHint>
            </div>
            <Button type="button" onClick={() => onChange({ ...answers, guardians: [...additionalGuardians, {}] })}>
              + {t("addGuardianBtn")}
            </Button>
          </FormFieldsHeader>
          {additionalGuardians.map((guardian, index) => (
            <ChoiceField key={index}>
              <Legend>{t("guardianNumberLabel", "Guardian {{number}}", { number: index + 2 })}</Legend>
              {guardianFields.map((field) => renderField(field, guardian[field.key], (value) => updateGuardian(index, field.key, value), `guardian-${index}`))}
              <Button type="button" onClick={() => onChange({ ...answers, guardians: additionalGuardians.filter((_, itemIndex) => itemIndex !== index) })}>
                {t("removeGuardianBtn", "Remove guardian")}
              </Button>
            </ChoiceField>
          ))}
        </GuardianSection>
      )}
    </>
  );
}
