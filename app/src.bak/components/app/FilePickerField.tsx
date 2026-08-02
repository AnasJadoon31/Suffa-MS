import { Upload, type LucideIcon } from "lucide-react";

import { Field } from "@/components/app/Primitives";

export function FilePickerField({
  label,
  fileName,
  onChange,
  placeholder = "Choose file",
  icon: Icon = Upload,
}: {
  label: string;
  fileName?: string;
  onChange: (file: File | null) => void;
  placeholder?: string;
  icon?: LucideIcon;
}) {
  return (
    <Field label={label}>
      <label className="flex cursor-pointer items-center gap-2 rounded-2xl border border-border bg-card px-3.5 py-2.5 text-sm font-semibold">
        <Icon className="h-4 w-4" />
        {fileName ?? placeholder}
        <input
          type="file"
          className="hidden"
          onChange={(event) => onChange(event.target.files?.[0] ?? null)}
        />
      </label>
    </Field>
  );
}
