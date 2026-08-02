import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Download, Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/app/AppShell";
import { Card, CustomDropdown, SectionTitle } from "@/components/app/Primitives";
import { apiErrorMessage } from "@/lib/mms/api";
import { academicsApi } from "@/lib/mms/endpoints";
import { reportsApi } from "@/lib/mms/more-endpoints";
import { useTranslation } from "react-i18next";

export const Route = createFileRoute("/reports")({
  head: () => ({
    meta: [
      { title: "Reports — Suffa MS" },
      {
        name: "description",
        content: "Export attendance, finance, salary, donation and result reports.",
      },
      { property: "og:title", content: "Reports — Suffa MS" },
      {
        property: "og:description",
        content: "Export attendance, finance and result reports as CSV or PDF.",
      },
    ],
  }),
  component: ReportsPage,
});

function firstOfMonth() {
  const date = new Date();
  return new Date(date.getFullYear(), date.getMonth(), 1).toISOString().slice(0, 10);
}

function ReportsPage() {
    const { t } = useTranslation();
  const [start, setStart] = useState(firstOfMonth());
  const [end, setEnd] = useState(new Date().toISOString().slice(0, 10));
  const [classId, setClassId] = useState("");
  const [sessionId, setSessionId] = useState("");
  const [busy, setBusy] = useState("");

  const classes = useQuery({ queryKey: ["classes"], queryFn: () => academicsApi.listClasses() });
  const sessions = useQuery({ queryKey: ["sessions"], queryFn: () => academicsApi.listSessions() });

  const run = async (key: string, task: () => Promise<void>) => {
    setBusy(key);
    try {
      await task();
      toast.success("Report downloaded");
    } catch (error) {
      toast.error(apiErrorMessage(error, "Couldn't generate report"));
    } finally {
      setBusy("");
    }
  };

  return (
    <AppShell title={t("Reports")} subtitle={t("Export CSV or PDF")}>
      <Card className="space-y-3">
        <p className="font-display text-sm font-extrabold">{t("Filters")}</p>
        <div className="grid grid-cols-2 gap-2">
          <input
            type="date"
            value={start}
            onChange={(e) => setStart(e.target.value)}
            className="rounded-xl bg-muted px-3 py-2.5 text-sm outline-none"
          />
          <input
            type="date"
            value={end}
            onChange={(e) => setEnd(e.target.value)}
            className="rounded-xl bg-muted px-3 py-2.5 text-sm outline-none"
          />
        </div>
        <CustomDropdown value={classId} onChange={(e) => setClassId(e.target.value)}>
          <option value="">{t("Select class")}</option>
          {(classes.data ?? []).map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </CustomDropdown>
        <CustomDropdown value={sessionId} onChange={(e) => setSessionId(e.target.value)}>
          <option value="">{t("Select session")}</option>
          {(sessions.data ?? []).map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </CustomDropdown>
      </Card>

      <SectionTitle>{t("Available reports")}</SectionTitle>
      <div className="space-y-2.5">
        <ReportRow
          title={t("Attendance")}
          hint="Requires a class and date range"
          busy={busy}
          id="attendance"
          disabled={!classId}
          onPick={(format) =>
            run("attendance", () =>
              reportsApi.attendance(
                { class_id: classId, start_date: start, end_date: end },
                format,
              ),
            )
          }
        />
        <ReportRow
          title={t("Finance")}
          hint="Fee contributions in the range"
          busy={busy}
          id="finance"
          onPick={(format) =>
            run("finance", () => reportsApi.finance({ start_date: start, end_date: end }, format))
          }
        />
        <ReportRow
          title={t("Salary")}
          hint="Staff salary payments"
          busy={busy}
          id="salary"
          onPick={(format) =>
            run("salary", () => reportsApi.salary({ start_date: start, end_date: end }, format))
          }
        />
        <ReportRow
          title={t("Donations")}
          hint="Donor contributions"
          busy={busy}
          id="donations"
          onPick={(format) =>
            run("donations", () =>
              reportsApi.donations({ start_date: start, end_date: end }, format),
            )
          }
        />
        <ReportRow
          title={t("Results")}
          hint="Requires a class and session"
          busy={busy}
          id="results"
          disabled={!classId || !sessionId}
          onPick={(format) =>
            run("results", () =>
              reportsApi.results({ class_id: classId, session_id: sessionId }, format),
            )
          }
        />
      </div>
    </AppShell>
  );
}

function ReportRow({
  title,
  hint,
  id,
  busy,
  disabled,
  onPick,
}: {
  title: string;
  hint: string;
  id: string;
  busy: string;
  disabled?: boolean;
  onPick: (format: "csv" | "pdf") => void;
}) {
    const { t } = useTranslation();
  const pending = busy === id;
  return (
    <Card className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 p-3.5">
      <div className="min-w-0">
        <p className="truncate font-semibold">{title}</p>
        <p className="truncate text-xs text-muted-foreground">{hint}</p>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        {pending ? <Loader2 className="h-4 w-4 animate-spin text-primary" /> : null}
        {(["csv", "pdf"] as const).map((format) => (
          <button
            key={format}
            disabled={disabled || pending}
            onClick={() => onPick(format)}
            className="flex items-center gap-1 rounded-xl bg-primary-soft px-2.5 py-2 text-[0.68rem] font-bold uppercase tracking-wide text-primary disabled:opacity-40"
          >
            <Download className="h-3.5 w-3.5" />
            {format}
          </button>
        ))}
      </div>
    </Card>
  );
}
