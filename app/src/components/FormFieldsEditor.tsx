import { Button } from "./ui/Button";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";

import type { FormFieldDefinition } from "../lib/endpoints";
import { Input, Select, Checkbox } from "./ui/Field";

const FIELD_TYPES = ["text", "textarea", "radio", "checkbox_group", "dropdown", "label"];
const OPTION_FIELD_TYPES = new Set(["radio", "checkbox_group", "dropdown"]);

export const emptyFormField = (): FormFieldDefinition => ({
  key: "",
  label: "",
  type: "text",
  required: true,
  options: [],
});

export function cleanFormFields(fields: FormFieldDefinition[]): FormFieldDefinition[] {
  return fields
    .filter((field) => field.label.trim())
    .map((field) => ({
      ...field,
      label: field.label.trim(),
      // The label is the stable response key. Users should never have to
      // invent or maintain a second, technical field_key value.
      key: field.label.trim(),
      options: OPTION_FIELD_TYPES.has(field.type) ? field.options : [],
    }));
}

export function validateFormFields(fields: FormFieldDefinition[]): "duplicateFieldKeysError" | "fieldOptionsRequiredError" | "duplicateFieldOptionsError" | null {
  const cleaned = cleanFormFields(fields);
  const normalizedKeys = cleaned.map((field) => field.key.toLocaleLowerCase());
  if (new Set(normalizedKeys).size !== normalizedKeys.length) return "duplicateFieldKeysError";
  if (cleaned.some((field) => OPTION_FIELD_TYPES.has(field.type) && field.options.filter((option) => option.trim()).length < 2)) {
    return "fieldOptionsRequiredError";
  }
  if (cleaned.some((field) => {
    const normalized = field.options.map((option) => option.trim().toLocaleLowerCase()).filter(Boolean);
    return OPTION_FIELD_TYPES.has(field.type) && new Set(normalized).size !== normalized.length;
  })) return "duplicateFieldOptionsError";
  return null;
}

export function FormFieldsEditor({
  fields,
  onChange,
}: Readonly<{
  fields: FormFieldDefinition[];
  onChange: (fields: FormFieldDefinition[]) => void;
}>) {
  const { t } = useTranslation();
  const updateField = (index: number, patch: Partial<FormFieldDefinition>) => {
    onChange(fields.map((field, fieldIndex) => (
      fieldIndex === index ? { ...field, ...patch } : field
    )));
  };

  return (
    <section className="formFieldsEditor" aria-label={t("formFieldsHeading")}>
      <div className="formFieldsHeader">
        <div>
          <h4>{t("formFieldsHeading")}</h4>
          <p>{t("formFieldsHint")}</p>
        </div>
        <Button className="secondaryAction" type="button" onClick={() => onChange([...fields, emptyFormField()])}>
          <Plus size={16} /> {t("addFieldBtn")}
        </Button>
      </div>

      {fields.length === 0 && <p className="emptyState compactEmptyState">{t("noCustomFieldsYet")}</p>}
      <div className="formFieldsList">
        {fields.map((field, index) => (
          <div key={index} className="formFieldCard">
            <span className="formFieldNumber">{index + 1}</span>
            <label>
              {t("fieldLabelLabel")}
              <Input required value={field.label} onChange={(event) => updateField(index, { label: event.target.value })} />
            </label>
            <label>
              {t("fieldTypeLabel")}
              <Select value={field.type} onChange={(event) => {
                const type = event.target.value;
                updateField(index, { type, options: OPTION_FIELD_TYPES.has(type) && field.options.length === 0 ? ["", ""] : field.options });
              }}>
                {FIELD_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
              </Select>
            </label>
            {OPTION_FIELD_TYPES.has(field.type) && (
              <fieldset className="formFieldOptions">
                <legend>{t("fieldOptionsLabel")}</legend>
                {field.options.map((option, optionIndex) => (
                  <div className="formFieldOptionRow" key={optionIndex}>
                    <Input
                      required
                      aria-label={t("optionNumberLabel", { number: optionIndex + 1 })}
                      value={option}
                      onChange={(event) => updateField(index, {
                        options: field.options.map((item, itemIndex) => itemIndex === optionIndex ? event.target.value : item),
                      })}
                    />
                    <Button className="iconBtn" type="button" disabled={optionIndex === 0} aria-label={t("moveOptionUp")}
                      onClick={() => {
                        const options = [...field.options];
                        [options[optionIndex - 1], options[optionIndex]] = [options[optionIndex], options[optionIndex - 1]];
                        updateField(index, { options });
                      }}><ArrowUp size={14} /></Button>
                    <Button className="iconBtn" type="button" disabled={optionIndex === field.options.length - 1} aria-label={t("moveOptionDown")}
                      onClick={() => {
                        const options = [...field.options];
                        [options[optionIndex], options[optionIndex + 1]] = [options[optionIndex + 1], options[optionIndex]];
                        updateField(index, { options });
                      }}><ArrowDown size={14} /></Button>
                    <Button className="iconBtn danger" type="button" aria-label={t("removeOption")}
                      onClick={() => updateField(index, { options: field.options.filter((_, itemIndex) => itemIndex !== optionIndex) })}>
                      <Trash2 size={14} />
                    </Button>
                  </div>
                ))}
                <Button className="secondaryAction" type="button" onClick={() => updateField(index, { options: [...field.options, ""] })}>
                  <Plus size={14} /> {t("addOption")}
                </Button>
              </fieldset>
            )}
            <label className="checkboxLabel formFieldRequired">
              <Input type="checkbox" checked={field.required} onChange={(event) => updateField(index, { required: event.target.checked })} />
              {t("requiredLabel")}
            </label>
            <Button
              className="iconBtn danger formFieldRemove"
              type="button"
              aria-label={t("removeFieldBtn")}
              onClick={() => onChange(fields.filter((_, fieldIndex) => fieldIndex !== index))}
            >
              <Trash2 size={15} />
            </Button>
          </div>
        ))}
      </div>
    </section>
  );
}
