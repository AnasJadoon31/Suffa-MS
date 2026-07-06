import { useEffect, useState } from "react";
import { CheckCircle2, ClipboardList, Plus, XCircle } from "lucide-react";

import { academicsApi, type Program } from "../lib/endpoints";
import { operationsApi, type AdmissionApplication } from "../lib/endpoints";
import { useAuth } from "../lib/AuthContext";

export function AdmissionsView() {
  const { hasPermission } = useAuth();
  const canReview = hasPermission("students.provision");
  const [programs, setPrograms] = useState<Program[]>([]);
  const [applications, setApplications] = useState<AdmissionApplication[]>([]);
  const [form, setForm] = useState({ applicant_name: "", guardian_contact: "", program_id: "", date_of_birth: "", notes: "" });
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const load = async () => {
    setPrograms(await academicsApi.listPrograms());
    if (canReview) setApplications(await operationsApi.listAdmissions());
  };
  useEffect(() => {
    void load();
  }, []);

  return (
    <section className="modulePanel">
      <div className="moduleHeader">
        <h2><ClipboardList size={18} /> Admissions</h2>
        <p className="notice">New applicant intake and review.</p>
      </div>

      <form
        className="inlineForm"
        onSubmit={async (e) => {
          e.preventDefault();
          setError("");
          setNotice("");
          if (!form.applicant_name || !form.guardian_contact) return;
          try {
            await operationsApi.createAdmission({
              applicant_name: form.applicant_name,
              guardian_contact: form.guardian_contact,
              program_id: form.program_id || undefined,
              date_of_birth: form.date_of_birth || undefined,
              notes: form.notes || undefined,
            });
            setForm({ applicant_name: "", guardian_contact: "", program_id: "", date_of_birth: "", notes: "" });
            setNotice("Application submitted.");
            await load();
          } catch (err: any) {
            setError(err.response?.data?.detail ?? "Failed to submit application");
          }
        }}
      >
        <label>Applicant name<input required value={form.applicant_name} onChange={(e) => setForm({ ...form, applicant_name: e.target.value })} /></label>
        <label>Guardian contact<input required value={form.guardian_contact} onChange={(e) => setForm({ ...form, guardian_contact: e.target.value })} /></label>
        <label>
          Program
          <select value={form.program_id} onChange={(e) => setForm({ ...form, program_id: e.target.value })}>
            <option value="">Select…</option>
            {programs.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
        <label>Date of birth<input type="date" value={form.date_of_birth} onChange={(e) => setForm({ ...form, date_of_birth: e.target.value })} /></label>
        <label>Notes<input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></label>
        <div className="formActions"><button className="primaryAction" type="submit"><Plus size={16} /> Submit application</button></div>
      </form>
      {error && <p className="notice" style={{ color: "var(--rose)" }}>{error}</p>}
      {notice && <p className="notice">{notice}</p>}

      {canReview && (
        <div className="dataTable">
          <div className="dataRow header"><span>Applicant</span><span>Guardian</span><span>Program</span><span>Status</span><span></span></div>
          {applications.length === 0 && <p className="emptyState">No applications yet.</p>}
          {applications.map((a) => (
            <div className="dataRow" key={a.id}>
              <span>{a.applicant_name}</span>
              <span>{a.guardian_contact}</span>
              <span>{programs.find((p) => p.id === a.program_id)?.name ?? "—"}</span>
              <span>{a.status}</span>
              <span>
                {a.status === "pending" && (
                  <>
                    <button className="tableAction" type="button" onClick={async () => { await operationsApi.setAdmissionStatus(a.id, "accepted"); await load(); }}>
                      <CheckCircle2 size={14} />
                    </button>
                    <button className="tableAction" type="button" onClick={async () => { await operationsApi.setAdmissionStatus(a.id, "rejected"); await load(); }}>
                      <XCircle size={14} />
                    </button>
                  </>
                )}
              </span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
