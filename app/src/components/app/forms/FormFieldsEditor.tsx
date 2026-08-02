import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";

import { Field, SelectInput, TextInput } from "@/components/app/Primitives";
import type { FormFieldDefinition } from "@/lib/mms/more-endpoints";

const FIELD_TYPES: FormFieldDefinition["type"][] = [
  "label",
  "text",
  "textarea",
  "radio",
  "checkbox_group",
  "dropdown",
  "phone",
];
const OPTION_TYPES = new Set(["radio", "checkbox_group", "dropdown"]);

export function emptyFormField(): FormFieldDefinition {
  return { key: "", label: "", type: "text", required: true, options: [] };
}

export function cleanFormFields(fields: FormFieldDefinition[]): FormFieldDefinition[] {
  return fields
    .filter((f) => f.label.trim())
    .map((f) => ({
      ...f,
      label: f.label.trim(),
      key: f.label.trim(),
      options: OPTION_TYPES.has(f.type) ? f.options.map((o) => o.trim()).filter(Boolean) : [],
    }));
}

export function validateFormFields(fields: FormFieldDefinition[]): string | null {
  const cleaned = cleanFormFields(fields);
  if (cleaned.length === 0) return "Add at least one field";
  const keys = cleaned.map((f) => f.key.toLowerCase());
  if (new Set(keys).size !== keys.length) return "Field labels must be unique";
  if (cleaned.some((f) => OPTION_TYPES.has(f.type) && f.options.length < 2)) {
    return "Choice fields need at least two options";
  }
  return null;
}

export function FormFieldsEditor({
  fields,
  onChange,
}: {
  fields: FormFieldDefinition[];
  onChange: (fields: FormFieldDefinition[]) => void;
}) {
  const update = (index: number, patch: Partial<FormFieldDefinition>) => {
    onChange(fields.map((f, i) => (i === index ? { ...f, ...patch } : f)));
  };
  const move = (index: number, dir: -1 | 1) => {
    const next = [...fields];
    const target = index + dir;
    if (target < 0 || target >= next.length) return;
    const a = next[index]!;
    const b = next[target]!;
    next[index] = b;
    next[target] = a;
    onChange(next);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-[0.68rem] font-extrabold uppercase tracking-[0.14em] text-muted-foreground">
          Fields
        </span>
        <button
          type="button"
          onClick={() => onChange([...fields, emptyFormField()])}
          className="inline-flex items-center gap-1 rounded-xl bg-primary-soft px-2.5 py-1.5 text-xs font-bold text-primary"
        >
          <Plus className="h-3.5 w-3.5" /> Add field
        </button>
      </div>

      {fields.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
          No fields yet.
        </p>
      ) : null}

      {fields.map((field, index) => (
        <div key={index} className="space-y-2.5 rounded-2xl border border-border bg-card p-3.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-bold text-muted-foreground">Field {index + 1}</span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                disabled={index === 0}
                aria-label="Move up"
                onClick={() => move(index, -1)}
                className="rounded-lg bg-muted p-1.5 disabled:opacity-30"
              >
                <ArrowUp className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                disabled={index === fields.length - 1}
                aria-label="Move down"
                onClick={() => move(index, 1)}
                className="rounded-lg bg-muted p-1.5 disabled:opacity-30"
              >
                <ArrowDown className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                aria-label="Remove field"
                onClick={() => onChange(fields.filter((_, i) => i !== index))}
                className="rounded-lg bg-destructive/10 p-1.5 text-destructive"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          <Field label="Label">
            <TextInput
              required
              value={field.label}
              onChange={(e) => update(index, { label: e.target.value })}
            />
          </Field>

          <Field label="Type">
            <SelectInput
              value={field.type}
              onChange={(e) => {
                const type = e.target.value as FormFieldDefinition["type"];
                update(index, {
                  type,
                  options:
                    OPTION_TYPES.has(type) && field.options.length === 0 ? ["", ""] : field.options,
                });
              }}
            >
              {FIELD_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type.replace("_", " ")}
                </option>
              ))}
            </SelectInput>
          </Field>

          {OPTION_TYPES.has(field.type) ? (
            <div className="space-y-1.5">
              <span className="text-[0.68rem] font-extrabold uppercase tracking-[0.14em] text-muted-foreground">
                Options
              </span>
              {field.options.map((option, optionIndex) => (
                <div key={optionIndex} className="flex items-center gap-1.5">
                  <TextInput
                    required
                    value={option}
                    onChange={(e) =>
                      update(index, {
                        options: field.options.map((o, i) =>
                          i === optionIndex ? e.target.value : o,
                        ),
                      })
                    }
                  />
                  <button
                    type="button"
                    aria-label="Remove option"
                    onClick={() =>
                      update(index, { options: field.options.filter((_, i) => i !== optionIndex) })
                    }
                    className="shrink-0 rounded-lg bg-destructive/10 p-2 text-destructive"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => update(index, { options: [...field.options, ""] })}
                className="text-xs font-bold text-primary"
              >
                + Add option
              </button>
            </div>
          ) : null}

          <label className="flex items-center gap-2 text-sm font-semibold">
            <input
              type="checkbox"
              checked={field.required}
              onChange={(e) => update(index, { required: e.target.checked })}
              className="h-4 w-4 rounded border-border accent-primary"
            />
            Required
          </label>
        </div>
      ))}
    </div>
  );
}
