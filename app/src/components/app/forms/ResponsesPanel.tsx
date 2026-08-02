import { useQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronUp, Download } from "lucide-react";
import { useMemo, useState } from "react";

import {
  Card,
  EmptyState,
  Field,
  CustomDropdown,
  SkeletonList,
  TextInput,
} from "@/components/app/Primitives";
import { formsApi, type FormDef, type FormResponse } from "@/lib/mms/more-endpoints";
import { useTranslation } from "react-i18next";

function toCsv(rows: FormResponse[], forms: FormDef[]): string {
  const columns = ["Form", "Respondent", "Role", "Ward", "Submitted at", "Answers"];
  const lines = [columns.join(",")];
  for (const row of rows) {
    const formTitle = forms.find((f) => f.id === row.form_id)?.title ?? "";
    const answers = JSON.stringify(row.response_data).replace(/"/g, '""');
    const cells = [
      formTitle,
      row.submitted_by_name ?? "",
      row.submitted_by_role ?? "",
      row.ward_name ?? row.student_name ?? "",
      new Date(row.created_at).toLocaleString(),
      answers,
    ].map((cell) => `"${String(cell).replace(/"/g, '""')}"`);
    lines.push(cells.join(","));
  }
  return lines.join("\n");
}

export function ResponsesPanel({ forms }: { forms: FormDef[] }) {
    const { t } = useTranslation();
  const [formId, setFormId] = useState("");
  const [role, setRole] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ["form-responses", formId, role, dateFrom, dateTo],
    queryFn: () =>
      formsApi.listAllResponses({
        form_id: formId || undefined,
        respondent_role: role || undefined,
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
      }),
  });
  const responses = query.data ?? [];

  const csvHref = useMemo(() => {
    if (responses.length === 0) return null;
    const blob = new Blob([toCsv(responses, forms)], { type: "text/csv" });
    return URL.createObjectURL(blob);
  }, [responses, forms]);

  return (
    <div className="space-y-3">
      <Card className="grid grid-cols-2 gap-2.5 p-3.5">
        <Field label={t("Form")}>
          <CustomDropdown value={formId} onChange={(e) => setFormId(e.target.value)}>
            <option value="">{t("All forms")}</option>
            {forms.map((f) => (
              <option key={f.id} value={f.id}>
                {f.title}
              </option>
            ))}
          </CustomDropdown>
        </Field>
        <Field label={t("Role")}>
          <CustomDropdown value={role} onChange={(e) => setRole(e.target.value)}>
            <option value="">{t("All roles")}</option>
            <option value="teacher">{t("Teacher")}</option>
            <option value="student">{t("Student")}</option>
            <option value="parent">{t("Guardian")}</option>
          </CustomDropdown>
        </Field>
        <Field label={t("From")}>
          <TextInput type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
        </Field>
        <Field label={t("To")}>
          <TextInput type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
        </Field>
      </Card>

      <div className="flex items-center justify-between">
        <p className="text-xs font-bold text-muted-foreground">{responses.length} {t("responses")}</p>
        {csvHref ? (
          <a
            href={csvHref}
            download="form-responses.csv"
            className="inline-flex items-center gap-1.5 rounded-xl bg-primary-soft px-3 py-1.5 text-xs font-bold text-primary"
          >
            <Download className="h-3.5 w-3.5" /> {t("Export CSV")}</a>
        ) : null}
      </div>

      {query.isLoading ? <SkeletonList rows={3} /> : null}
      {!query.isLoading && responses.length === 0 ? (
        <EmptyState title={t("No responses")} hint="Submissions will appear here." />
      ) : null}

      <div className="space-y-2.5">
        {responses.map((response) => {
          const isOpen = expanded === response.id;
          return (
            <Card key={response.id} className="p-3.5">
              <button
                type="button"
                className="flex w-full items-center justify-between gap-2 text-left"
                onClick={() => setExpanded(isOpen ? null : response.id)}
              >
                <div className="min-w-0">
                  <p className="truncate font-display text-sm font-extrabold">
                    {response.submitted_by_name ?? "Unknown"}
                    <span className="ml-2 text-xs font-semibold text-muted-foreground">
                      {response.submitted_by_role}
                    </span>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {forms.find((f) => f.id === response.form_id)?.title ?? ""} ·{" "}
                    {new Date(response.created_at).toLocaleString()}
                    {response.ward_name ? ` · Ward: ${response.ward_name}` : ""}
                  </p>
                </div>
                {isOpen ? (
                  <ChevronUp className="h-4 w-4 shrink-0 text-muted-foreground" />
                ) : (
                  <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                )}
              </button>
              {isOpen ? (
                <dl className="mt-3 space-y-2 border-t border-border pt-3">
                  {Object.entries(response.response_data).map(([key, value]) => (
                    <div key={key}>
                      <dt className="text-[0.68rem] font-extrabold uppercase tracking-[0.14em] text-muted-foreground">
                        {key}
                      </dt>
                      <dd className="text-sm">
                        {Array.isArray(value) ? value.join(", ") : String(value)}
                      </dd>
                    </div>
                  ))}
                </dl>
              ) : null}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
