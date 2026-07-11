import { Input, Select } from "./ui/Field";
import { useState } from "react";
import { type AcademicSession, type AcademicClass, academicsApi } from "../lib/endpoints";

interface RolloverWizardProps {
  sourceSession: AcademicSession;
  classes: AcademicClass[];
  onClose: () => void;
  onSuccess: () => void;
}

export function RolloverWizard({ sourceSession, classes, onClose, onSuccess }: RolloverWizardProps) {
  const [step, setStep] = useState<1 | 2>(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    name: "",
    gregorian_start: "",
    gregorian_end: "",
    hijri_span: "",
    copy_teacher_assignments: true,
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
        <h2 style={{ margin: 0 }}>Year-End Rollover: {sourceSession.name}</h2>
        {error && <div style={{ color: "var(--error)", padding: "8px", backgroundColor: "var(--error-light)", borderRadius: "4px" }}>{error}</div>}

        {step === 1 && (
          <form onSubmit={handleNext} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            <p style={{ margin: 0, color: "var(--muted)" }}>Step 1: Details for the new academic session.</p>
            <label style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
              New Session Name
              <Input className="inputField" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. 2026-2027" />
            </label>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
              <label style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                Start Date (Gregorian)
                <Input className="inputField" type="date" required value={form.gregorian_start} onChange={(e) => setForm({ ...form, gregorian_start: e.target.value })} />
              </label>
              <label style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                End Date (Gregorian)
                <Input className="inputField" type="date" required value={form.gregorian_end} onChange={(e) => setForm({ ...form, gregorian_end: e.target.value })} />
              </label>
            </div>
            <label style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
              Hijri Span
              <Input className="inputField" required value={form.hijri_span} onChange={(e) => setForm({ ...form, hijri_span: e.target.value })} placeholder="1448-1449" />
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <Input type="checkbox" checked={form.copy_teacher_assignments} onChange={(e) => setForm({ ...form, copy_teacher_assignments: e.target.checked })} />
              Copy teacher assignments from {sourceSession.name} to the new session
            </label>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "12px", marginTop: "16px" }}>
              <button type="button" className="secondaryAction" onClick={onClose}>Cancel</button>
              <button type="submit" className="primaryAction">Next</button>
            </div>
          </form>
        )}

        {step === 2 && (
          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            <p style={{ margin: 0, color: "var(--muted)" }}>Step 2: Map student promotions. For each current class, select which class its students should be enrolled in for the new session.</p>
            <div className="dataTable" style={{ display: "grid", gap: "8px" }}>
              <div className="dataRow header" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", fontWeight: "bold" }}>
                <span>Current Class (in {sourceSession.name})</span>
                <span>Next Class (in {form.name})</span>
              </div>
              {classes.map(c => (
                <div key={c.id} style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", alignItems: "center" }}>
                  <span>{c.name}</span>
                  <Select className="inputField" value={mappings[c.id] || ""} onChange={(e) => setMappings({ ...mappings, [c.id]: e.target.value })}>
                    <option value="">Graduate / Do not re-enroll</option>
                    {classes.map(targetClass => (
                      <option key={targetClass.id} value={targetClass.id}>{targetClass.name}</option>
                    ))}
                  </Select>
                </div>
              ))}
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "12px", marginTop: "16px" }}>
              <button type="button" className="secondaryAction" onClick={() => setStep(1)} disabled={loading}>Back</button>
              <button type="button" className="primaryAction" onClick={handleSubmit} disabled={loading}>
                {loading ? "Processing..." : "Complete Rollover"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
