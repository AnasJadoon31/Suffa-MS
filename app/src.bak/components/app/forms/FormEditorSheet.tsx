import { useEffect, useState } from "react";
import { toast } from "sonner";

import {
  FormFieldsEditor,
  cleanFormFields,
  emptyFormField,
  validateFormFields,
} from "./FormFieldsEditor";
import { FormSheet } from "@/components/app/FormSheet";
import { Field, CustomDropdown, TextArea, TextInput } from "@/components/app/Primitives";
import { formsApi, type FormDef, type FormFieldDefinition } from "@/lib/mms/more-endpoints";

export function FormEditorSheet({
  form,
  open,
  onOpenChange,
  onSaved,
}: {
  form?: FormDef | null;
  open: boolean;
  onOpenChange: (next: boolean) => void;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [audience, setAudience] = useState("all");
  const [openFrom, setOpenFrom] = useState("");
  const [openUntil, setOpenUntil] = useState("");
  const [allowMultiple, setAllowMultiple] = useState(false);
  const [fields, setFields] = useState<FormFieldDefinition[]>([emptyFormField()]);

  useEffect(() => {
    if (!open) return;
    setTitle(form?.title ?? "");
    setDescription(form?.description ?? "");
    setCategory(form?.category ?? "");
    setAllowMultiple(form?.allow_multiple ?? false);
    setOpenFrom(form?.open_from ? form.open_from.slice(0, 16) : "");
    setOpenUntil(form?.open_until ? form.open_until.slice(0, 16) : "");
    const scope = form?.visibility_scope;
    setAudience(!scope || scope.all ? "all" : (scope.roles?.[0] ?? "all"));
    setFields(form?.fields_definition?.length ? form.fields_definition : [emptyFormField()]);
  }, [open, form]);

  async function handleSubmit() {
    const fieldError = validateFormFields(fields);
    if (fieldError) {
      toast.error(fieldError);
      throw new Error(fieldError);
    }
    const cleaned = cleanFormFields(fields);
    const payload = {
      title: title.trim(),
      description: description.trim() || undefined,
      category: category.trim() || undefined,
      fields: cleaned,
      visibility_scope: audience === "all" ? { all: true } : { all: false, roles: [audience] },
      open_from: openFrom ? new Date(openFrom).toISOString() : undefined,
      open_until: openUntil ? new Date(openUntil).toISOString() : undefined,
      allow_multiple: allowMultiple,
    };
    if (form) {
      await formsApi.updateForm(form.id, payload);
      toast.success("Form updated");
    } else {
      await formsApi.createForm(payload);
      toast.success("Form created");
    }
    onSaved();
  }

  return (
    <FormSheet
      title={form ? "Edit form" : "New form"}
      submitLabel={form ? "Save changes" : "Create form"}
      open={open}
      onOpenChange={onOpenChange}
      onSubmit={handleSubmit}
    >
      <Field label="Title">
        <TextInput required value={title} onChange={(e) => setTitle(e.target.value)} />
      </Field>
      <Field label="Description">
        <TextArea value={description} onChange={(e) => setDescription(e.target.value)} />
      </Field>
      <Field label="Category">
        <TextInput
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          placeholder="e.g. Trip permission"
        />
      </Field>
      <Field label="Visible to">
        <CustomDropdown value={audience} onChange={(e) => setAudience(e.target.value)}>
          <option value="all">Everyone</option>
          <option value="teacher">Teachers</option>
          <option value="student">Students</option>
          <option value="parent">Guardians</option>
        </CustomDropdown>
      </Field>
      <div className="grid grid-cols-2 gap-2.5">
        <Field label="Opens">
          <TextInput
            type="datetime-local"
            value={openFrom}
            onChange={(e) => setOpenFrom(e.target.value)}
          />
        </Field>
        <Field label="Closes">
          <TextInput
            type="datetime-local"
            value={openUntil}
            onChange={(e) => setOpenUntil(e.target.value)}
          />
        </Field>
      </div>
      <label className="flex items-center gap-2 text-sm font-semibold">
        <input
          type="checkbox"
          checked={allowMultiple}
          onChange={(e) => setAllowMultiple(e.target.checked)}
          className="h-4 w-4 rounded border-border accent-primary"
        />
        Allow multiple submissions per person
      </label>

      <FormFieldsEditor fields={fields} onChange={setFields} />
    </FormSheet>
  );
}
