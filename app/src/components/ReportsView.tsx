import { FileDown } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { useAuth } from "../lib/AuthContext";
import { academicsApi, operationsApi, type AcademicClass, type AcademicSession, type Section, type TimetableSlot, reportingApi } from "../lib/endpoints";
import { Input, Select } from "./ui/Field";
import { ErrorState, LoadingState } from "./ui/AsyncState";

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

function ClassSectionSelectors({
  classes, sections, classId, sectionId, onClassChange, onSectionChange,
}: Readonly<{
  classes: AcademicClass[];
  sections: Section[];
  classId: string;
  sectionId: string;
  onClassChange: (value: string) => void;
  onSectionChange: (value: string) => void;
}>) {
  const { t } = useTranslation();
  return <>
    <label>{t("classLabel")}<Select value={classId} onChange={(event) => onClassChange(event.target.value)}><option value="">{t("selectEllipsis")}</option>{classes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</Select></label>
    <label>{t("sectionLabel")}<Select value={sectionId} onChange={(event) => onSectionChange(event.target.value)} disabled={!classId}><option value="">{t("selectEllipsis")}</option>{sections.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</Select></label>
  </>;
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

  return (
    <section className="modulePanel">
      <div className="moduleHeader">
        <h2>{t("reports")}</h2>
        <p className="notice">{t("descReports")}</p>
      </div>

      {isLoading && <LoadingState />}
      {!isLoading && loadError && <ErrorState message={loadError} />}

      <div className="inlineForm">
        <label>{t("fromLabel")}<Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} /></label>
        <label>{t("toLabel")}<Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} /></label>
      </div>

      <ReportCard
        title={t("attendanceReportHeading")}
        disabled={!classId || !sectionId || !hasRange}
        onDownload={(format) =>
          run(() => reportingApi.downloadAttendanceReport({ class_id: classId, section_id: sectionId, start_date: startDate, end_date: endDate }, format))
        }
      >
        <ClassSectionSelectors classes={classes} sections={sections} classId={classId} sectionId={sectionId} onClassChange={setClassId} onSectionChange={setSectionId} />
      </ReportCard>

      {(isTeacher || hasPermission("assessments.marks.enter")) && (
        <ReportCard
          title={t("resultsReportHeading")}
          disabled={!classId || !sectionId || !sessionId}
          onDownload={(format) =>
            run(() => reportingApi.downloadResultsReport({ class_id: classId, section_id: sectionId, session_id: sessionId }, format))
          }
        >
          <ClassSectionSelectors classes={classes} sections={sections} classId={classId} sectionId={sectionId} onClassChange={setClassId} onSectionChange={setSectionId} />
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
