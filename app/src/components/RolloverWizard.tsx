import { Input, Select } from "./ui/Field";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { type AcademicSession, type AcademicClass, academicsApi } from "../lib/endpoints";

interface RolloverWizardProps {
  sourceSession: AcademicSession;
  classes: AcademicClass[];
  onClose: () => void;
  onSuccess: () => void;
}

export function RolloverWizard({ sourceSession, classes, onClose, onSuccess }: RolloverWizardProps) {
  const { t } = useTranslation();
  const [step, setStep] = useState<1 | 2>(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    name: "",
    gregorian_start: "",
    gregorian_end: "",
    hijri_span: "",
    copy_teacher_assignments: true,
    copy_timetable: true,
    copy_holidays: false,
    shift_holiday_dates: true,
  });

  const [mappings, setMappings] = useState<Record<string, string>>({});

  const handleNext = (e: React.FormEvent) => {
    e.preventDefault();
    setStep(2);
  };

  const handleSubmit = async () => {
    setLoading(true);
    setError(null);
    try {
      const class_mappings = classes.map((c) => ({
        current_class_id: c.id,
        next_class_id: mappings[c.id] || null,
      }));

      await academicsApi.rolloverSession(sourceSession.id, {
        ...form,
        class_mappings,
      });
      onSuccess();
    } catch (err: any) {
      setError(err.response?.data?.detail || err.message || "An error occurred");
      setLoading(false);
    }
  };

  return (
    <div className="modalOverlay" style={{
      position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000
    }}>
      <div className="modalContent" style={{
        backgroundColor: "var(--surface)", padding: "24px", borderRadius: "8px", width: "100%", maxWidth: "600px",
        maxHeight: "90vh", overflowY: "auto", display: "flex", flexDirection: "column", gap: "16px"
      }}>
        <h2 style={{ margin: 0 }}>{t("rolloverHeading", { name: sourceSession.name })}</h2>
        {error && <div style={{ color: "var(--error)", padding: "8px", backgroundColor: "var(--error-light)", borderRadius: "4px" }}>{error}</div>}

        {step === 1 && (
          <form onSubmit={handleNext} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            <p style={{ margin: 0, color: "var(--muted)" }}>{t("rolloverStep1Hint")}</p>
            <label style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
              {t("newSessionNameLabel")}
              <Input className="inputField" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. 2026-2027" />
            </label>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
              <label style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                {t("gregorianStartLabel")}
                <Input className="inputField" type="date" required value={form.gregorian_start} onChange={(e) => setForm({ ...form, gregorian_start: e.target.value })} />
              </label>
              <label style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                {t("gregorianEndLabel")}
                <Input className="inputField" type="date" required value={form.gregorian_end} onChange={(e) => setForm({ ...form, gregorian_end: e.target.value })} />
              </label>
            </div>
            <label style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
              {t("hijriSpanLabel")}
              <Input className="inputField" required value={form.hijri_span} onChange={(e) => setForm({ ...form, hijri_span: e.target.value })} placeholder="1448-1449" />
            </label>
            <fieldset className="sectionPicker">
              <legend>{t("rolloverCopyLegend")}</legend>
              <label className="checkboxLabel">
                <input type="checkbox" checked={form.copy_teacher_assignments} onChange={(e) => setForm({ ...form, copy_teacher_assignments: e.target.checked })} />
                {t("copyTeacherAssignmentsLabel")}
              </label>
              <label className="checkboxLabel">
                <input type="checkbox" checked={form.copy_timetable} onChange={(e) => setForm({ ...form, copy_timetable: e.target.checked })} />
                {t("copyTimetableLabel")}
              </label>
              <label className="checkboxLabel">
                <input type="checkbox" checked={form.copy_holidays} onChange={(e) => setForm({ ...form, copy_holidays: e.target.checked })} />
                {t("copyHolidaysLabel")}
              </label>
              {form.copy_holidays && (
                <label className="checkboxLabel">
                  <input type="checkbox" checked={form.shift_holiday_dates} onChange={(e) => setForm({ ...form, shift_holiday_dates: e.target.checked })} />
                  {t("shiftHolidayDatesLabel")}
                </label>
              )}
            </fieldset>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "12px", marginTop: "16px" }}>
              <button type="button" className="secondaryAction" onClick={onClose}>{t("cancelBtn")}</button>
              <button type="submit" className="primaryAction">{t("nextBtn")}</button>
            </div>
          </form>
        )}

        {step === 2 && (
          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            <p style={{ margin: 0, color: "var(--muted)" }}>{t("rolloverStep2Hint")}</p>
            <div className="dataTable" style={{ display: "grid", gap: "8px" }}>
              <div className="dataRow header" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", fontWeight: "bold" }}>
                <span>{t("currentClassCol", { name: sourceSession.name })}</span>
                <span>{t("nextClassCol", { name: form.name })}</span>
              </div>
              {classes.map(c => (
                <div key={c.id} style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", alignItems: "center" }}>
                  <span>{c.name}</span>
                  <Select className="inputField" value={mappings[c.id] || ""} onChange={(e) => setMappings({ ...mappings, [c.id]: e.target.value })}>
                    <option value="">{t("graduateOption")}</option>
                    {classes.map(targetClass => (
                      <option key={targetClass.id} value={targetClass.id}>{targetClass.name}</option>
                    ))}
                  </Select>
                </div>
              ))}
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "12px", marginTop: "16px" }}>
              <button type="button" className="secondaryAction" onClick={() => setStep(1)} disabled={loading}>{t("backBtn")}</button>
              <button type="button" className="primaryAction" onClick={handleSubmit} disabled={loading}>
                {loading ? t("processingLabel") : t("completeRolloverBtn")}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
