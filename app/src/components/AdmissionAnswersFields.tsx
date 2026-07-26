import { useTranslation } from "react-i18next";

import { BUILT_IN_ADMISSION_KEYS, enabledAdmissionFields } from "../lib/admissionBuiltIns";
import type { FormFieldDefinition } from "../lib/endpoints";
import { Checkbox, Input, Select, Textarea } from "./ui/Field";
import { PhoneInput } from "./ui/PhoneInput";

type AdmissionAnswers = Record<string, unknown>;

export function AdmissionAnswersFields({
  fields,
  answers,
  onChange,
  idPrefix,
}: Readonly<{
  fields: FormFieldDefinition[];
  answers: AdmissionAnswers;
  onChange: (answers: AdmissionAnswers) => void;
  idPrefix: string;
}>) {
  const { t } = useTranslation();

  const updateAnswer = (key: string, value: unknown) => {
    onChange({ ...answers, [key]: value });
  };

  return (
    <>
      {enabledAdmissionFields(fields).map((field) => {
        if (field.type === "label") return <p className="formSectionLabel" key={field.key}>{field.label}</p>;
        if (field.key === BUILT_IN_ADMISSION_KEYS.studentDateOfBirth) {
          return (
            <label key={field.key}>
              {field.label}
              <Input
                required={field.required}
                type="date"
                value={String(answers[field.key] ?? "")}
                onChange={(event) => updateAnswer(field.key, event.target.value)}
              />
            </label>
          );
        }
        if (field.type === "textarea") {
          return (
            <label key={field.key}>
              {field.label}
              <Textarea required={field.required} value={String(answers[field.key] ?? "")} onChange={(event) => updateAnswer(field.key, event.target.value)} />
            </label>
          );
        }
        if (field.type === "phone") {
          return (
            <PhoneInput
              key={field.key}
              id={`${idPrefix}-${field.key}`}
              label={field.label}
              required={field.required}
              value={String(answers[field.key] ?? "")}
              onChange={(value) => updateAnswer(field.key, value)}
            />
          );
        }
        if (field.type === "dropdown") {
          return (
            <label key={field.key}>
              {field.label}
              <Select required={field.required} value={String(answers[field.key] ?? "")} onChange={(event) => updateAnswer(field.key, event.target.value)}>
                <option value="">{t("selectEllipsis")}</option>
                {field.options.map((option) => <option key={option} value={option}>{option}</option>)}
              </Select>
            </label>
          );
        }
        if (field.type === "radio") {
          return (
            <fieldset className="choiceField" key={field.key}>
              <legend>{field.label}</legend>
              {field.options.map((option) => (
                <label className="checkboxLabel" key={option}>
                  <Input
                    type="radio"
                    name={`${idPrefix}-${field.key}`}
                    required={field.required}
                    checked={answers[field.key] === option}
                    onChange={() => updateAnswer(field.key, option)}
                  />
                  {option}
                </label>
              ))}
            </fieldset>
          );
        }
        if (field.type === "checkbox_group") {
          const chosen = Array.isArray(answers[field.key]) ? answers[field.key] as string[] : [];
          return (
            <fieldset className="choiceField" key={field.key}>
              <legend>{field.label}</legend>
              {field.options.map((option) => (
                <label className="checkboxLabel" key={option}>
                  <Checkbox
                    checked={chosen.includes(option)}
                    onChange={(event) => updateAnswer(field.key, event.target.checked ? [...chosen, option] : chosen.filter((item) => item !== option))}
                  />
                  {option}
                </label>
              ))}
            </fieldset>
          );
        }
        return (
          <label key={field.key}>
            {field.label}
            <Input required={field.required} value={String(answers[field.key] ?? "")} onChange={(event) => updateAnswer(field.key, event.target.value)} />
          </label>
        );
      })}
    </>
  );
}
