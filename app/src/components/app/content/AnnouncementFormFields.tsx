import { Field, CustomDropdown, TextInput } from "@/components/app/Primitives";
import { RichTextEditor } from "@/components/app/RichTextEditor";
import { useTranslation } from "react-i18next";

export interface AnnouncementFormValues {
  title: string;
  body: string;
  category: string;
  audience: string;
  link: string;
}

export function AnnouncementFormFields({
  values,
  onChange,
}: {
  values: AnnouncementFormValues;
  onChange: (patch: Partial<AnnouncementFormValues>) => void;
}) {
    const { t } = useTranslation();
  return (
    <>
      <Field label={t("Title")}>
        <TextInput value={values.title} onChange={(e) => onChange({ title: e.target.value })} />
      </Field>
      <Field label={t("Message")}>
        <RichTextEditor
          value={values.body}
          onChange={(body) => onChange({ body })}
          placeholder={t("Write the notice…")}
        />
      </Field>
      <Field label={t("Category")}>
        <TextInput
          value={values.category}
          onChange={(e) => onChange({ category: e.target.value })}
          placeholder={t("General")}
        />
      </Field>
      <Field label={t("Audience")}>
        <CustomDropdown value={values.audience} onChange={(e) => onChange({ audience: e.target.value })}>
          <option value="all">{t("Everyone")}</option>
          <option value="teacher">{t("Teachers")}</option>
          <option value="student">{t("Students")}</option>
          <option value="parent">{t("Guardians")}</option>
        </CustomDropdown>
      </Field>
      <Field label={t("Attachment link")}>
        <TextInput
          value={values.link}
          onChange={(e) => onChange({ link: e.target.value })}
          placeholder={t("https://")}
        />
      </Field>
    </>
  );
}
