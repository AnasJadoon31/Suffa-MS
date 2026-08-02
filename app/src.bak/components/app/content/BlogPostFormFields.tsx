import { Field, TextInput } from "@/components/app/Primitives";
import { RichTextEditor } from "@/components/app/RichTextEditor";

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
  return (
    <>
      <Field label="Title">
        <TextInput value={values.title} onChange={(e) => onChange({ title: e.target.value })} />
      </Field>
      <Field label="Body">
        <RichTextEditor
          value={values.body}
          onChange={(body) => onChange({ body })}
          placeholder="Write your post…"
        />
      </Field>
    </>
  );
}
