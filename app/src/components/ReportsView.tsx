import { Button } from "./ui/Button";
import { FileDown } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { useAuth } from "../lib/AuthContext";
import { academicsApi, operationsApi, type AcademicClass, type AcademicSession, type Section, type TimetableSlot, reportingApi } from "../lib/endpoints";
import { ErrorState, LoadingState } from "./ui/AsyncState";
import { PageSection, PageHeader } from "./ui/Layout";
import { InlineFilter, type InlineFilterConfig } from "./ui/InlineFilter";

function ReportCard({
  title,
  filters,
  disabled,
  onDownload,
}: Readonly<{
  title: string;
  filters: InlineFilterConfig[];
  disabled: boolean;
  onDownload: (format: "csv" | "pdf") => void;
}>) {
  return (
    <PageSection>
      <PageHeader title={title} />
      <InlineFilter filters={filters}>
        <div className="formActions">
          <Button className="secondaryAction" type="button" disabled={disabled} onClick={() => onDownload("csv")}>
            <FileDown size={16} /> CSV
          </Button>
          <Button className="secondaryAction" type="button" disabled={disabled} onClick={() => onDownload("pdf")}>
            <FileDown size={16} /> PDF
          </Button>
        </div>
      </InlineFilter>
    </PageSection>
  );
}

export function ReportsView() {
  const { t } = useTranslation();
  const { hasPermission, user } = useAuth();
  const isTeacher = user?.role === "teacher";
  const [classes, setClasses] = useState<AcademicClass[]>([]);
  const [sections, setSections] = useState<Section[]>([]);
  const [teacherSlots, setTeacherSlots] = useState<TimetableSlot[]>([]);
  const [sessions, setSessions] = useState<AcademicSession[]>([]);
  const [classId, setClassId] = useState("");
  const [sectionId, setSectionId] = useState("");
  const [sessionId, setSessionId] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    void (async () => {
      setIsLoading(true);
      try {
        const [classList, sessionRows, slots] = await Promise.all([
          academicsApi.listClasses(),
          academicsApi.listSessions(),
          isTeacher ? operationsApi.listMyTimetable() : Promise.resolve([]),
        ]);
        setTeacherSlots(slots);
        const taughtClassIds = new Set(slots.map((slot) => slot.class_id));
        setClasses(isTeacher ? classList.filter((item) => taughtClassIds.has(item.id)) : classList);
        setSessions(sessionRows);
        const active = sessionRows.find((s) => s.is_active);
        if (active) setSessionId(active.id);
        setLoadError("");
      } catch (err: any) {
        setLoadError(err.response?.data?.detail ?? t("failedLoadReportFilters"));
      } finally {
        setIsLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setSectionId("");
    if (!classId) {
      setSections([]);
      return;
    }
    void academicsApi.listSections(classId).then((rows) => {
      if (!isTeacher) {
        setSections(rows);
        return;
      }
      const assigned = new Set(teacherSlots.filter((slot) => slot.class_id === classId).map((slot) => slot.section_id));
      setSections(rows.filter((section) => assigned.has(section.id)));
    }).catch(() => setSections([]));
  }, [classId, isTeacher, teacherSlots]);

  const run = (fn: () => Promise<void>) => {
    setError("");
    void fn().catch((err: any) => setError(err.response?.data?.detail ?? t("failedGenerateReport")));
  };

  const hasRange = Boolean(startDate && endDate);
  const classSectionFilters: InlineFilterConfig[] = [
    { key: "class", type: "select", label: t("classLabel"), value: classId, placeholder: t("selectEllipsis"), options: classes.map((item) => ({ value: item.id, label: item.name })), onChange: setClassId },
    { key: "section", type: "select", label: t("sectionLabel"), value: sectionId, placeholder: t("selectEllipsis"), options: sections.map((item) => ({ value: item.id, label: item.name })), disabled: !classId, onChange: setSectionId },
  ];

  return (
    <PageSection>
      <PageHeader title={t("reports")} notice={t("descReports")} />

      {isLoading && <LoadingState />}
      {!isLoading && loadError && <ErrorState message={loadError} />}

      <InlineFilter filters={[
        { key: "from", type: "input", inputType: "date", label: t("fromLabel"), value: startDate, onChange: setStartDate },
        { key: "to", type: "input", inputType: "date", label: t("toLabel"), value: endDate, onChange: setEndDate },
      ]} />

      <ReportCard
        title={t("attendanceReportHeading")}
        filters={classSectionFilters}
        disabled={!classId || !sectionId || !hasRange}
        onDownload={(format) =>
          run(() => reportingApi.downloadAttendanceReport({ class_id: classId, section_id: sectionId, start_date: startDate, end_date: endDate }, format))
        }
      />

      {(isTeacher || hasPermission("assessments.marks.enter")) && (
        <ReportCard
          title={t("resultsReportHeading")}
          filters={[...classSectionFilters, {
            key: "session", type: "select", label: t("sessionLabel"), value: sessionId, placeholder: t("selectEllipsis"),
            options: sessions.map((session) => ({ value: session.id, label: session.name })), onChange: setSessionId,
          }]}
          disabled={!classId || !sectionId || !sessionId}
          onDownload={(format) =>
            run(() => reportingApi.downloadResultsReport({ class_id: classId, section_id: sectionId, session_id: sessionId }, format))
          }
        />
      )}

      {hasPermission("finance.reports.view") && (
        <ReportCard
          title={t("financeReportHeading")}
          filters={[]}
          disabled={!hasRange}
          onDownload={(format) =>
            run(() => reportingApi.downloadFinanceReport({ start_date: startDate, end_date: endDate }, format))
          }
        />
      )}

      {hasPermission("finance.reports.view") && (
        <ReportCard
          title={t("donationsReportHeading")}
          filters={[]}
          disabled={!hasRange}
          onDownload={(format) =>
            run(() => reportingApi.downloadDonationsReport({ start_date: startDate, end_date: endDate }, format))
          }
        />
      )}

      {hasPermission("teachers.salary.manage") && (
        <ReportCard
          title={t("salaryReportHeading")}
          filters={[]}
          disabled={!hasRange}
          onDownload={(format) =>
            run(() => reportingApi.downloadSalaryReport({ start_date: startDate, end_date: endDate }, format))
          }
        />
      )}

      {error && <p className="notice" style={{ color: "var(--rose)" }}>{error}</p>}
    </PageSection>
  );
}
