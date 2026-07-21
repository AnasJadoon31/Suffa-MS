import { Button } from "./ui/Button";
import { Plus, Trash2 } from "lucide-react";
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

export function validateFormFields(fields: FormFieldDefinition[]): "duplicateFieldKeysError" | "fieldOptionsRequiredError" | null {
  const cleaned = cleanFormFields(fields);
  const normalizedKeys = cleaned.map((field) => field.key.toLocaleLowerCase());
  if (new Set(normalizedKeys).size !== normalizedKeys.length) return "duplicateFieldKeysError";
  if (cleaned.some((field) => OPTION_FIELD_TYPES.has(field.type) && field.options.length === 0)) {
    return "fieldOptionsRequiredError";
  }
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
              <Select value={field.type} onChange={(event) => updateField(index, { type: event.target.value })}>
                {FIELD_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
              </Select>
            </label>
            {OPTION_FIELD_TYPES.has(field.type) && (
              <label>
                {t("fieldOptionsLabel")}
                <Input
                  required
                  value={field.options.join(", ")}
                  onChange={(event) => updateField(index, {
                    options: event.target.value.split(",").map((option) => option.trim()).filter(Boolean),
                  })}
                />
              </label>
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
