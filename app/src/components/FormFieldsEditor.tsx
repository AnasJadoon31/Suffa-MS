import { Button } from "./ui/Button";
import { Paper } from "./ui/Mui";
import { styled } from "@mui/material/styles";
import { Box } from "./ui/Mui";
import { Typography } from "./ui/Mui";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";

import type { FormFieldDefinition } from "../lib/endpoints";
import { Input, Select, CheckboxField } from "./ui/Field";

const FIELD_TYPES = ["text", "textarea", "phone", "radio", "checkbox_group", "dropdown", "label"];
const OPTION_FIELD_TYPES = new Set(["radio", "checkbox_group", "dropdown"]);
type EditableFieldType = FormFieldDefinition["type"];

const EditorWrapper = styled(Paper)({
  padding: 16,
});

const FormFieldsHeader = styled("div")({
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  marginBottom: 16,
});

const FormFieldsList = styled("div")({
  display: "flex",
  flexDirection: "column",
  gap: 12,
});

const FormFieldCard = styled(Paper)({
  padding: 16,
  display: "flex",
  flexDirection: "column",
  gap: 8,
  position: "relative",
});

const FieldLabel = styled("label")({
  display: "flex",
  flexDirection: "column",
  gap: 4,
  fontSize: "0.875rem",
});

const FormFieldOptions = styled("fieldset")({
  border: "none",
  padding: 0,
  margin: 0,
});

const FormFieldOptionRow = styled("div")({
  display: "flex",
  gap: 4,
  alignItems: "center",
  marginBottom: 4,
});

const Legend = styled("legend")({
  fontSize: "0.875rem",
  fontWeight: 500,
  marginBottom: 8,
});

const EmptyState = styled(Typography)({
  textAlign: "center",
  padding: 16,
});

export const emptyFormField = (): FormFieldDefinition => ({
  key: "",
  label: "",
  type: "text",
  required: true,
  options: [],
});

export function cleanFormFields(fields: FormFieldDefinition[]): FormFieldDefinition[] {
  return fields
    .filter((field) => field.built_in || field.label.trim())
    .map((field) => ({
      ...field,
      label: field.label.trim(),
      // The label is the stable response key. Users should never have to
      // invent or maintain a second, technical field_key value.
      key: field.built_in ? field.key : field.label.trim(),
      enabled: field.built_in ? field.enabled !== false : true,
      options: OPTION_FIELD_TYPES.has(field.type) ? field.options : [],
    }));
}

export function validateFormFields(fields: FormFieldDefinition[]): "duplicateFieldKeysError" | "fieldOptionsRequiredError" | "duplicateFieldOptionsError" | null {
  const cleaned = cleanFormFields(fields).filter((field) => field.enabled !== false);
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
    <EditorWrapper variant="outlined" aria-label={t("formFieldsHeading")}>
      <FormFieldsHeader>
        <div>
          <Typography variant="h6" component="h4">{t("formFieldsHeading")}</Typography>
          <Typography variant="body2" color="text.secondary">{t("formFieldsHint")}</Typography>
        </div>
        <Button type="button" onClick={() => onChange([...fields, emptyFormField()])}>
          <Plus size={16} /> {t("addFieldBtn")}
        </Button>
      </FormFieldsHeader>

      {fields.length === 0 && <EmptyState variant="body2" color="text.secondary">{t("noCustomFieldsYet")}</EmptyState>}
      <FormFieldsList>
        {fields.map((field, index) => (
          <FormFieldCard key={index} variant="outlined">
            <span>{index + 1}</span>
            {field.built_in && <span>{t("builtInFieldLabel", "Built-in")}</span>}
            <FieldLabel>
              {t("fieldLabelLabel")}
              <Input required value={field.label} disabled={field.built_in} onChange={(event) => updateField(index, { label: event.target.value })} />
            </FieldLabel>
            <FieldLabel>
              {t("fieldTypeLabel")}
              <Select disabled={field.built_in} value={field.type} onChange={(event) => {
                const type = event.target.value as EditableFieldType;
                updateField(index, { type, options: OPTION_FIELD_TYPES.has(type) && field.options.length === 0 ? ["", ""] : field.options });
              }}>
                {FIELD_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
              </Select>
            </FieldLabel>
            {OPTION_FIELD_TYPES.has(field.type) && (
              <FormFieldOptions>
                <Legend>{t("fieldOptionsLabel")}</Legend>
                {field.options.map((option, optionIndex) => (
                  <FormFieldOptionRow key={optionIndex}>
                    <Input
                      required
                      aria-label={t("optionNumberLabel", { number: optionIndex + 1 })}
                      value={option}
                      onChange={(event) => updateField(index, {
                        options: field.options.map((item, itemIndex) => itemIndex === optionIndex ? event.target.value : item),
                      })}
                    />
                    <Button type="button" disabled={optionIndex === 0} aria-label={t("moveOptionUp")}
                      onClick={() => {
                        const options = [...field.options];
                        [options[optionIndex - 1], options[optionIndex]] = [options[optionIndex], options[optionIndex - 1]];
                        updateField(index, { options });
                      }}><ArrowUp size={14} /></Button>
                    <Button type="button" disabled={optionIndex === field.options.length - 1} aria-label={t("moveOptionDown")}
                      onClick={() => {
                        const options = [...field.options];
                        [options[optionIndex], options[optionIndex + 1]] = [options[optionIndex + 1], options[optionIndex]];
                        updateField(index, { options });
                      }}><ArrowDown size={14} /></Button>
                    <Button type="button" aria-label={t("removeOption")}
                      onClick={() => updateField(index, { options: field.options.filter((_, itemIndex) => itemIndex !== optionIndex) })}>
                      <Trash2 size={14} />
                    </Button>
                  </FormFieldOptionRow>
                ))}
                <Button type="button" onClick={() => updateField(index, { options: [...field.options, ""] })}>
                  <Plus size={14} /> {t("addOption")}
                </Button>
              </FormFieldOptions>
            )}
            <CheckboxField
              checked={field.required}
              onChange={(event) => updateField(index, { required: event.target.checked })}
              label={t("requiredLabel")}
            />
            {field.built_in && (
              <CheckboxField
                checked={field.enabled !== false}
                onChange={(event) => updateField(index, { enabled: event.target.checked })}
                label={t("enabledLabel")}
              />
            )}
            <Button
              type="button"
              aria-label={t("removeFieldBtn")}
              disabled={field.built_in}
              onClick={() => onChange(fields.filter((_, fieldIndex) => fieldIndex !== index))}
            >
              <Trash2 size={15} />
            </Button>
          </FormFieldCard>
        ))}
      </FormFieldsList>
    </EditorWrapper>
  );
}
