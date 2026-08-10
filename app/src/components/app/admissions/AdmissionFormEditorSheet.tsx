import { useEffect, useState } from "react";
import { toast } from "sonner";

import { FormSheet } from "@/components/app/FormSheet";
import { FormFieldsEditor, cleanFormFields, emptyFormField, validateFormFields } from "@/components/app/forms/FormFieldsEditor";
import { Field, TextArea, TextInput } from "@/components/app/Primitives";
import { opsApi, type AdmissionForm, type FormFieldDefinition } from "@/lib/mms/more-endpoints";

export function AdmissionFormEditorSheet({ form, open, onOpenChange, onSaved }: {
  form: AdmissionForm | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("General");
  const [description, setDescription] = useState("");
  const [fields, setFields] = useState<FormFieldDefinition[]>([emptyFormField()]);

  useEffect(() => {
    if (!open) return;
    setTitle(form?.title ?? "");
    setCategory(form?.category ?? "General");
    setDescription(form?.description ?? "");
    setFields((form?.fields_definition ?? []).filter((field) => !field.built_in));
  }, [form, open]);

  async function submit() {
    if (!title.trim()) throw new Error("Form title is required");
    const error = validateFormFields(fields);
    if (error && fields.length > 0) { toast.error(error); throw new Error(error); }
    const payload = {
      title: title.trim(), category: category.trim() || "General", description: description.trim(),
      fields: cleanFormFields(fields),
    };
    if (form) await opsApi.updateAdmissionForm(form.id, payload);
    else await opsApi.createAdmissionForm(payload);
    toast.success(form ? "Application form updated" : "Application form created");
    onSaved();
  }

  return <FormSheet title={form ? "Edit application form" : "New application form"} submitLabel={form ? "Save changes" : "Create form"} open={open} onOpenChange={onOpenChange} onSubmit={submit}>
    <Field label="Title"><TextInput required value={title} onChange={(event) => setTitle(event.target.value)} /></Field>
    <Field label="Category"><TextInput value={category} onChange={(event) => setCategory(event.target.value)} /></Field>
    <Field label="Description"><TextArea value={description} onChange={(event) => setDescription(event.target.value)} /></Field>
    <FormFieldsEditor fields={fields} onChange={setFields} />
  </FormSheet>;
}
