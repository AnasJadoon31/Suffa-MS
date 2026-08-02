import { Field, CustomDropdown, TextInput } from "@/components/app/Primitives";
import { RichTextEditor } from "@/components/app/RichTextEditor";

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
  return (
    <>
      <Field label="Title">
        <TextInput value={values.title} onChange={(e) => onChange({ title: e.target.value })} />
      </Field>
      <Field label="Message">
        <RichTextEditor
          value={values.body}
          onChange={(body) => onChange({ body })}
          placeholder="Write the notice…"
        />
      </Field>
      <Field label="Category">
        <TextInput
          value={values.category}
          onChange={(e) => onChange({ category: e.target.value })}
          placeholder="General"
        />
      </Field>
      <Field label="Audience">
        <CustomDropdown value={values.audience} onChange={(e) => onChange({ audience: e.target.value })}>
          <option value="all">Everyone</option>
          <option value="teacher">Teachers</option>
          <option value="student">Students</option>
          <option value="parent">Guardians</option>
        </CustomDropdown>
      </Field>
      <Field label="Attachment link">
        <TextInput
          value={values.link}
          onChange={(e) => onChange({ link: e.target.value })}
          placeholder="https://"
        />
      </Field>
    </>
  );
}
