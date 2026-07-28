import { useTranslation } from "react-i18next";

import { BUILT_IN_ADMISSION_KEYS, enabledAdmissionFields } from "../lib/admissionBuiltIns";
import type { FormFieldDefinition } from "../lib/endpoints";
import { Button } from "./ui/Button";
import { Checkbox, Input, Radio, Select, Textarea } from "./ui/Field";
import { PhoneInput } from "./ui/PhoneInput";

type AdmissionAnswers = Record<string, unknown>;

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
        if (field.type === "label") return <p className="formSectionLabel" key={field.key}>{field.label}</p>;
        if (field.key === BUILT_IN_ADMISSION_KEYS.studentDateOfBirth) {
          return (
            <label key={`${keyPrefix}-${field.key}`}>
              {field.label}
              <Input
                required={field.required}
                type="date"
                value={String(value ?? "")}
                onChange={(event) => onValueChange(event.target.value)}
              />
            </label>
          );
        }
        if (field.type === "textarea") {
          return (
            <label key={`${keyPrefix}-${field.key}`}>
              {field.label}
              <Textarea required={field.required} value={String(value ?? "")} onChange={(event) => onValueChange(event.target.value)} />
            </label>
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
            <label key={`${keyPrefix}-${field.key}`}>
              {field.label}
              <Select required={field.required} value={String(value ?? "")} onChange={(event) => onValueChange(event.target.value)}>
                <option value="">{t("selectEllipsis")}</option>
                {field.options.map((option) => <option key={option} value={option}>{option}</option>)}
              </Select>
            </label>
          );
        }
        if (field.type === "radio") {
          return (
            <fieldset className="choiceField" key={`${keyPrefix}-${field.key}`}>
              <legend>{field.label}</legend>
              {field.options.map((option) => (
                <label className="checkboxLabel" key={option}>
                  <Radio
                    name={`${idPrefix}-${keyPrefix}-${field.key}`}
                    required={field.required}
                    value={option}
                    checked={value === option}
                    onChange={() => onValueChange(option)}
                  />
                  {option}
                </label>
              ))}
            </fieldset>
          );
        }
        if (field.type === "checkbox_group") {
          const chosen = Array.isArray(value) ? value as string[] : [];
          return (
            <fieldset className="choiceField" key={`${keyPrefix}-${field.key}`}>
              <legend>{field.label}</legend>
              {field.options.map((option) => (
                <label className="checkboxLabel" key={option}>
                  <Checkbox
                    checked={chosen.includes(option)}
                    onChange={(event) => onValueChange(event.target.checked ? [...chosen, option] : chosen.filter((item) => item !== option))}
                  />
                  {option}
                </label>
              ))}
            </fieldset>
          );
        }
        return (
          <label key={`${keyPrefix}-${field.key}`}>
            {field.label}
            <Input required={field.required} value={String(value ?? "")} onChange={(event) => onValueChange(event.target.value)} />
          </label>
        );
  };

  return (
    <>
      {visibleFields.map((field) => renderField(field, answers[field.key], (value) => updateAnswer(field.key, value), "primary"))}
      {!hideGuardianFields && allowAdditionalGuardians && guardianFields.length > 0 && (
        <section className="choiceField">
          <div className="formFieldsHeader">
            <div>
              <h4>{t("additionalGuardiansHeading", "Additional guardians")}</h4>
              <p>{t("additionalGuardiansHint", "Use this when the applicant has more than one guardian to create and link.")}</p>
            </div>
            <Button className="secondaryAction" type="button" onClick={() => onChange({ ...answers, guardians: [...additionalGuardians, {}] })}>
              + {t("addGuardianBtn")}
            </Button>
          </div>
          {additionalGuardians.map((guardian, index) => (
            <fieldset className="choiceField" key={index}>
              <legend>{t("guardianNumberLabel", "Guardian {{number}}", { number: index + 2 })}</legend>
              {guardianFields.map((field) => renderField(field, guardian[field.key], (value) => updateGuardian(index, field.key, value), `guardian-${index}`))}
              <Button className="secondaryAction danger" type="button" onClick={() => onChange({ ...answers, guardians: additionalGuardians.filter((_, itemIndex) => itemIndex !== index) })}>
                {t("removeGuardianBtn", "Remove guardian")}
              </Button>
            </fieldset>
          ))}
        </section>
      )}
    </>
  );
}
