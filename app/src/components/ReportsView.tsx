import { FileDown } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { useAuth } from "../lib/AuthContext";
import { academicsApi, type AcademicClass, type AcademicSession, reportingApi } from "../lib/endpoints";
import { Input, Select } from "./ui/Field";

function ReportCard({
  title,
  children,
  disabled,
  onDownload,
}: Readonly<{
  title: string;
  children?: React.ReactNode;
  disabled: boolean;
  onDownload: (format: "csv" | "pdf") => void;
}>) {
  return (
    <div className="modulePanel">
      <div className="moduleHeader"><h3>{title}</h3></div>
      <div className="inlineForm">
        {children}
        <div className="formActions">
          <button className="secondaryAction" type="button" disabled={disabled} onClick={() => onDownload("csv")}>
            <FileDown size={16} /> CSV
          </button>
          <button className="secondaryAction" type="button" disabled={disabled} onClick={() => onDownload("pdf")}>
            <FileDown size={16} /> PDF
          </button>
        </div>
      </div>
    </div>
  );
}

export function ReportsView() {
  const { t } = useTranslation();
  const { hasPermission } = useAuth();
  const [classes, setClasses] = useState<AcademicClass[]>([]);
  const [sessions, setSessions] = useState<AcademicSession[]>([]);
  const [classId, setClassId] = useState("");
  const [sessionId, setSessionId] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    void academicsApi.listClasses().then(setClasses);
    void academicsApi.listSessions().then((rows) => {
      setSessions(rows);
      const active = rows.find((s) => s.is_active);
      if (active) setSessionId(active.id);
    });
  }, []);

  const run = (fn: () => Promise<void>) => {
    setError("");
    void fn().catch((err: any) => setError(err.response?.data?.detail ?? t("failedGenerateReport")));
  };

  const hasRange = Boolean(startDate && endDate);

  return (
    <section className="modulePanel">
      <div className="moduleHeader">
        <h2>{t("reports")}</h2>
        <p className="notice">{t("descReports")}</p>
      </div>

      <div className="inlineForm">
        <label>{t("fromLabel")}<Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} /></label>
        <label>{t("toLabel")}<Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} /></label>
      </div>

      <ReportCard
        title={t("attendanceReportHeading")}
        disabled={!classId || !hasRange}
        onDownload={(format) =>
          run(() => reportingApi.downloadAttendanceReport({ class_id: classId, start_date: startDate, end_date: endDate }, format))
        }
      >
        <label>
          {t("classLabel")}
          <Select value={classId} onChange={(e) => setClassId(e.target.value)}>
            <option value="">{t("selectEllipsis")}</option>
            {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </label>
      </ReportCard>

      {hasPermission("assessments.marks.enter") && (
        <ReportCard
          title={t("resultsReportHeading")}
          disabled={!classId || !sessionId}
          onDownload={(format) =>
            run(() => reportingApi.downloadResultsReport({ class_id: classId, session_id: sessionId }, format))
          }
        >
          <label>
            {t("classLabel")}
            <Select value={classId} onChange={(e) => setClassId(e.target.value)}>
              <option value="">{t("selectEllipsis")}</option>
              {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </label>
          <label>
            {t("sessionLabel")}
            <Select value={sessionId} onChange={(e) => setSessionId(e.target.value)}>
              <option value="">{t("selectEllipsis")}</option>
              {sessions.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
          </label>
        </ReportCard>
      )}

      {hasPermission("finance.reports.view") && (
        <ReportCard
          title={t("financeReportHeading")}
          disabled={!hasRange}
          onDownload={(format) =>
            run(() => reportingApi.downloadFinanceReport({ start_date: startDate, end_date: endDate }, format))
          }
        />
      )}

      {hasPermission("finance.reports.view") && (
        <ReportCard
          title={t("donationsReportHeading")}
          disabled={!hasRange}
          onDownload={(format) =>
            run(() => reportingApi.downloadDonationsReport({ start_date: startDate, end_date: endDate }, format))
          }
        />
      )}

      {hasPermission("teachers.salary.manage") && (
        <ReportCard
          title={t("salaryReportHeading")}
          disabled={!hasRange}
          onDownload={(format) =>
            run(() => reportingApi.downloadSalaryReport({ start_date: startDate, end_date: endDate }, format))
          }
        />
      )}

      {error && <p className="notice" style={{ color: "var(--rose)" }}>{error}</p>}
    </section>
  );
}
