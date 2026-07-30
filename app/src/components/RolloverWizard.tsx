import { Button, PrimaryButton, SecondaryButton } from "./ui/Button";
import { Input, Select, CheckboxField } from "./ui/Field";
import { Modal } from "./ui/Modal";
import Paper from "@mui/material/Paper";
import Box from "@mui/material/Box";
import { styled } from "@mui/material/styles";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { type AcademicSession, type AcademicClass, academicsApi } from "../lib/endpoints";

interface RolloverWizardProps {
  sourceSession: AcademicSession;
  classes: AcademicClass[];
  onClose: () => void;
  onSuccess: () => void;
}

const StyledFieldset = styled("fieldset")(({ theme }) => ({
  padding: theme.spacing(1.5),
  marginBottom: theme.spacing(1.5),
  borderRadius: theme.shape.borderRadius,
  border: `1px solid ${theme.palette.divider}`,
  backgroundColor: theme.palette.background.default,
}));

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
    <Modal title={t("rolloverHeading", { name: sourceSession.name })} onClose={onClose} maxWidth={600}>
        {error && (
          <Box sx={{ color: "error.main", padding: "8px", backgroundColor: "error.light", borderRadius: 1 }}>
            {error}
          </Box>
        )}

        {step === 1 && (
          <form onSubmit={handleNext}>
            <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <Box component="p" sx={{ margin: 0, color: "text.secondary" }}>{t("rolloverStep1Hint")}</Box>
              <Box component="label" sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}>
                {t("newSessionNameLabel")}
                <Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder={t("academicSessionExample")} />
              </Box>
              <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 2 }}>
                <Box component="label" sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}>
                  {t("gregorianStartLabel")}
                  <Input type="date" required value={form.gregorian_start} onChange={(e) => setForm({ ...form, gregorian_start: e.target.value })} />
                </Box>
                <Box component="label" sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}>
                  {t("gregorianEndLabel")}
                  <Input type="date" required value={form.gregorian_end} onChange={(e) => setForm({ ...form, gregorian_end: e.target.value })} />
                </Box>
              </Box>
              <Box component="label" sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}>
                {t("hijriSpanLabel")}
                <Input required value={form.hijri_span} onChange={(e) => setForm({ ...form, hijri_span: e.target.value })} placeholder="1448-1449" />
              </Box>
              <StyledFieldset>
                <legend>{t("rolloverCopyLegend")}</legend>
                <CheckboxField
                  checked={form.copy_timetable}
                  onChange={(e) => setForm({ ...form, copy_timetable: e.target.checked })}
                  label={t("copyTimetableLabel")}
                />
                <CheckboxField
                  checked={form.copy_holidays}
                  onChange={(e) => setForm({ ...form, copy_holidays: e.target.checked })}
                  label={t("copyHolidaysLabel")}
                />
                {form.copy_holidays && (
                  <CheckboxField
                    checked={form.shift_holiday_dates}
                    onChange={(e) => setForm({ ...form, shift_holiday_dates: e.target.checked })}
                    label={t("shiftHolidayDatesLabel")}
                  />
                )}
              </StyledFieldset>
              <Box sx={{ display: "flex", justifyContent: "flex-end", gap: 1.5, marginTop: 2 }}>
                <SecondaryButton type="button" onClick={onClose}>{t("cancelBtn")}</SecondaryButton>
                <PrimaryButton type="submit">{t("nextBtn")}</PrimaryButton>
              </Box>
            </Box>
          </form>
        )}

        {step === 2 && (
          <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <Box component="p" sx={{ margin: 0, color: "text.secondary" }}>{t("rolloverStep2Hint")}</Box>
            <Box>
              <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, padding: "10px 0", borderBottom: "2px solid", borderColor: "divider", fontWeight: 700, fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.05em", color: "text.secondary" }}>
                <Box sx={{ flex: 1, minWidth: 80 }}>{t("currentClassCol", { name: sourceSession.name })}</Box>
                <Box sx={{ flex: 1, minWidth: 80 }}>{t("nextClassCol", { name: form.name })}</Box>
              </Box>
              {classes.map(c => (
                <Box key={c.id} sx={{ display: "flex", alignItems: "center", gap: 1.5, padding: "10px 0", borderBottom: "1px solid", borderColor: "divider", fontSize: "0.85rem" }}>
                  <Box component="span" data-label={t("currentClassCol", { name: sourceSession.name })} sx={{ flex: 1, minWidth: 80 }}>{c.name}</Box>
                  <Box data-label={t("nextClassCol", { name: form.name })} sx={{ flex: 1, minWidth: 80 }}>
                    <Select value={mappings[c.id] || ""} onChange={(e) => setMappings({ ...mappings, [c.id]: e.target.value })}>
                      <option value="">{t("graduateOption")}</option>
                      {classes.map(targetClass => (
                        <option key={targetClass.id} value={targetClass.id}>{targetClass.name}</option>
                      ))}
                    </Select>
                  </Box>
                </Box>
              ))}
            </Box>
            <Box sx={{ display: "flex", justifyContent: "flex-end", gap: 1.5, marginTop: 2 }}>
              <SecondaryButton type="button" onClick={() => setStep(1)} disabled={loading}>{t("backBtn")}</SecondaryButton>
              <PrimaryButton type="button" onClick={handleSubmit} disabled={loading}>
                {loading ? t("processingLabel") : t("completeRolloverBtn")}
              </PrimaryButton>
            </Box>
          </Box>
        )}
    </Modal>
  );
}
