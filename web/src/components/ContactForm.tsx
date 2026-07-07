"use client";

import { useState } from "react";

import { submitContactEnquiry } from "../lib/api";

export function ContactForm() {
  const [form, setForm] = useState({ name: "", contact: "", message: "" });
  const [status, setStatus] = useState<"idle" | "submitting" | "done" | "error">("idle");

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus("submitting");
    try {
      await submitContactEnquiry(form);
      setForm({ name: "", contact: "", message: "" });
      setStatus("done");
    } catch {
      setStatus("error");
    }
  };

  if (status === "done") {
    return <p>Thanks — we&apos;ve received your message and will be in touch.</p>;
  }

  return (
    <form className="contactForm" onSubmit={onSubmit}>
      <label>
        <span>Name</span>
        <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
      </label>
      <label>
        <span>Email or phone</span>
        <input required value={form.contact} onChange={(e) => setForm({ ...form, contact: e.target.value })} />
      </label>
      <label>
        <span>Message</span>
        <textarea required value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} />
      </label>
      <button type="submit" disabled={status === "submitting"}>
        {status === "submitting" ? "Sending…" : "Send message"}
      </button>
      {status === "error" && <p role="alert">Something went wrong — please try again.</p>}
    </form>
  );
}
