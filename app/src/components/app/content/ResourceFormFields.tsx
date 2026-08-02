import type { ReactNode } from "react";

import { Field, CustomDropdown, TextArea, TextInput } from "@/components/app/Primitives";
import { FilePickerField } from "@/components/app/FilePickerField";

export interface ResourceFormValues {
  categoryId: string;
  title: string;
  description: string;
  videoUrl: string;
  file: File | null;
}

export function ResourceFormFields({
  values,
  categories,
  onChange,
  fileLabel = "Attachment",
  categoryComposer,
}: {
  values: ResourceFormValues;
  categories: { id: string; name: string }[];
  onChange: (patch: Partial<ResourceFormValues>) => void;
  fileLabel?: string;
  categoryComposer?: ReactNode;
}) {
  return (
    <>
      <Field label="Category">
        <CustomDropdown
          required
          value={values.categoryId}
          onChange={(e) => onChange({ categoryId: e.target.value })}
        >
          <option value="">Select category</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </CustomDropdown>
      </Field>
      {categoryComposer}
      <Field label="Title">
        <TextInput value={values.title} onChange={(e) => onChange({ title: e.target.value })} />
      </Field>
      <Field label="Description">
        <TextArea
          value={values.description}
          onChange={(e) => onChange({ description: e.target.value })}
        />
      </Field>
      <Field label="Video link">
        <TextInput
          value={values.videoUrl}
          onChange={(e) => onChange({ videoUrl: e.target.value })}
          placeholder="https://"
        />
      </Field>
      <FilePickerField
        label={fileLabel}
        fileName={values.file?.name}
        onChange={(file) => onChange({ file })}
      />
    </>
  );
}
