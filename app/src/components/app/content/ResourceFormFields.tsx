import type { ReactNode } from "react";

import { Field, CustomDropdown, TextArea, TextInput } from "@/components/app/Primitives";
import { FilePickerField } from "@/components/app/FilePickerField";
import { useTranslation } from "react-i18next";

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
    const { t } = useTranslation();
  return (
    <>
      <Field label={t("Category")}>
        <CustomDropdown
          required
          value={values.categoryId}
          onChange={(e) => onChange({ categoryId: e.target.value })}
        >
          <option value="">{t("Select category")}</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </CustomDropdown>
      </Field>
      {categoryComposer}
      <Field label={t("Title")}>
        <TextInput value={values.title} onChange={(e) => onChange({ title: e.target.value })} />
      </Field>
      <Field label={t("Description")}>
        <TextArea
          value={values.description}
          onChange={(e) => onChange({ description: e.target.value })}
        />
      </Field>
      <Field label={t("Video link")}>
        <TextInput
          value={values.videoUrl}
          onChange={(e) => onChange({ videoUrl: e.target.value })}
          placeholder={t("https://")}
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
