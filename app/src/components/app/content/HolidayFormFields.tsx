import { Field, CustomDropdown, TextInput } from "@/components/app/Primitives";
import { useTranslation } from "react-i18next";

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
    const { t } = useTranslation();
  return (
    <>
      <Field label={t("Name")}>
        <TextInput value={values.name} onChange={(e) => onChange({ name: e.target.value })} />
      </Field>
      <Field label={t("Category")}>
        <TextInput
          value={values.category}
          onChange={(e) => onChange({ category: e.target.value })}
          placeholder={t("Public / Religious")}
        />
      </Field>
      <Field label={t("Class scope")}>
        <CustomDropdown value={values.classId} onChange={(e) => onChange({ classId: e.target.value })}>
          <option value="">{t("All classes")}</option>
          {classOptions.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </CustomDropdown>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label={t("Start")}>
          <TextInput type="date" value={values.start} onChange={(e) => onChange({ start: e.target.value })} />
        </Field>
        <Field label={t("End")}>
          <TextInput type="date" value={values.end} onChange={(e) => onChange({ end: e.target.value })} />
        </Field>
      </div>
    </>
  );
}
