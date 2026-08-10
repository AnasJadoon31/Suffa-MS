import { useEffect, useState } from "react";
import { toast } from "sonner";

import { FormSheet } from "@/components/app/FormSheet";
import { FormFieldsEditor, cleanFormFields, emptyFormField, validateFormFields } from "@/components/app/forms/FormFieldsEditor";
import { CustomDropdown, Field, TextArea, TextInput } from "@/components/app/Primitives";
import { academicsExtraApi, opsApi, type AdmissionForm, type FormFieldDefinition } from "@/lib/mms/more-endpoints";

export function AdmissionFormEditorSheet({ form, open, onOpenChange, onSaved }: {
  form: AdmissionForm | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("General");
  const [description, setDescription] = useState("");
  const [programId, setProgramId] = useState("");
  const [fields, setFields] = useState<FormFieldDefinition[]>([emptyFormField()]);
  const programs = academicsExtraApi.listPrograms;
  const [programOptions, setProgramOptions] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    if (!open) return;
    setTitle(form?.title ?? "");
    setCategory(form?.category ?? "General");
    setDescription(form?.description ?? "");
    setProgramId(form?.program_id ?? "");
    setFields((form?.fields_definition ?? []).filter((field) => !field.built_in));
    void programs().then(setProgramOptions).catch(() => setProgramOptions([]));
  }, [form, open, programs]);

  async function submit() {
    if (!title.trim()) throw new Error("Form title is required");
    const error = validateFormFields(fields);
    if (error && fields.length > 0) { toast.error(error); throw new Error(error); }
    const payload = {
      title: title.trim(), category: category.trim() || "General", description: description.trim(),
      ...(programId ? { program_id: programId } : {}), fields: cleanFormFields(fields),
    };
    if (form) await opsApi.updateAdmissionForm(form.id, payload);
    else await opsApi.createAdmissionForm(payload);
    toast.success(form ? "Application form updated" : "Application form created");
    onSaved();
  }

  return <FormSheet title={form ? "Edit application form" : "New application form"} submitLabel={form ? "Save changes" : "Create form"} open={open} onOpenChange={onOpenChange} onSubmit={submit}>
    <Field label="Title"><TextInput required value={title} onChange={(event) => setTitle(event.target.value)} /></Field>
    <Field label="Program"><CustomDropdown value={programId} onChange={(event) => setProgramId(event.target.value)}><option value="">All programs</option>{programOptions.map((program) => <option key={program.id} value={program.id}>{program.name}</option>)}</CustomDropdown></Field>
    <Field label="Category"><TextInput value={category} onChange={(event) => setCategory(event.target.value)} /></Field>
    <Field label="Description"><TextArea value={description} onChange={(event) => setDescription(event.target.value)} /></Field>
    <FormFieldsEditor fields={fields} onChange={setFields} />
  </FormSheet>;
}
