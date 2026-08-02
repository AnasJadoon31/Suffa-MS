import { Field, TextInput } from "@/components/app/Primitives";
import { RichTextEditor } from "@/components/app/RichTextEditor";
import { useTranslation } from "react-i18next";

export interface BlogPostFormValues {
  title: string;
  body: string;
}

export function BlogPostFormFields({
  values,
  onChange,
}: {
  values: BlogPostFormValues;
  onChange: (patch: Partial<BlogPostFormValues>) => void;
}) {
    const { t } = useTranslation();
  return (
    <>
      <Field label={t("Title")}>
        <TextInput value={values.title} onChange={(e) => onChange({ title: e.target.value })} />
      </Field>
      <Field label={t("Body")}>
        <RichTextEditor
          value={values.body}
          onChange={(body) => onChange({ body })}
          placeholder={t("Write your post…")}
        />
      </Field>
    </>
  );
}
