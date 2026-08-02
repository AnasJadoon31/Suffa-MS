import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Loader2, SendHorizonal } from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";

import { apiErrorMessage } from "@/lib/mms/api";
import { publicApi, type FormFieldDefinition } from "@/lib/mms/more-endpoints";

export const Route = createFileRoute("/admission/$token")({
  head: () => ({
    meta: [
      { title: "Admission Application — Suffa MS" },
      { name: "description", content: "Submit a madrasa admission application." },
    ],
  }),
  component: PublicAdmissionPage,
});

const STUDENT_NAME_KEYS = new Set(["student_name", "student.name", "applicant_name"]);
const GUARDIAN_CONTACT_KEYS = new Set([
  "guardian_phone_numbers",
  "guardian.phone_numbers",
  "guardian_contact",
  "guardian_phone",
]);
const DOB_KEYS = new Set(["student_date_of_birth", "student.date_of_birth", "date_of_birth"]);

function PublicAdmissionPage() {
  const { token } = Route.useParams();
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [website, setWebsite] = useState("");
  const [error, setError] = useState("");

  const form = useQuery({
    queryKey: ["public-admission", token],
    queryFn: () => publicApi.admissionForm(token),
  });

  const fields = useMemo(
    () => (form.data?.fields_definition ?? []).filter((field) => field.enabled !== false),
    [form.data?.fields_definition],
  );

  const submit = useMutation({
    mutationFn: () =>
      publicApi.submitAdmission(token, {
        applicant_name: answerString(answers, STUDENT_NAME_KEYS),
        guardian_contact: answerString(answers, GUARDIAN_CONTACT_KEYS),
        date_of_birth: answerString(answers, DOB_KEYS) || undefined,
        extra_data: answers,
        website,
      }),
  });

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");

    const missing = fields.find((field) => {
      if (!field.required || field.type === "label") return false;
      const value = answers[field.key];
      return value === undefined || value === "" || (Array.isArray(value) && value.length === 0);
    });
    if (missing) {
      setError(`${missing.label} is required.`);
      return;
    }

    try {
      await submit.mutateAsync();
    } catch (err) {
      setError(apiErrorMessage(err, "Couldn't submit the application."));
    }
  };

  if (form.isLoading) {
    return (
      <CenteredState icon={<Loader2 className="h-6 w-6 animate-spin" />} title="Loading form" />
    );
  }

  if (form.isError || !form.data) {
    return (
      <CenteredState
        title="Admission form unavailable"
        hint={apiErrorMessage(form.error, "This admission link is invalid or unavailable.")}
      />
    );
  }

  if (submit.isSuccess) {
    return (
      <CenteredState
        title="Application submitted"
        hint="Your madrasa office has received the application."
      />
    );
  }

  return (
    <main className="min-h-screen bg-background px-4 py-6 text-foreground">
      <section className="mx-auto max-w-2xl">
        <header className="gradient-emerald rounded-3xl px-5 py-6 text-primary-foreground shadow-[var(--shadow-raised)]">
          {form.data.program_name ? (
            <p className="text-[0.68rem] font-bold uppercase tracking-widest text-primary-foreground/70">
              {form.data.program_name}
            </p>
          ) : null}
          <h1 className="mt-1 font-display text-2xl font-extrabold">{form.data.title}</h1>
          {form.data.description ? (
            <p className="mt-2 text-sm text-primary-foreground/75">{form.data.description}</p>
          ) : null}
        </header>

        {!form.data.is_open ? (
          <div className="card-surface mt-4 p-4">
            <p className="font-display text-base font-extrabold">This form is closed</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Please contact the madrasa office for the next admission window.
            </p>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="mt-4 space-y-3">
            {fields.map((field) => (
              <AdmissionField
                key={field.key}
                field={field}
                value={answers[field.key]}
                onChange={(value) => setAnswers((current) => ({ ...current, [field.key]: value }))}
              />
            ))}

            <label className="hidden">
              Website
              <input
                tabIndex={-1}
                autoComplete="off"
                value={website}
                onChange={(event) => setWebsite(event.target.value)}
              />
            </label>

            {error ? (
              <p className="rounded-xl bg-destructive/10 px-3 py-2.5 text-sm font-medium text-destructive">
                {error}
              </p>
            ) : null}

            <button
              type="submit"
              disabled={submit.isPending}
              className="gradient-emerald flex w-full items-center justify-center gap-2 rounded-2xl py-4 font-display text-base font-extrabold text-primary-foreground shadow-[var(--shadow-raised)] transition-transform active:scale-[0.98] disabled:opacity-60"
            >
              {submit.isPending ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <SendHorizonal className="h-5 w-5" />
              )}
              Submit application
            </button>
          </form>
        )}
      </section>
    </main>
  );
}

function AdmissionField({
  field,
  value,
  onChange,
}: {
  field: FormFieldDefinition;
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  if (field.type === "label") {
    return <p className="px-1 pt-2 text-sm font-semibold text-muted-foreground">{field.label}</p>;
  }

  const commonClass =
    "mt-2 w-full bg-transparent text-base outline-none placeholder:text-muted-foreground";

  return (
    <label className="card-surface block px-4 py-3">
      <span className="block text-[0.68rem] font-bold uppercase tracking-widest text-muted-foreground">
        {field.label}
        {field.required ? " *" : ""}
      </span>
      {field.type === "textarea" ? (
        <textarea
          className={`${commonClass} min-h-24 resize-y`}
          value={typeof value === "string" ? value : ""}
          onChange={(event) => onChange(event.target.value)}
          required={field.required}
        />
      ) : field.type === "dropdown" ? (
        <select
          className={commonClass}
          value={typeof value === "string" ? value : ""}
          onChange={(event) => onChange(event.target.value)}
          required={field.required}
        >
          <option value="">Select</option>
          {field.options.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      ) : field.type === "radio" ? (
        <span className="mt-2 flex flex-wrap gap-2">
          {field.options.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => onChange(option)}
              className={
                value === option
                  ? "gradient-emerald rounded-xl px-3 py-2 text-sm font-bold text-primary-foreground"
                  : "rounded-xl border border-border px-3 py-2 text-sm font-bold text-muted-foreground"
              }
            >
              {option}
            </button>
          ))}
        </span>
      ) : field.type === "checkbox_group" ? (
        <span className="mt-2 grid gap-2">
          {field.options.map((option) => {
            const selected = Array.isArray(value) && value.includes(option);
            return (
              <button
                key={option}
                type="button"
                onClick={() => {
                  const current = Array.isArray(value)
                    ? value.filter((item) => typeof item === "string")
                    : [];
                  onChange(
                    selected ? current.filter((item) => item !== option) : [...current, option],
                  );
                }}
                className={
                  selected
                    ? "gradient-emerald rounded-xl px-3 py-2 text-left text-sm font-bold text-primary-foreground"
                    : "rounded-xl border border-border px-3 py-2 text-left text-sm font-bold text-muted-foreground"
                }
              >
                {option}
              </button>
            );
          })}
        </span>
      ) : (
        <input
          type={field.type === "phone" ? "tel" : "text"}
          className={commonClass}
          value={typeof value === "string" ? value : ""}
          onChange={(event) => onChange(event.target.value)}
          required={field.required}
        />
      )}
    </label>
  );
}

function CenteredState({
  icon,
  title,
  hint,
}: {
  icon?: React.ReactNode;
  title: string;
  hint?: string;
}) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 text-foreground">
      <div className="card-surface w-full max-w-md p-6 text-center">
        {icon ? <div className="mb-3 flex justify-center text-primary">{icon}</div> : null}
        <h1 className="font-display text-xl font-extrabold">{title}</h1>
        {hint ? <p className="mt-2 text-sm text-muted-foreground">{hint}</p> : null}
      </div>
    </main>
  );
}

function answerString(answers: Record<string, unknown>, keys: Set<string>): string {
  for (const key of keys) {
    const value = answers[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}
