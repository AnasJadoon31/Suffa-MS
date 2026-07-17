import { useEffect, useMemo, useState } from "react";
import { FileDown, Landmark, MessageCircle, Plus } from "lucide-react";
import { useTranslation } from "react-i18next";

import { academicsApi, financeApi, type AcademicClass, type Donation, type Donor, type Payment, type PaymentCategory, type FinanceSummary } from "../lib/endpoints";
import { peopleApi, type Student } from "../lib/endpoints";
import { useAuth } from "../lib/AuthContext";
import { HijriTag } from "./HijriTag";
import { SearchDropdown } from "./SearchDropdown";
import { Input, Select } from "./ui/Field";
import { ErrorState, LoadingState } from "./ui/AsyncState";
import { useSessionReadOnly } from "./SessionSwitcher";


export type FinanceTab = "contributions" | "donations" | "summary";

export function FinanceView({ tab = "contributions", onTabChange }: Readonly<{ tab?: FinanceTab; onTabChange?: (tab: FinanceTab) => void }>) {
  const { t } = useTranslation();
  const { hasPermission } = useAuth();
  const readOnly = useSessionReadOnly();
  const canManage = !readOnly && hasPermission("finance.manage");
  const [categories, setCategories] = useState<PaymentCategory[]>([]);
  const [categoryName, setCategoryName] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const loadCategories = async () => setCategories(await financeApi.listCategories());
  useEffect(() => {
    void (async () => {
      setIsLoading(true);
      try {
        await loadCategories();
        setLoadError("");
      } catch (err: any) {
        setLoadError(err.response?.data?.detail ?? t("failedLoadCategories"));
      } finally {
        setIsLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <section className="modulePanel">
      <div className="moduleHeader">
        <h2><Landmark size={18} /> {t("finance")}</h2>
        <p className="notice">{t("descFinance")}</p>
      </div>
      <div className="formActions" style={{ marginBottom: 16 }}>
        <button className={tab === "contributions" ? "primaryAction" : "secondaryAction"} type="button" onClick={() => onTabChange?.("contributions")}>{t("contributionsTab")}</button>
        <button className={tab === "donations" ? "primaryAction" : "secondaryAction"} type="button" onClick={() => onTabChange?.("donations")}>{t("donationsTab")}</button>
        <button className={tab === "summary" ? "primaryAction" : "secondaryAction"} type="button" onClick={() => onTabChange?.("summary")}>{t("summaryTab")}</button>
      </div>

      {canManage && (
        <form
          className="inlineForm"
          onSubmit={async (e) => {
            e.preventDefault();
            setError("");
            if (!categoryName) return;
            try {
              await financeApi.createCategory(categoryName);
              setCategoryName("");
              await loadCategories();
            } catch (err: any) {
              setError(err.response?.data?.detail ?? t("failedAddCategory"));
            }
          }}
        >
          <label>{t("categoryNameLabel")}<Input required value={categoryName} onChange={(e) => setCategoryName(e.target.value)} placeholder={t("tuitionExample")} /></label>
          <div className="formActions"><button className="primaryAction" type="submit"><Plus size={16} /> {t("addCategoryBtn")}</button></div>
        </form>
      )}
      {error && <p className="notice" style={{ color: "var(--rose)" }}>{error}</p>}

      {isLoading && <LoadingState />}
      {!isLoading && loadError && <ErrorState message={loadError} />}
      {!isLoading && !loadError && (
        <>
          {tab === "contributions" && <ContributionsTab categories={categories} canManage={canManage} />}
          {tab === "donations" && <DonationsTab categories={categories} canManage={canManage} />}
          {tab === "summary" && <SummaryTab />}
        </>
      )}
    </section>
  );
}

function ContributionsTab({ categories, canManage }: Readonly<{ categories: PaymentCategory[]; canManage: boolean }>) {
  const { t } = useTranslation();
  const [payments, setPayments] = useState<Payment[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [classes, setClasses] = useState<AcademicClass[]>([]);
  const [studentSearch, setStudentSearch] = useState("");
  const [filters, setFilters] = useState({ class_id: "", category_id: "", date_from: "", date_to: "" });
  const [form, setForm] = useState({ student_id: "", category_id: "", amount: "", payment_date: "", note: "" });
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  const load = async () => {
    setIsLoading(true);
    try {
      setPayments(await financeApi.listPayments({
        class_id: filters.class_id || undefined,
        category_id: filters.category_id || undefined,
        date_from: filters.date_from || undefined,
        date_to: filters.date_to || undefined,
      }));
      setError("");
    } catch (err: any) {
      setError(err.response?.data?.detail ?? t("failedLoadContributions"));
    } finally {
      setIsLoading(false);
    }
  };
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters]);
  useEffect(() => {
    void peopleApi.listStudents().then(setStudents);
    void academicsApi.listClasses().then(setClasses).catch(() => setClasses([]));
  }, []);

  const matchingStudents = useMemo(() => {
    const query = studentSearch.trim().toLowerCase();
    if (!query) return students;
    return students.filter((student) => (
      student.name.toLowerCase().includes(query) || student.admission_number.toLowerCase().includes(query)
    ));
  }, [studentSearch, students]);

  return (
    <>
      <div className="filterBar">
        <Select value={filters.class_id} onChange={(e) => setFilters({ ...filters, class_id: e.target.value })}>
          <option value="">{t("allClasses")}</option>
          {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
        <Select value={filters.category_id} onChange={(e) => setFilters({ ...filters, category_id: e.target.value })}>
          <option value="">{t("allCategories")}</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
        <Input type="date" value={filters.date_from} onChange={(e) => setFilters({ ...filters, date_from: e.target.value })} />
        <Input type="date" value={filters.date_to} onChange={(e) => setFilters({ ...filters, date_to: e.target.value })} />
      </div>
      {canManage && (
        <form
          className="inlineForm"
          onSubmit={async (e) => {
            e.preventDefault();
            setError("");
            const { student_id, category_id, amount, payment_date } = form;
            if (!student_id || !category_id || !amount || !payment_date) return;
            try {
              await financeApi.createPayment({ student_id, category_id, amount: Number(amount), payment_date, note: form.note || undefined });
              setForm({ student_id: "", category_id: "", amount: "", payment_date: "", note: "" });
              setStudentSearch("");
              await load();
            } catch (err: any) {
              setError(err.response?.data?.detail ?? t("failedRecordPayment"));
            }
          }}
        >
          <SearchDropdown
            id="contribution-student"
            label={t("studentCol")}
            placeholder={t("studentSearchPlaceholder")}
            items={matchingStudents}
            value={studentSearch}
            getKey={(student) => student.id}
            getLabel={(student) => student.name}
            getDescription={(student) => student.admission_number}
            onQueryChange={(query) => {
              setStudentSearch(query);
              setForm({ ...form, student_id: "" });
            }}
            onSelect={(student) => {
              setStudentSearch(`${student.name} (${student.admission_number})`);
              setForm({ ...form, student_id: student.id });
            }}
            emptyLabel={t("noStudentsFound")}
          />
          <label>
            {t("categoryCol")}
            <Select required value={form.category_id} onChange={(e) => setForm({ ...form, category_id: e.target.value })}>
              <option value="">{t("selectEllipsis")}</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </label>
          <label>{t("amountCol")}<Input required type="number" min={0} value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></label>
          <label>{t("dateCol")}<Input required type="date" value={form.payment_date} onChange={(e) => setForm({ ...form, payment_date: e.target.value })} /></label>
          <label>{t("notesLabel")}<Input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} /></label>
          <div className="formActions"><button className="primaryAction" type="submit"><Plus size={16} /> {t("recordPaymentBtn")}</button></div>
        </form>
      )}
      {!isLoading && error && <ErrorState message={error} />}
      <div className="dataTable">
        <div className="dataRow header"><span>{t("studentCol")}</span><span>{t("categoryCol")}</span><span>{t("amountCol")}</span><span>{t("dateCol")}</span><span>{t("notesLabel")}</span><span>{t("receiptCol")}</span></div>
        {isLoading && <LoadingState />}
        {!isLoading && !error && payments.length === 0 && <p className="emptyState">{t("noContributionsYet")}</p>}
        {!isLoading && !error && payments.map((p) => (
          <div className="dataRow" key={p.id}>
            <span>{p.student_name ?? t("unknownPersonLabel")}</span>
            <span>{p.category_name ?? t("unknownLabel")}</span>
            <span>{p.currency} {p.amount}</span>
            <span>{p.payment_date}<HijriTag date={p.payment_date} /></span>
            <span>{p.note ?? "—"}</span>
            <span>
              <button className="tableAction" type="button" onClick={() => void financeApi.downloadPaymentReceipt(p.id)}>
                <FileDown size={14} /> PDF
              </button>
              {canManage && (
                <button
                  className="tableAction"
                  type="button"
                  onClick={async () => {
                    try {
                      const link = await financeApi.sharePaymentReceipt(p.id);
                      window.open(link.url, "_blank", "noopener,noreferrer");
                    } catch (err: any) {
                      setError(err.response?.data?.detail ?? t("failedShareReceipt"));
                    }
                  }}
                >
                  <MessageCircle size={14} /> WhatsApp
                </button>
              )}
            </span>
          </div>
        ))}
      </div>
    </>
  );
}

function DonationsTab({ categories, canManage }: Readonly<{ categories: PaymentCategory[]; canManage: boolean }>) {
  const { t } = useTranslation();
  const [donors, setDonors] = useState<Donor[]>([]);
  const [donations, setDonations] = useState<Donation[]>([]);
  const [donorForm, setDonorForm] = useState({ name: "", contact: "" });
  const [donorSearch, setDonorSearch] = useState("");
  const [form, setForm] = useState({ donor_id: "", category_id: "", amount: "", donation_date: "", note: "" });
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  const load = async () => {
    setIsLoading(true);
    try {
      setDonors(await financeApi.listDonors());
      setDonations(await financeApi.listDonations());
      setError("");
    } catch (err: any) {
      setError(err.response?.data?.detail ?? t("failedLoadDonations"));
    } finally {
      setIsLoading(false);
    }
  };
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const matchingDonors = useMemo(() => {
    const query = donorSearch.trim().toLowerCase();
    if (!query) return donors;
    return donors.filter((donor) => (
      donor.name.toLowerCase().includes(query) || donor.contact.toLowerCase().includes(query)
    ));
  }, [donorSearch, donors]);

  return (
    <>
      {canManage && (
        <form
          className="inlineForm"
          onSubmit={async (e) => {
            e.preventDefault();
            setError("");
            if (!donorForm.name || !donorForm.contact) return;
            try {
              await financeApi.createDonor(donorForm);
              setDonorForm({ name: "", contact: "" });
              await load();
            } catch (err: any) {
              setError(err.response?.data?.detail ?? t("failedAddDonor"));
            }
          }}
        >
          <label>{t("donorNameLabel")}<Input required value={donorForm.name} onChange={(e) => setDonorForm({ ...donorForm, name: e.target.value })} /></label>
          <label>{t("contactCol")}<Input required value={donorForm.contact} onChange={(e) => setDonorForm({ ...donorForm, contact: e.target.value })} /></label>
          <div className="formActions"><button className="primaryAction" type="submit"><Plus size={16} /> {t("addDonorBtn")}</button></div>
        </form>
      )}

      {canManage && (
        <form
          className="inlineForm"
          onSubmit={async (e) => {
            e.preventDefault();
            setError("");
            const { donor_id, category_id, amount, donation_date } = form;
            if (!donor_id || !category_id || !amount || !donation_date) return;
            try {
              await financeApi.createDonation({ donor_id, category_id, amount: Number(amount), donation_date, note: form.note || undefined });
              setForm({ donor_id: "", category_id: "", amount: "", donation_date: "", note: "" });
              setDonorSearch("");
              await load();
            } catch (err: any) {
              setError(err.response?.data?.detail ?? t("failedRecordPayment"));
            }
          }}
        >
          <SearchDropdown
            id="donation-donor"
            label={t("donorCol")}
            placeholder={t("donorSearchPlaceholder")}
            items={matchingDonors}
            value={donorSearch}
            getKey={(donor) => donor.id}
            getLabel={(donor) => donor.name}
            getDescription={(donor) => donor.contact}
            onQueryChange={(query) => {
              setDonorSearch(query);
              setForm({ ...form, donor_id: "" });
            }}
            onSelect={(donor) => {
              setDonorSearch(`${donor.name} (${donor.contact})`);
              setForm({ ...form, donor_id: donor.id });
            }}
            emptyLabel={t("noDonorsYet")}
          />
          <label>
            {t("categoryCol")}
            <Select required value={form.category_id} onChange={(e) => setForm({ ...form, category_id: e.target.value })}>
              <option value="">{t("selectEllipsis")}</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </label>
          <label>{t("amountCol")}<Input required type="number" min={0} value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></label>
          <label>{t("dateCol")}<Input required type="date" value={form.donation_date} onChange={(e) => setForm({ ...form, donation_date: e.target.value })} /></label>
          <label>{t("notesLabel")}<Input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} /></label>
          <div className="formActions"><button className="primaryAction" type="submit"><Plus size={16} /> {t("recordDonationBtn")}</button></div>
        </form>
      )}
      {!isLoading && error && <ErrorState message={error} />}
      <div className="dataTable">
        <div className="dataRow header"><span>{t("donorCol")}</span><span>{t("categoryCol")}</span><span>{t("amountCol")}</span><span>{t("dateCol")}</span><span>{t("notesLabel")}</span><span>{t("receiptCol")}</span></div>
        {isLoading && <LoadingState />}
        {!isLoading && !error && donations.length === 0 && <p className="emptyState">{t("noDonationsYet")}</p>}
        {!isLoading && !error && donations.map((d) => (
          <div className="dataRow" key={d.id}>
            <span>{d.donor_name ?? t("unknownPersonLabel")}</span>
            <span>{d.category_name ?? t("unknownLabel")}</span>
            <span>{d.currency} {d.amount}</span>
            <span>{d.donation_date}<HijriTag date={d.donation_date} /></span>
            <span>{d.note ?? "—"}</span>
            <span>
              <button className="tableAction" type="button" onClick={() => void financeApi.downloadDonationReceipt(d.id)}>
                <FileDown size={14} /> PDF
              </button>
              {canManage && (
                <button
                  className="tableAction"
                  type="button"
                  onClick={async () => {
                    try {
                      const link = await financeApi.shareDonationReceipt(d.id);
                      window.open(link.url, "_blank", "noopener,noreferrer");
                    } catch (err: any) {
                      setError(err.response?.data?.detail ?? t("failedShareReceipt"));
                    }
                  }}
                >
                  <MessageCircle size={14} /> WhatsApp
                </button>
              )}
            </span>
          </div>
        ))}
      </div>
    </>
  );
}

function SummaryTab() {
  const { t } = useTranslation();
  const [range, setRange] = useState({ date_from: "", date_to: "" });
  const [summary, setSummary] = useState<FinanceSummary | null>(null);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  const load = async () => {
    setError("");
    setIsLoading(true);
    try {
      setSummary(await financeApi.summary({ date_from: range.date_from || undefined, date_to: range.date_to || undefined }));
    } catch (err: any) {
      setError(err.response?.data?.detail ?? t("failedLoadSummary"));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <div className="inlineForm">
        <label>{t("fromLabel")}<Input type="date" value={range.date_from} onChange={(e) => setRange({ ...range, date_from: e.target.value })} /></label>
        <label>{t("toLabel")}<Input type="date" value={range.date_to} onChange={(e) => setRange({ ...range, date_to: e.target.value })} /></label>
        <div className="formActions"><button className="secondaryAction" type="button" onClick={load}>{t("refreshBtn")}</button></div>
      </div>
      {isLoading && <LoadingState />}
      {!isLoading && error && <ErrorState message={error} />}
      {!isLoading && !error && summary && (
        <>
          <div className="metricsRow" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12, marginBottom: 16 }}>
            <div className="metricCard"><span>{t("contributionsTab")}</span><strong>{summary.total_contributions}</strong></div>
            <div className="metricCard"><span>{t("donationsTab")}</span><strong>{summary.total_donations}</strong></div>
            <div className="metricCard"><span>{t("totalLabel")}</span><strong>{summary.total}</strong></div>
          </div>
          <div className="dataTable">
            <div className="dataRow header"><span>{t("categoryCol")}</span><span>{t("amountCol")}</span></div>
            {Object.entries(summary.by_category).map(([name, amount]) => (
              <div className="dataRow" key={name}><span>{name}</span><span>{amount}</span></div>
            ))}
          </div>
        </>
      )}
    </>
  );
}
