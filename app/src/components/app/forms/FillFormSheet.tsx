import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { FormSheet } from "@/components/app/FormSheet";
import { Field, CustomDropdown, TextArea, TextInput } from "@/components/app/Primitives";
import { useAuth } from "@/lib/mms/auth";
import { reportingApi } from "@/lib/mms/endpoints";
import { formsApi, type FormDef } from "@/lib/mms/more-endpoints";
import { useTranslation } from "react-i18next";

interface Ward {
  id: string;
  name: string;
}

export function FillFormSheet({
  form,
  open,
  onOpenChange,
  onSubmitted,
}: {
  form: FormDef;
  open: boolean;
  onOpenChange: (next: boolean) => void;
  onSubmitted: () => void;
}) {
    const { t } = useTranslation();
  const { user } = useAuth();
  const isGuardian = user?.role === "parent" || user?.role === "guardian";
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [wardId, setWardId] = useState("");

  const wardsQuery = useQuery({
    queryKey: ["forms", "wards"],
    queryFn: async () => {
      const data = (await reportingApi.dashboard()) as unknown as { children?: Ward[] };
      return data.children ?? [];
    },
    enabled: open && isGuardian,
  });
  const wards = wardsQuery.data ?? [];

  useEffect(() => {
    if (!open) return;
    setAnswers({});
    setWardId(wards[0]?.id ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, form.id]);

  const fields = form.fields_definition.filter((f) => f.enabled !== false);

  async function handleSubmit() {
    for (const field of fields) {
      if (field.type === "label") continue;
      if (field.required) {
        const value = answers[field.key];
        const empty =
          value === undefined || value === "" || (Array.isArray(value) && value.length === 0);
        if (empty) {
          toast.error(`"${field.label}" is required`);
          throw new Error("validation");
        }
      }
    }
    if (isGuardian && wards.length > 0 && !wardId) {
      toast.error("Select a ward");
      throw new Error("validation");
    }
    await formsApi.submitResponse(form.id, answers, isGuardian ? wardId || undefined : undefined);
    toast.success("Response submitted");
    onSubmitted();
  }

  return (
    <FormSheet
      title={form.title}
      submitLabel="Submit"
      open={open}
      onOpenChange={onOpenChange}
      onSubmit={handleSubmit}
    >
      {form.description ? (
        <p className="text-sm text-muted-foreground">{form.description}</p>
      ) : null}

      {isGuardian && wards.length > 0 ? (
        <Field label={t("Ward")}>
          <CustomDropdown value={wardId} onChange={(e) => setWardId(e.target.value)}>
            {wards.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </CustomDropdown>
        </Field>
      ) : null}

      {fields.map((field) => {
        if (field.type === "label") {
          return (
            <p key={field.key} className="font-display text-sm font-bold">
              {field.label}
            </p>
          );
        }
        const label = `${field.label}${field.required ? " *" : ""}`;
        if (field.type === "textarea") {
          return (
            <Field key={field.key} label={label}>
              <TextArea
                required={field.required}
                value={(answers[field.key] as string) ?? ""}
                onChange={(e) => setAnswers((a) => ({ ...a, [field.key]: e.target.value }))}
              />
            </Field>
          );
        }
        if (field.type === "phone") {
          return (
            <Field key={field.key} label={label}>
              <TextInput
                type="tel"
                required={field.required}
                value={(answers[field.key] as string) ?? ""}
                onChange={(e) => setAnswers((a) => ({ ...a, [field.key]: e.target.value }))}
              />
            </Field>
          );
        }
        if (field.type === "dropdown") {
          return (
            <Field key={field.key} label={label}>
              <CustomDropdown
                required={field.required}
                value={(answers[field.key] as string) ?? ""}
                onChange={(e) => setAnswers((a) => ({ ...a, [field.key]: e.target.value }))}
              >
                <option value="">{t("Select…")}</option>
                {field.options.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </CustomDropdown>
            </Field>
          );
        }
        if (field.type === "radio") {
          return (
            <div key={field.key} className="space-y-1.5">
              <span className="text-[0.68rem] font-extrabold uppercase tracking-[0.14em] text-muted-foreground">
                {label}
              </span>
              <div className="space-y-1.5">
                {field.options.map((option) => (
                  <label key={option} className="flex items-center gap-2 text-sm font-semibold">
                    <input
                      type="radio"
                      name={field.key}
                      required={field.required}
                      checked={answers[field.key] === option}
                      onChange={() => setAnswers((a) => ({ ...a, [field.key]: option }))}
                      className="h-4 w-4 accent-primary"
                    />
                    {option}
                  </label>
                ))}
              </div>
            </div>
          );
        }
        if (field.type === "checkbox_group") {
          const value = (answers[field.key] as string[] | undefined) ?? [];
          return (
            <div key={field.key} className="space-y-1.5">
              <span className="text-[0.68rem] font-extrabold uppercase tracking-[0.14em] text-muted-foreground">
                {label}
              </span>
              <div className="space-y-1.5">
                {field.options.map((option) => (
                  <label key={option} className="flex items-center gap-2 text-sm font-semibold">
                    <input
                      type="checkbox"
                      checked={value.includes(option)}
                      onChange={(e) =>
                        setAnswers((a) => ({
                          ...a,
                          [field.key]: e.target.checked
                            ? [...value, option]
                            : value.filter((v) => v !== option),
                        }))
                      }
                      className="h-4 w-4 rounded border-border accent-primary"
                    />
                    {option}
                  </label>
                ))}
              </div>
            </div>
          );
        }
        return (
          <Field key={field.key} label={label}>
            <TextInput
              required={field.required}
              value={(answers[field.key] as string) ?? ""}
              onChange={(e) => setAnswers((a) => ({ ...a, [field.key]: e.target.value }))}
            />
          </Field>
        );
      })}
    </FormSheet>
  );
}
