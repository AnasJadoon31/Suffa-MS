import { Button } from "./ui/Button";
import { useEffect, useMemo, useState } from "react";
import { Box } from "./ui/Mui";
import { Paper } from "./ui/Mui";
import { Typography } from "./ui/Mui";
import { Alert } from "./ui/Mui";
import { Chip } from "./ui/Mui";
import { Banknote, Pencil, Plus, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useDialog } from "../lib/DialogContext";

import { useAuth } from "../lib/AuthContext";
import { financeApi, type MySalary, type SalaryHistory, type SalaryPayment, type SalaryRecord } from "../lib/endpoints";
import { peopleApi, type Teacher } from "../lib/endpoints";
import { PageSection, PageHeader } from "./ui/Layout";
import { HijriTag } from "./HijriTag";
import { SearchDropdown } from "./SearchDropdown";
import { Input, Select } from "./ui/Field";
import { ErrorState, LoadingState } from "./ui/AsyncState";
import { useSessionReadOnly } from "./SessionSwitcher";
import { Modal, FormModal } from "./ui/Modal";
import { InlineFilter } from "./ui/InlineFilter";
import { ActionMenu } from "./ui/ActionMenu";
import { FormStack, FormRow, FormField } from "./ui/FormLayout";

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
    <PageSection>
      <PageHeader title={t("salary")} icon={<Banknote size={18} />} notice={t("descMySalary")} />
      {isLoading && <LoadingState />}
      {!isLoading && error && <ErrorState message={error} />}
      {!isLoading && !error && data?.record ? (
        <Alert severity="info" sx={{ mt: 1 }}>
          {t("currentSalaryLine", { currency: data.record.currency, amount: data.record.amount, date: data.record.effective_from })}
        </Alert>
      ) : (
        !isLoading && !error && data && <Typography sx={{ color: "text.secondary", fontStyle: "italic" }}>{t("noSalarySetYet")}</Typography>
      )}
      {!isLoading && !error && (
      <Box sx={{ mt: 2 }}>
        <Box sx={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 1, fontWeight: 700, borderBottom: 2, borderColor: "divider", pb: 1, mb: 1 }}>
          <span>{t("dateCol")}</span>
          <span>{t("periodCoveredCol")}</span>
          <span>{t("amountCol")}</span>
          <span>{t("methodCol")}</span>
          <span>{t("notesLabel")}</span>
        </Box>
        {data && data.payments.length === 0 && <Typography sx={{ color: "text.secondary", fontStyle: "italic" }}>{t("noPaymentsYet")}</Typography>}
        {data?.payments.map((p) => (
          <Box key={p.id} sx={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 1, py: 1, borderBottom: 1, borderColor: "divider" }}>
            <span>{p.payment_date}<HijriTag date={p.payment_date} /></span>
            <span>{p.period_covered}</span>
            <span>{p.currency} {p.amount}</span>
            <span>{p.method}</span>
            <span>{p.note || "—"}</span>
          </Box>
        ))}
      </Box>
      )}
    </PageSection>
  );
}

function AdminSalaryView({ canWrite }: Readonly<{ canWrite: boolean }>) {
  const { t } = useTranslation();
  const { confirm } = useDialog();
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [teacherId, setTeacherId] = useState("");
  const [teacherSearch, setTeacherSearch] = useState("");
  const [record, setRecord] = useState<SalaryRecord | null>(null);
  const [payments, setPayments] = useState<SalaryPayment[]>([]);
  const [history, setHistory] = useState<SalaryHistory[]>([]);
  const [salaryForm, setSalaryForm] = useState({ amount: "", effective_from: "" });
  const [paymentForm, setPaymentForm] = useState({ amount: "", payment_date: "", period_covered: "", method: "cash", note: "" });
  const [paymentEditForm, setPaymentEditForm] = useState({ amount: "", payment_date: "", period_covered: "", method: "cash", note: "" });
  const [recordSalaryTeacherId, setRecordSalaryTeacherId] = useState("");
  const [recordSalaryTeacherSearch, setRecordSalaryTeacherSearch] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [editModal, setEditModal] = useState<"salary" | "payment" | null>(null);
  const [editingPayment, setEditingPayment] = useState<SalaryPayment | null>(null);

  useEffect(() => {
    void (async () => {
      setIsLoading(true);
      try {
        const [teacherRows, historyRows] = await Promise.all([
          peopleApi.listTeachers(), financeApi.listSalaryHistory(),
        ]);
        setTeachers(teacherRows);
        setHistory(historyRows);
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

  const refreshHistory = async () => {
    setHistory(await financeApi.listSalaryHistory());
  };

  const refreshSelectedTeacher = async () => {
    if (teacherId) {
      setPayments(await financeApi.listSalaryPayments(teacherId));
    }
  };

  const teacherLabel = (id: string) => {
    const teacher = teachers.find((row) => row.id === id);
    return teacher ? `${teacher.name} (${teacher.employee_code})` : "";
  };

  const openRecordSalaryModal = (id = teacherId) => {
    setError("");
    setPaymentForm({ amount: "", payment_date: "", period_covered: "", method: "cash", note: "" });
    setRecordSalaryTeacherId(id);
    setRecordSalaryTeacherSearch(teacherLabel(id));
    setEditModal("payment");
  };

  const startEditPayment = (payment: SalaryPayment) => {
    setPaymentEditForm({
      amount: String(payment.amount),
      payment_date: payment.payment_date,
      period_covered: payment.period_covered,
      method: payment.method,
      note: payment.note || "",
    });
    setEditingPayment(payment);
    setError("");
  };

  const deletePayment = async (payment: SalaryPayment) => {
    if (!(await confirm(t("deleteSalaryPaymentConfirm"), {
      title: t("deleteBtn"),
      confirmLabel: t("deleteBtn"),
    }))) return;
    setError("");
    try {
      await financeApi.deleteSalaryPayment(payment.id);
      await Promise.all([refreshHistory(), refreshSelectedTeacher()]);
      setNotice(t("salaryPaymentDeleted"));
    } catch (err: any) {
      setError(err.response?.data?.detail ?? t("failedDelete"));
    }
  };

  const matchingTeachers = useMemo(() => {
    const query = teacherSearch.trim().toLowerCase();
    if (!query) return teachers;
    return teachers.filter((teacher) => (
      teacher.name.toLowerCase().includes(query) || teacher.employee_code.toLowerCase().includes(query)
    ));
  }, [teacherSearch, teachers]);
  const recordSalaryTeachers = useMemo(() => {
    const query = recordSalaryTeacherSearch.trim().toLowerCase();
    if (!query) return teachers;
    return teachers.filter((teacher) => (
      teacher.name.toLowerCase().includes(query) || teacher.employee_code.toLowerCase().includes(query)
    ));
  }, [recordSalaryTeacherSearch, teachers]);

  return (
    <PageSection>
      <PageHeader title={t("salary")} icon={<Banknote size={18} />} notice={t("descSalary")} />

      {isLoading && <LoadingState />}
      {!isLoading && loadError && <ErrorState message={loadError} />}

      {!isLoading && !loadError && (
        <>
          {canWrite && (
            <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", mb: 2 }}>
              <Button type="button" onClick={() => openRecordSalaryModal()}>
                <Plus size={16} /> {t("recordSalaryBtn")}
              </Button>
            </Box>
          )}
          <Box sx={{ mb: 2 }}>
            <Box sx={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 1, fontWeight: 700, borderBottom: 2, borderColor: "divider", pb: 1, mb: 1 }}>
              <span>{t("teacherLabel")}</span>
              <span>{t("amountCol")}</span>
              <span>{t("dateCol")}</span>
              <span>{t("periodCoveredCol")}</span>
              <span>{t("methodCol")}</span>
              <span>{t("statusCol")}</span>
              <span>{t("actionsCol")}</span>
            </Box>
            {history.length === 0 && <Typography sx={{ color: "text.secondary", fontStyle: "italic" }}>{t("noPaymentsYet")}</Typography>}
            {history.map((payment) => (
              <Box key={payment.id} sx={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 1, py: 1, borderBottom: 1, borderColor: "divider", alignItems: "center" }}>
                <span><strong>{payment.teacher_name}</strong><br /><small>{payment.employee_code}</small></span>
                <span>{payment.currency} {payment.amount}</span>
                <span>{payment.payment_date}</span>
                <span>{payment.period_covered}</span>
                <span>{payment.method}</span>
                <span><Chip label={payment.status} size="small" color="success" /></span>
                <span><ActionMenu ariaLabel={t("actionsCol")} items={[
                  {
                    label: t("viewBtn"),
                    onClick: () => {
                      const teacher = teachers.find((row) => row.id === payment.teacher_id);
                      setTeacherSearch(teacher ? `${teacher.name} (${teacher.employee_code})` : payment.teacher_name);
                      void loadTeacher(payment.teacher_id);
                    },
                  },
                  ...(canWrite ? [
                    { label: t("editBtn"), icon: <Pencil size={14} />, onClick: () => startEditPayment(payment) },
                    { label: t("deleteBtn"), icon: <Trash2 size={14} />, destructive: true, onClick: () => deletePayment(payment) },
                  ] : []),
                ]} /></span>
              </Box>
            ))}
          </Box>
        </>
      )}

      <InlineFilter filters={[]}>
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
          <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
            <Button
              type="button"
              onClick={() => {
                setTeacherSearch("");
                void loadTeacher("");
              }}
            >
              {t("cancelBtn")}
            </Button>
          </Box>
        )}
      </InlineFilter>

      {teacherId && (
        <>
          {canWrite && (
            <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", my: 2 }}>
              <Button type="button" onClick={() => setEditModal("salary")}><Plus size={16} /> {t("saveSalaryBtn")}</Button>
              <Button type="button" onClick={() => openRecordSalaryModal(teacherId)}><Plus size={16} /> {t("recordSalaryBtn")}</Button>
            </Box>
          )}
          {canWrite && editModal === "salary" && <FormModal
                    title={t("saveSalaryBtn")} onClose={() => setEditModal(null)}
                    onSubmit={async (e) => {
                                e.preventDefault();
                                setError("");
                                setNotice("");
                                if (!salaryForm.amount || !salaryForm.effective_from) return;
                                try {
                                  const updated = await financeApi.setSalary(teacherId, { amount: Number(salaryForm.amount), effective_from: salaryForm.effective_from });
                                  setRecord(updated);
                                  setNotice(t("salarySaved"));
                                  setEditModal(null);
                                } catch (err: any) {
                                  setError(err.response?.data?.detail ?? t("failedSaveSalary"));
                                }
                              }}
                    submitLabel={t("saveSalaryBtn")}
                    submitIcon={<Plus size={16} />}
                  >
                    <FormStack>
                      <FormRow>
                        <FormField label={t("monthlyAmountLabel")}>
                          <Input required type="number" min={0} value={salaryForm.amount} onChange={(e) => setSalaryForm({ ...salaryForm, amount: e.target.value })} placeholder={record ? String(record.amount) : ""} />
                        </FormField>
                        <FormField label={t("effectiveFromLabel")}>
                          <Input required type="date" value={salaryForm.effective_from} onChange={(e) => setSalaryForm({ ...salaryForm, effective_from: e.target.value })} />
                        </FormField>
                      </FormRow>
                    </FormStack>
                  </FormModal>}
          {record && (
            <Alert severity="info" sx={{ mt: 1 }}>
              {t("currentSalaryLine", { currency: record.currency, amount: record.amount, date: record.effective_from })}
            </Alert>
          )}
          {notice && <Alert severity="success" sx={{ mt: 1 }}>{notice}</Alert>}
          {error && <Alert severity="error" sx={{ mt: 1 }}>{error}</Alert>}

          <Box sx={{ mt: 2 }}>
            <Box sx={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 1, fontWeight: 700, borderBottom: 2, borderColor: "divider", pb: 1, mb: 1 }}>
              <span>{t("dateCol")}</span>
              <span>{t("periodCoveredCol")}</span>
              <span>{t("amountCol")}</span>
              <span>{t("methodCol")}</span>
              <span>{t("notesLabel")}</span>
              <span>{t("actionsCol")}</span>
            </Box>
            {payments.length === 0 && <Typography sx={{ color: "text.secondary", fontStyle: "italic" }}>{t("noPaymentsYet")}</Typography>}
            {payments.map((p) => (
              <Box key={p.id} sx={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 1, py: 1, borderBottom: 1, borderColor: "divider", alignItems: "center" }}>
                <span>{p.payment_date}<HijriTag date={p.payment_date} /></span>
                <span>{p.period_covered}</span>
                <span>{p.currency} {p.amount}</span>
                <span>{p.method}</span>
                <span>{p.note || "—"}</span>
                <span>
                  <ActionMenu ariaLabel={t("actionsCol")} items={[
                    { label: t("editBtn"), icon: <Pencil size={14} />, disabled: !canWrite, onClick: () => startEditPayment(p) },
                    { label: t("deleteBtn"), icon: <Trash2 size={14} />, destructive: true, disabled: !canWrite, onClick: () => deletePayment(p) },
                  ]} />
                </span>
              </Box>
            ))}
          </Box>
        </>
      )}

      {canWrite && editModal === "payment" && <FormModal
        title={t("recordSalaryBtn")} onClose={() => setEditModal(null)}
        onSubmit={async (e) => {
          e.preventDefault();
          setError("");
          const targetTeacherId = recordSalaryTeacherId || teacherId;
          if (!targetTeacherId) {
            setError(t("selectTeacherFirst"));
            return;
          }
          const { amount, payment_date, period_covered, method } = paymentForm;
          if (!amount || !payment_date || !period_covered || !method) return;
          try {
            await financeApi.recordSalaryPayment(targetTeacherId, {
              amount: Number(amount), payment_date, period_covered, method, note: paymentForm.note || undefined,
            });
            setPaymentForm({ amount: "", payment_date: "", period_covered: "", method: "cash", note: "" });
            setEditModal(null);
            if (targetTeacherId !== teacherId) {
              setTeacherSearch(teacherLabel(targetTeacherId));
              await loadTeacher(targetTeacherId);
            }
            await Promise.all([refreshHistory(), refreshSelectedTeacher()]);
          } catch (err: any) {
            setError(err.response?.data?.detail ?? t("failedRecordPayment"));
          }
        }}
        submitLabel={t("recordSalaryBtn")}
        submitIcon={<Plus size={16} />}
      >
        <FormStack>
          <SearchDropdown
            id="salary-record-teacher"
            label={t("teacherLabel")}
            placeholder={t("teacherSearchPlaceholder")}
            items={recordSalaryTeachers}
            value={recordSalaryTeacherSearch}
            getKey={(teacher) => teacher.id}
            getLabel={(teacher) => teacher.name}
            getDescription={(teacher) => teacher.employee_code}
            onQueryChange={(query) => {
              setRecordSalaryTeacherSearch(query);
              setRecordSalaryTeacherId("");
            }}
            onSelect={(teacher) => {
              setRecordSalaryTeacherId(teacher.id);
              setRecordSalaryTeacherSearch(`${teacher.name} (${teacher.employee_code})`);
            }}
            emptyLabel={t("noTeachersYet")}
          />
          <FormRow>
            <FormField label={t("amountCol")}>
              <Input required type="number" min={0} value={paymentForm.amount} onChange={(e) => setPaymentForm({ ...paymentForm, amount: e.target.value })} />
            </FormField>
            <FormField label={t("dateCol")}>
              <Input required type="date" value={paymentForm.payment_date} onChange={(e) => setPaymentForm({ ...paymentForm, payment_date: e.target.value })} />
            </FormField>
          </FormRow>
          <FormRow>
            <FormField label={t("periodCoveredCol")}>
              <Input required value={paymentForm.period_covered} onChange={(e) => setPaymentForm({ ...paymentForm, period_covered: e.target.value })} placeholder={t("monthYearExample")} />
            </FormField>
            <FormField label={t("methodCol")}>
              <Select value={paymentForm.method} onChange={(e) => setPaymentForm({ ...paymentForm, method: e.target.value })}>
                <option value="cash">{t("methodCash")}</option>
                <option value="bank_transfer">{t("methodBank")}</option>
                <option value="cheque">{t("methodCheque")}</option>
              </Select>
            </FormField>
          </FormRow>
          <FormField label={t("notesLabel")}>
            <Input value={paymentForm.note} onChange={(e) => setPaymentForm({ ...paymentForm, note: e.target.value })} />
          </FormField>
        </FormStack>
      </FormModal>}

      {canWrite && editingPayment && <FormModal
        title={t("editSalaryPaymentHeading")}
        onClose={() => setEditingPayment(null)}
        onSubmit={async (event) => {
          event.preventDefault();
          setError("");
          try {
            await financeApi.updateSalaryPayment(editingPayment.id, {
              amount: Number(paymentEditForm.amount),
              payment_date: paymentEditForm.payment_date,
              period_covered: paymentEditForm.period_covered,
              method: paymentEditForm.method,
              note: paymentEditForm.note,
            });
            setEditingPayment(null);
            await Promise.all([refreshHistory(), refreshSelectedTeacher()]);
            setNotice(t("salaryPaymentSaved"));
          } catch (err: any) {
            setError(err.response?.data?.detail ?? t("failedUpdate"));
          }
        }}
        submitLabel={t("saveBtn")}
      >
        <FormStack>
          <FormRow>
            <FormField label={t("amountCol")}>
              <Input required type="number" min={0} value={paymentEditForm.amount} onChange={(e) => setPaymentEditForm({ ...paymentEditForm, amount: e.target.value })} />
            </FormField>
            <FormField label={t("dateCol")}>
              <Input required type="date" value={paymentEditForm.payment_date} onChange={(e) => setPaymentEditForm({ ...paymentEditForm, payment_date: e.target.value })} />
            </FormField>
          </FormRow>
          <FormRow>
            <FormField label={t("periodCoveredCol")}>
              <Input required value={paymentEditForm.period_covered} onChange={(e) => setPaymentEditForm({ ...paymentEditForm, period_covered: e.target.value })} />
            </FormField>
            <FormField label={t("methodCol")}>
              <Select value={paymentEditForm.method} onChange={(e) => setPaymentEditForm({ ...paymentEditForm, method: e.target.value })}>
                <option value="cash">{t("methodCash")}</option>
                <option value="bank_transfer">{t("methodBank")}</option>
                <option value="cheque">{t("methodCheque")}</option>
              </Select>
            </FormField>
          </FormRow>
          <FormField label={t("notesLabel")}>
            <Input value={paymentEditForm.note} onChange={(e) => setPaymentEditForm({ ...paymentEditForm, note: e.target.value })} />
          </FormField>
        </FormStack>
      </FormModal>}
    </PageSection>
  );
}

export function SalaryView({ mode = "manage" }: Readonly<{ mode?: "manage" | "self" }>) {
  const { hasPermission } = useAuth();
  const canWrite = !useSessionReadOnly();
  // Admins (and delegated teachers.salary.manage grantees) get the full
  // lookup-any-teacher screen; every other teacher gets their own read-only
  // record (§C — salary self-view).
  return mode === "manage" && hasPermission("teachers.salary.manage")
    ? <AdminSalaryView canWrite={canWrite} />
    : <MySalaryView />;
}
