"use client";

import { useState } from "react";

import { submitAdmissionApplication } from "../lib/api";

export function AdmissionForm() {
  const [form, setForm] = useState({ applicant_name: "", guardian_contact: "", date_of_birth: "", notes: "" });
  const [status, setStatus] = useState<"idle" | "submitting" | "done" | "error">("idle");

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus("submitting");
    try {
      await submitAdmissionApplication({
        applicant_name: form.applicant_name,
        guardian_contact: form.guardian_contact,
        date_of_birth: form.date_of_birth || undefined,
        notes: form.notes || undefined,
      });
      setForm({ applicant_name: "", guardian_contact: "", date_of_birth: "", notes: "" });
      setStatus("done");
    } catch {
      setStatus("error");
    }
  };

  if (status === "done") {
    return <p>Application received — our team will contact you on WhatsApp shortly.</p>;
  }

  return (
    <form className="admissionForm" onSubmit={onSubmit}>
      <label>
        <span>Student name</span>
        <input
          required
          value={form.applicant_name}
          onChange={(e) => setForm({ ...form, applicant_name: e.target.value })}
        />
      </label>
      <label>
        <span>Guardian WhatsApp</span>
        <input
          required
          value={form.guardian_contact}
          onChange={(e) => setForm({ ...form, guardian_contact: e.target.value })}
        />
      </label>
      <label>
        <span>Date of birth</span>
        <input
          type="date"
          value={form.date_of_birth}
          onChange={(e) => setForm({ ...form, date_of_birth: e.target.value })}
        />
      </label>
      <label>
        <span>Notes (program of interest, previous study, etc.)</span>
        <input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
      </label>
      <button type="submit" disabled={status === "submitting"}>
        {status === "submitting" ? "Submitting…" : "Submit for review"}
      </button>
      {status === "error" && <p role="alert">Something went wrong — please try again.</p>}
    </form>
  );
}
