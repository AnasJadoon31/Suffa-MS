import { useEffect, useState } from "react";
import { Banknote, Plus } from "lucide-react";

import { financeApi, type SalaryPayment, type SalaryRecord } from "../lib/endpoints";
import { peopleApi, type Teacher } from "../lib/endpoints";

export function SalaryView() {
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [teacherId, setTeacherId] = useState("");
  const [record, setRecord] = useState<SalaryRecord | null>(null);
  const [payments, setPayments] = useState<SalaryPayment[]>([]);
  const [salaryForm, setSalaryForm] = useState({ amount: "", effective_from: "" });
  const [paymentForm, setPaymentForm] = useState({ amount: "", payment_date: "", period_covered: "", method: "cash", note: "" });
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    void peopleApi.listTeachers().then(setTeachers);
  }, []);

  const loadTeacher = async (id: string) => {
    setTeacherId(id);
    setRecord(null);
    setPayments([]);
    setError("");
    if (!id) return;
    try {
      setRecord(await financeApi.getSalary(id));
    } catch {
      setRecord(null);
    }
    setPayments(await financeApi.listSalaryPayments(id));
  };

  return (
    <section className="modulePanel">
      <div className="moduleHeader">
        <h2><Banknote size={18} /> Salary</h2>
        <p className="notice">Teacher salary records and payment history.</p>
      </div>

      <div className="moduleToolbar">
        <div className="searchBox">
          <label htmlFor="salary-teacher">Teacher</label>
          <select id="salary-teacher" value={teacherId} onChange={(e) => void loadTeacher(e.target.value)}>
            <option value="">Select…</option>
            {teachers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
      </div>

      {teacherId && (
        <>
          <form
            className="inlineForm"
            onSubmit={async (e) => {
              e.preventDefault();
              setError("");
              setNotice("");
              if (!salaryForm.amount || !salaryForm.effective_from) return;
              try {
                const updated = await financeApi.setSalary(teacherId, { amount: Number(salaryForm.amount), effective_from: salaryForm.effective_from });
                setRecord(updated);
                setNotice("Salary record saved.");
              } catch (err: any) {
                setError(err.response?.data?.detail ?? "Failed to save salary");
              }
            }}
          >
            <label>Monthly amount<input required type="number" min={0} value={salaryForm.amount} onChange={(e) => setSalaryForm({ ...salaryForm, amount: e.target.value })} placeholder={record ? String(record.amount) : ""} /></label>
            <label>Effective from<input required type="date" value={salaryForm.effective_from} onChange={(e) => setSalaryForm({ ...salaryForm, effective_from: e.target.value })} /></label>
            <div className="formActions"><button className="primaryAction" type="submit"><Plus size={16} /> Save salary</button></div>
          </form>
          {record && (
            <p className="notice">Current: {record.currency} {record.amount} / month, effective {record.effective_from}</p>
          )}
          {notice && <p className="notice">{notice}</p>}
          {error && <p className="notice" style={{ color: "var(--rose)" }}>{error}</p>}

          <form
            className="inlineForm"
            style={{ marginTop: 16 }}
            onSubmit={async (e) => {
              e.preventDefault();
              setError("");
              const { amount, payment_date, period_covered, method } = paymentForm;
              if (!amount || !payment_date || !period_covered || !method) return;
              try {
                await financeApi.recordSalaryPayment(teacherId, {
                  amount: Number(amount), payment_date, period_covered, method, note: paymentForm.note || undefined,
                });
                setPaymentForm({ amount: "", payment_date: "", period_covered: "", method: "cash", note: "" });
                setPayments(await financeApi.listSalaryPayments(teacherId));
              } catch (err: any) {
                setError(err.response?.data?.detail ?? "Failed to record payment");
              }
            }}
          >
            <label>Amount<input required type="number" min={0} value={paymentForm.amount} onChange={(e) => setPaymentForm({ ...paymentForm, amount: e.target.value })} /></label>
            <label>Payment date<input required type="date" value={paymentForm.payment_date} onChange={(e) => setPaymentForm({ ...paymentForm, payment_date: e.target.value })} /></label>
            <label>Period covered<input required value={paymentForm.period_covered} onChange={(e) => setPaymentForm({ ...paymentForm, period_covered: e.target.value })} placeholder="e.g. June 2026" /></label>
            <label>
              Method
              <select value={paymentForm.method} onChange={(e) => setPaymentForm({ ...paymentForm, method: e.target.value })}>
                <option value="cash">Cash</option>
                <option value="bank_transfer">Bank transfer</option>
                <option value="cheque">Cheque</option>
              </select>
            </label>
            <label>Note<input value={paymentForm.note} onChange={(e) => setPaymentForm({ ...paymentForm, note: e.target.value })} /></label>
            <div className="formActions"><button className="primaryAction" type="submit"><Plus size={16} /> Record payment</button></div>
          </form>

          <div className="dataTable">
            <div className="dataRow header"><span>Date</span><span>Period</span><span>Amount</span><span>Method</span><span>Note</span></div>
            {payments.length === 0 && <p className="emptyState">No salary payments recorded.</p>}
            {payments.map((p) => (
              <div className="dataRow" key={p.id}>
                <span>{p.payment_date}</span>
                <span>{p.period_covered}</span>
                <span>{p.currency} {p.amount}</span>
                <span>{p.method}</span>
                <span>{p.note || "—"}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
