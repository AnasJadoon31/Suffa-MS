import { Field, CustomDropdown, TextInput } from "@/components/app/Primitives";

export interface HolidayFormValues {
  name: string;
  category: string;
  start: string;
  end: string;
  classId: string;
}

export function HolidayFormFields({
  values,
  classOptions,
  onChange,
}: {
  values: HolidayFormValues;
  classOptions: { id: string; name: string }[];
  onChange: (patch: Partial<HolidayFormValues>) => void;
}) {
  return (
    <>
      <Field label="Name">
        <TextInput value={values.name} onChange={(e) => onChange({ name: e.target.value })} />
      </Field>
      <Field label="Category">
        <TextInput
          value={values.category}
          onChange={(e) => onChange({ category: e.target.value })}
          placeholder="Public / Religious"
        />
      </Field>
      <Field label="Class scope">
        <CustomDropdown value={values.classId} onChange={(e) => onChange({ classId: e.target.value })}>
          <option value="">All classes</option>
          {classOptions.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </CustomDropdown>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Start">
          <TextInput type="date" value={values.start} onChange={(e) => onChange({ start: e.target.value })} />
        </Field>
        <Field label="End">
          <TextInput type="date" value={values.end} onChange={(e) => onChange({ end: e.target.value })} />
        </Field>
      </div>
    </>
  );
}
