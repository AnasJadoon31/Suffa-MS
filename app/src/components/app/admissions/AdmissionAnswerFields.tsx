import { Image, Paperclip } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { FilePickerField } from "@/components/app/FilePickerField";
import { CustomDropdown, Field, TextArea, TextInput } from "@/components/app/Primitives";
import { maskPhone } from "@/lib/masks";
import { type FormFieldDefinition, uploadFile } from "@/lib/mms/more-endpoints";

export function AdmissionAnswerFields({
  fields,
  answers,
  onChange,
}: {
  fields: FormFieldDefinition[];
  answers: Record<string, unknown>;
  onChange: (answers: Record<string, unknown>) => void;
}) {
  const [uploading, setUploading] = useState<string | null>(null);
  const setAnswer = (key: string, value: unknown) => onChange({ ...answers, [key]: value });

  async function attach(field: FormFieldDefinition, file: File | null) {
    if (!file) return;
    setUploading(field.key);
    try {
      const key = await uploadFile(file, field.type === "image" ? "admission-images" : "admission-files");
      setAnswer(field.key, key);
      toast.success(`${field.label} uploaded`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Upload failed");
    } finally {
      setUploading(null);
    }
  }

  return (
    <div className="space-y-3">
      {fields.filter((field) => field.enabled !== false).map((field) => {
        if (field.type === "label") return <p key={field.key} className="font-display text-sm font-bold">{field.label}</p>;
        const label = `${field.label}${field.required ? " *" : ""}`;
        const value = answers[field.key];
        if (field.type === "textarea") return <Field key={field.key} label={label}><TextArea required={field.required} value={(value as string) ?? ""} onChange={(event) => setAnswer(field.key, event.target.value)} /></Field>;
        if (field.type === "phone") return <Field key={field.key} label={label}><TextInput required={field.required} type="tel" value={(value as string) ?? "+92"} onChange={(event) => setAnswer(field.key, maskPhone(event.target.value))} /></Field>;
        if (field.type === "dropdown") return <Field key={field.key} label={label}><CustomDropdown required={field.required} value={(value as string) ?? ""} onChange={(event) => setAnswer(field.key, event.target.value)}><option value="">Select...</option>{field.options.map((option) => <option key={option} value={option}>{option}</option>)}</CustomDropdown></Field>;
        if (field.type === "radio") return <Field key={field.key} label={label}><div className="space-y-2">{field.options.map((option) => <label key={option} className="flex items-center gap-2 text-sm font-semibold"><input type="radio" name={field.key} checked={value === option} onChange={() => setAnswer(field.key, option)} className="h-4 w-4 accent-primary" />{option}</label>)}</div></Field>;
        if (field.type === "checkbox_group") {
          const selected = Array.isArray(value) ? value as string[] : [];
          return <Field key={field.key} label={label}><div className="space-y-2">{field.options.map((option) => <label key={option} className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={selected.includes(option)} onChange={(event) => setAnswer(field.key, event.target.checked ? [...selected, option] : selected.filter((item) => item !== option))} className="h-4 w-4 rounded border-border accent-primary" />{option}</label>)}</div></Field>;
        }
        if (field.type === "file" || field.type === "image") return <FilePickerField key={field.key} label={label} fileName={uploading === field.key ? "Uploading..." : (value as string) || undefined} onChange={(file) => void attach(field, file)} placeholder={field.type === "image" ? "Choose image" : "Choose file"} icon={field.type === "image" ? Image : Paperclip} />;
        return <Field key={field.key} label={label}><TextInput required={field.required} value={(value as string) ?? ""} onChange={(event) => setAnswer(field.key, event.target.value)} /></Field>;
      })}
    </div>
  );
}
