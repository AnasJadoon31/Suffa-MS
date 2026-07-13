import { useEffect, useMemo, useState } from "react";
import { Banknote, Plus } from "lucide-react";
import { useTranslation } from "react-i18next";

import { useAuth } from "../lib/AuthContext";
import { financeApi, type MySalary, type SalaryPayment, type SalaryRecord } from "../lib/endpoints";
import { peopleApi, type Teacher } from "../lib/endpoints";
import { HijriTag } from "./HijriTag";
import { SearchDropdown } from "./SearchDropdown";
import { Input, Select } from "./ui/Field";
import { ErrorState, LoadingState } from "./ui/AsyncState";

/** Read-only self-view for teachers without teachers.salary.manage — own
 * salary record + payment history only, no ability to browse other teachers. */
function MySalaryView() {
  const { t } = useTranslation();
  const [data, setData] = useState<MySalary | null>(null);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      setIsLoading(true);
      try {
        setData(await financeApi.getMySalary());
      } catch (err: any) {
        setError(err.response?.data?.detail ?? t("failedLoadSalary"));
      } finally {
        setIsLoading(false);
      }
    })();
  }, [t]);

  return (
    <section className="modulePanel">
      <div className="moduleHeader">
        <h2><Banknote size={18} /> {t("salary")}</h2>
        <p className="notice">{t("descMySalary")}</p>
      </div>
      {isLoading && <LoadingState />}
      {!isLoading && error && <ErrorState message={error} />}
      {!isLoading && !error && data?.record ? (
        <p className="notice">{t("currentSalaryLine", { currency: data.record.currency, amount: data.record.amount, date: data.record.effective_from })}</p>
      ) : (
        !isLoading && !error && data && <p className="emptyState">{t("noSalarySetYet")}</p>
      )}
      {!isLoading && !error && (
      <div className="dataTable">
        <div className="dataRow header"><span>{t("dateCol")}</span><span>{t("periodCoveredCol")}</span><span>{t("amountCol")}</span><span>{t("methodCol")}</span><span>{t("notesLabel")}</span></div>
        {data && data.payments.length === 0 && <p className="emptyState">{t("noPaymentsYet")}</p>}
        {data?.payments.map((p) => (
          <div className="dataRow" key={p.id}>
            <span>{p.payment_date}<HijriTag date={p.payment_date} /></span>
            <span>{p.period_covered}</span>
            <span>{p.currency} {p.amount}</span>
            <span>{p.method}</span>
            <span>{p.note || "—"}</span>
          </div>
        ))}
      </div>
      )}
    </section>
  );
}

function AdminSalaryView() {
  const { t } = useTranslation();
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [teacherId, setTeacherId] = useState("");
  const [teacherSearch, setTeacherSearch] = useState("");
  const [record, setRecord] = useState<SalaryRecord | null>(null);
  const [payments, setPayments] = useState<SalaryPayment[]>([]);
  const [salaryForm, setSalaryForm] = useState({ amount: "", effective_from: "" });
  const [paymentForm, setPaymentForm] = useState({ amount: "", payment_date: "", period_covered: "", method: "cash", note: "" });
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    void (async () => {
      setIsLoading(true);
      try {
        setTeachers(await peopleApi.listTeachers());
        setLoadError("");
      } catch (err: any) {
        setLoadError(err.response?.data?.detail ?? t("failedLoadTeachers"));
      } finally {
        setIsLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  const matchingTeachers = useMemo(() => {
    const query = teacherSearch.trim().toLowerCase();
    if (!query) return teachers;
    return teachers.filter((teacher) => (
      teacher.name.toLowerCase().includes(query) || teacher.employee_code.toLowerCase().includes(query)
    ));
  }, [teacherSearch, teachers]);

  return (
    <section className="modulePanel">
      <div className="moduleHeader">
        <h2><Banknote size={18} /> {t("salary")}</h2>
        <p className="notice">{t("descSalary")}</p>
      </div>

      {isLoading && <LoadingState />}
      {!isLoading && loadError && <ErrorState message={loadError} />}

      <div className="moduleToolbar">
        <SearchDropdown
          id="salary-teacher"
          label={t("teacherLabel")}
          placeholder={t("teacherSearchPlaceholder")}
          items={matchingTeachers}
          value={teacherSearch}
          getKey={(teacher) => teacher.id}
          getLabel={(teacher) => teacher.name}
          getDescription={(teacher) => teacher.employee_code}
          onQueryChange={(query) => {
            setTeacherSearch(query);
            void loadTeacher("");
          }}
          onSelect={(teacher) => {
            setTeacherSearch(`${teacher.name} (${teacher.employee_code})`);
            void loadTeacher(teacher.id);
          }}
          emptyLabel={t("noTeachersYet")}
        />
        {(teacherSearch || teacherId) && (
          <div className="formActions">
            <button
              className="secondaryAction"
              type="button"
              onClick={() => {
                setTeacherSearch("");
                void loadTeacher("");
              }}
            >
              {t("cancelBtn")}
            </button>
          </div>
        )}
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
                setNotice(t("salarySaved"));
              } catch (err: any) {
                setError(err.response?.data?.detail ?? t("failedSaveSalary"));
              }
            }}
          >
            <label>{t("monthlyAmountLabel")}<Input required type="number" min={0} value={salaryForm.amount} onChange={(e) => setSalaryForm({ ...salaryForm, amount: e.target.value })} placeholder={record ? String(record.amount) : ""} /></label>
            <label>{t("effectiveFromLabel")}<Input required type="date" value={salaryForm.effective_from} onChange={(e) => setSalaryForm({ ...salaryForm, effective_from: e.target.value })} /></label>
            <div className="formActions"><button className="primaryAction" type="submit"><Plus size={16} /> {t("saveSalaryBtn")}</button></div>
          </form>
          {record && (
            <p className="notice">{t("currentSalaryLine", { currency: record.currency, amount: record.amount, date: record.effective_from })}</p>
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
                setError(err.response?.data?.detail ?? t("failedRecordPayment"));
              }
            }}
          >
            <label>{t("amountCol")}<Input required type="number" min={0} value={paymentForm.amount} onChange={(e) => setPaymentForm({ ...paymentForm, amount: e.target.value })} /></label>
            <label>{t("dateCol")}<Input required type="date" value={paymentForm.payment_date} onChange={(e) => setPaymentForm({ ...paymentForm, payment_date: e.target.value })} /></label>
            <label>{t("periodCoveredCol")}<Input required value={paymentForm.period_covered} onChange={(e) => setPaymentForm({ ...paymentForm, period_covered: e.target.value })} placeholder="e.g. June 2026" /></label>
            <label>
              {t("methodCol")}
              <Select value={paymentForm.method} onChange={(e) => setPaymentForm({ ...paymentForm, method: e.target.value })}>
                <option value="cash">{t("methodCash")}</option>
                <option value="bank_transfer">{t("methodBank")}</option>
                <option value="cheque">{t("methodCheque")}</option>
              </Select>
            </label>
            <label>{t("notesLabel")}<Input value={paymentForm.note} onChange={(e) => setPaymentForm({ ...paymentForm, note: e.target.value })} /></label>
            <div className="formActions"><button className="primaryAction" type="submit"><Plus size={16} /> {t("recordSalaryBtn")}</button></div>
          </form>

          <div className="dataTable">
            <div className="dataRow header"><span>{t("dateCol")}</span><span>{t("periodCoveredCol")}</span><span>{t("amountCol")}</span><span>{t("methodCol")}</span><span>{t("notesLabel")}</span></div>
            {payments.length === 0 && <p className="emptyState">{t("noPaymentsYet")}</p>}
            {payments.map((p) => (
              <div className="dataRow" key={p.id}>
                <span>{p.payment_date}<HijriTag date={p.payment_date} /></span>
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

export function SalaryView() {
  const { hasPermission } = useAuth();
  // Admins (and delegated teachers.salary.manage grantees) get the full
  // lookup-any-teacher screen; every other teacher gets their own read-only
  // record (§C — salary self-view).
  return hasPermission("teachers.salary.manage") ? <AdminSalaryView /> : <MySalaryView />;
}
