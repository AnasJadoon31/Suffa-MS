import { Button } from "./ui/Button";
import { useEffect, useMemo, useRef, useState } from "react";
import { FileDown, Landmark, MessageCircle, Plus } from "lucide-react";
import { useTranslation } from "react-i18next";
import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import { styled } from "@mui/material/styles";

import { academicsApi, financeApi, type AcademicClass, type Donation, type Donor, type Payment, type PaymentCategory, type FinanceSummary, type StudentFinanceProfile, type DonorFinanceProfile } from "../lib/endpoints";
import { peopleApi, type Student } from "../lib/endpoints";
import { useAuth } from "../lib/AuthContext";
import { HijriTag } from "./HijriTag";
import { SearchDropdown } from "./SearchDropdown";
import { Input, Select } from "./ui/Field";
import { ErrorState, LoadingState } from "./ui/AsyncState";
import { Modal, FormModal } from "./ui/Modal";
import { PageSection, PageHeader } from "./ui/Layout";
import { MetricGrid, MetricCard } from "./ui/Card";
import { useSessionReadOnly } from "./SessionSwitcher";
import { ActionMenu } from "./ui/ActionMenu";
import { DataCard, type DataField } from "./ui/DataCard";
import { DataViewToggle, type ViewMode } from "./ui/DataViewToggle";
import { FilterBar } from "./ui/FilterBar";


const StyledPageSection = styled(PageSection)(() => ({
  position: "relative",
}));

const ToolbarRow = styled(Box)(({ theme }) => ({
  display: "flex",
  alignItems: "center",
  gap: theme.spacing(1),
  marginBottom: theme.spacing(2),
  flexWrap: "wrap",
}));

const CardsList = styled(Box)(() => ({
  display: "flex",
  flexDirection: "column",
}));

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
  const [showCategory, setShowCategory] = useState(false);

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
    <StyledPageSection>
      <PageHeader
        title={t("financeTitle")}
        notice={t("financeSubtitle")}
      />
      <FilterBar
        fields={[{
          key: "finance-tab",
          type: "select",
          value: tab,
          ariaLabel: t("financeSectionsLabel"),
          options: [
            { value: "contributions", label: t("contributionsTab") },
            { value: "donations", label: t("donationsTab") },
            { value: "summary", label: t("summaryTab") },
          ],
          onChange: (value) => onTabChange?.(value as FinanceTab),
        }]}
      >
        {canManage && tab !== "summary" && (
          <Button className="secondaryAction" type="button" onClick={() => setShowCategory(true)}>
            <Plus size={16} /> {t("addCategoryBtn")}
          </Button>
        )}
      </FilterBar>
      {canManage && showCategory && (
        <FormModal
                title={t("addCategoryBtn")} onClose={() => setShowCategory(false)}
                onSubmit={async (e) => {
                          e.preventDefault();
                          setError("");
                          if (!categoryName) return;
                          try {
                            await financeApi.createCategory(categoryName);
                            setCategoryName("");
                            setShowCategory(false);
                            await loadCategories();
                          } catch (err: any) {
                            setError(err.response?.data?.detail ?? t("failedAddCategory"));
                          }
                        }}
                submitLabel={t("addCategoryBtn")}
                submitIcon={<Plus size={16} />}
              >
                <label>{t("categoryNameLabel")}<Input required value={categoryName} onChange={(e) => setCategoryName(e.target.value)} placeholder={t("tuitionExample")} /></label>
              </FormModal>
      )}
      {error && <p style={{ color: "var(--rose)" }}>{error}</p>}

      {isLoading && <LoadingState />}
      {!isLoading && loadError && <ErrorState message={loadError} />}
      {!isLoading && !loadError && (
        <>
          {tab === "contributions" && <ContributionsTab categories={categories} canManage={canManage} />}
          {tab === "donations" && <DonationsTab categories={categories} canManage={canManage} />}
          {tab === "summary" && <SummaryTab />}
        </>
      )}
    </StyledPageSection>
  );
}

function ContributionsTab({ categories, canManage }: Readonly<{ categories: PaymentCategory[]; canManage: boolean }>) {
  const { t } = useTranslation();
  const [payments, setPayments] = useState<Payment[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [classes, setClasses] = useState<AcademicClass[]>([]);
  const [studentSearch, setStudentSearch] = useState("");
  const [recordSearch, setRecordSearch] = useState("");
  const [filters, setFilters] = useState({ class_id: "", category_id: "", date_from: "", date_to: "" });
  const [form, setForm] = useState({ student_id: "", category_id: "", amount: "", payment_date: "", note: "" });
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [profile, setProfile] = useState<StudentFinanceProfile | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("cards");
  const paymentLoadSequence = useRef(0);

  const load = async () => {
    const requestId = ++paymentLoadSequence.current;
    setIsLoading(true);
    try {
      const nextPayments = await financeApi.listPayments({
        class_id: filters.class_id || undefined,
        category_id: filters.category_id || undefined,
        date_from: filters.date_from || undefined,
        date_to: filters.date_to || undefined,
      });
      if (requestId === paymentLoadSequence.current) {
        setPayments(nextPayments);
        setError("");
      }
    } catch (err: any) {
      if (requestId === paymentLoadSequence.current) {
        setError(err.response?.data?.detail ?? t("failedLoadContributions"));
      }
    } finally {
      if (requestId === paymentLoadSequence.current) setIsLoading(false);
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
  const visiblePayments = useMemo(() => {
    const query = recordSearch.trim().toLowerCase();
    if (!query) return payments;
    return payments.filter((payment) => [
      payment.student_name, payment.category_name, payment.note, payment.amount, payment.currency,
    ].some((value) => String(value ?? "").toLowerCase().includes(query)));
  }, [payments, recordSearch]);
  const hasFilters = Boolean(recordSearch || filters.class_id || filters.category_id || filters.date_from || filters.date_to);

  const paymentFields = (p: Payment): DataField[] => [
    { label: t("studentCol"), value: p.student_name ?? t("deletedPersonLabel") },
    { label: t("categoryCol"), value: p.category_name ?? t("unknownLabel") },
    { label: t("amountCol"), value: `${p.currency} ${p.amount}` },
    { label: t("dateCol"), value: p.payment_date },
    { label: t("notesLabel"), value: p.note ?? "—" },
  ];

  return (
    <>
      <FilterBar
        searchValue={recordSearch}
        onSearchChange={setRecordSearch}
        searchPlaceholder={t("searchContributionsPlaceholder")}
        fields={[
          { key: "class", type: "select", value: filters.class_id, ariaLabel: t("classCol"), placeholder: t("allClasses"), options: classes.map((c) => ({ value: c.id, label: c.name })), onChange: (value) => setFilters({ ...filters, class_id: value }) },
          { key: "category", type: "select", value: filters.category_id, ariaLabel: t("categoryCol"), placeholder: t("allCategories"), options: categories.map((c) => ({ value: c.id, label: c.name })), onChange: (value) => setFilters({ ...filters, category_id: value }) },
          { key: "date-from", type: "date", label: t("fromLabel"), value: filters.date_from, onChange: (value) => setFilters({ ...filters, date_from: value }) },
          { key: "date-to", type: "date", label: t("toLabel"), value: filters.date_to, onChange: (value) => setFilters({ ...filters, date_to: value }) },
        ]}
        onClearAll={() => { setRecordSearch(""); setFilters({ class_id: "", category_id: "", date_from: "", date_to: "" }); }}
      >
        <DataViewToggle viewKey="finance-contributions" onChange={setViewMode} />
        {canManage && (
          <Button className="primaryAction" type="button" onClick={() => setShowCreate(true)}>
            <Plus size={16} /> {t("recordPaymentBtn")}
          </Button>
        )}
      </FilterBar>
      {canManage && showCreate && (
        <FormModal
                title={t("recordPaymentBtn")} onClose={() => setShowCreate(false)}
                onSubmit={async (e) => {
                          e.preventDefault();
                          setError("");
                          const { student_id, category_id, amount, payment_date } = form;
                          if (!student_id || !category_id || !amount || !payment_date) return;
                          try {
                            await financeApi.createPayment({ student_id, category_id, amount: Number(amount), payment_date, note: form.note || undefined });
                            setForm({ student_id: "", category_id: "", amount: "", payment_date: "", note: "" });
                            setStudentSearch("");
                            setShowCreate(false);
                            await load();
                          } catch (err: any) {
                            setError(err.response?.data?.detail ?? t("failedRecordPayment"));
                          }
                        }}
                submitLabel={t("recordPaymentBtn")}
                submitIcon={<Plus size={16} />}
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
              </FormModal>
      )}
      {!isLoading && error && <ErrorState message={error} />}

      {viewMode === "cards" ? (
        <CardsList>
          {isLoading && <LoadingState />}
          {!isLoading && !error && visiblePayments.length === 0 && <p>{t("noContributionsYet")}</p>}
          {!isLoading && !error && visiblePayments.map((p) => (
            <DataCard
              key={p.id}
              title={p.student_name ?? t("deletedPersonLabel")}
              subtitle={`${p.currency} ${p.amount}`}
              fields={paymentFields(p)}
              actions={
                <ActionMenu items={[
                  { label: t("downloadReceiptLabel"), icon: <FileDown size={14} />, onClick: () => financeApi.downloadPaymentReceipt(p.id) },
                  ...(canManage ? [{
                    label: t("shareWhatsAppLabel"),
                    icon: <MessageCircle size={14} />,
                    onClick: async () => {
                      try {
                        const link = await financeApi.sharePaymentReceipt(p.id);
                        if (link.url) window.open(link.url, "_blank", "noopener,noreferrer");
                      } catch (err: any) {
                        setError(err.response?.data?.detail ?? t("failedShareReceipt"));
                      }
                    },
                  }] : []),
                ]} ariaLabel={`${t("actionsCol")}: ${p.student_name ?? t("deletedPersonLabel")}`} />
              }
            />
          ))}
        </CardsList>
      ) : (
        <Box sx={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left", padding: "12px", borderBottom: "2px solid #e0e6df" }}>{t("studentCol")}</th>
                <th style={{ textAlign: "left", padding: "12px", borderBottom: "2px solid #e0e6df" }}>{t("categoryCol")}</th>
                <th style={{ textAlign: "left", padding: "12px", borderBottom: "2px solid #e0e6df" }}>{t("amountCol")}</th>
                <th style={{ textAlign: "left", padding: "12px", borderBottom: "2px solid #e0e6df" }}>{t("dateCol")}</th>
                <th style={{ textAlign: "left", padding: "12px", borderBottom: "2px solid #e0e6df" }}>{t("notesLabel")}</th>
                <th style={{ textAlign: "left", padding: "12px", borderBottom: "2px solid #e0e6df" }}>{t("receiptCol")}</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr><td colSpan={6}><LoadingState /></td></tr>
              )}
              {!isLoading && !error && visiblePayments.length === 0 && (
                <tr><td colSpan={6}><p>{t("noContributionsYet")}</p></td></tr>
              )}
              {!isLoading && !error && visiblePayments.map((p) => (
                <tr key={p.id}>
                  <td style={{ padding: "12px", borderBottom: "1px solid #e0e6df" }}>
                    <Button className="secondaryAction" type="button" onClick={() => void financeApi.studentProfile(p.student_id).then(setProfile).catch((err: any) => setError(err.response?.data?.detail ?? t("failedLoadContributions")))}>
                      {p.student_name ?? t("deletedPersonLabel")}
                    </Button>
                  </td>
                  <td style={{ padding: "12px", borderBottom: "1px solid #e0e6df" }}>{p.category_name ?? t("unknownLabel")}</td>
                  <td style={{ padding: "12px", borderBottom: "1px solid #e0e6df" }}>{p.currency} {p.amount}</td>
                  <td style={{ padding: "12px", borderBottom: "1px solid #e0e6df" }}>{p.payment_date}<HijriTag date={p.payment_date} /></td>
                  <td style={{ padding: "12px", borderBottom: "1px solid #e0e6df" }}>{p.note ?? "—"}</td>
                  <td style={{ padding: "12px", borderBottom: "1px solid #e0e6df" }}>
                    <ActionMenu items={[
                      { label: t("downloadReceiptLabel"), icon: <FileDown size={14} />, onClick: () => financeApi.downloadPaymentReceipt(p.id) },
                      ...(canManage ? [{
                        label: t("shareWhatsAppLabel"),
                        icon: <MessageCircle size={14} />,
                        onClick: async () => {
                          try {
                            const link = await financeApi.sharePaymentReceipt(p.id);
                            if (link.url) window.open(link.url, "_blank", "noopener,noreferrer");
                          } catch (err: any) {
                            setError(err.response?.data?.detail ?? t("failedShareReceipt"));
                          }
                        },
                      }] : []),
                    ]} ariaLabel={`${t("actionsCol")}: ${p.student_name ?? t("deletedPersonLabel")}`} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Box>
      )}
      {profile && (
        <Modal title={profile.name} onClose={() => setProfile(null)}>
          <Box sx={{ p: 3 }}>
            <Box component="dl" sx={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "4px 16px" }}>
              <dt>{t("admissionNumberCol")}</dt><dd>{profile.admission_number}</dd>
              <dt>{t("phoneCol")}</dt><dd>{profile.phone || "—"}</dd>
              <dt>{t("addressCol")}</dt><dd>{profile.address || "—"}</dd>
            </Box>
            <h4>{t("completePaymentHistoryLabel")}</h4>
            <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
              {profile.payments.length === 0 && <p>{t("noContributionsYet")}</p>}
              {profile.payments.map((payment) => (
                <Paper key={payment.id} variant="outlined" sx={{ p: 1.5 }}>
                  <Box sx={{ display: "flex", justifyContent: "space-between" }}>
                    <span>{payment.payment_date}</span>
                    <strong>{payment.currency} {payment.amount}</strong>
                  </Box>
                  <small>{payment.category_name ?? t("unknownLabel")} · {payment.note ?? "—"}</small>
                </Paper>
              ))}
            </Box>
          </Box>
        </Modal>
      )}
    </>
  );
}

function DonationsTab({ categories, canManage }: Readonly<{ categories: PaymentCategory[]; canManage: boolean }>) {
  const { t } = useTranslation();
  const [donors, setDonors] = useState<Donor[]>([]);
  const [donations, setDonations] = useState<Donation[]>([]);
  const [donorForm, setDonorForm] = useState({ name: "", contact: "" });
  const [donorSearch, setDonorSearch] = useState("");
  const [recordSearch, setRecordSearch] = useState("");
  const [filters, setFilters] = useState({ donor_id: "", category_id: "", date_from: "", date_to: "" });
  const [form, setForm] = useState({ donor_id: "", category_id: "", amount: "", donation_date: "", note: "" });
  const [error, setError] = useState("");
  const [donorLoadError, setDonorLoadError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [createModal, setCreateModal] = useState<"donor" | "donation" | null>(null);
  const [profile, setProfile] = useState<DonorFinanceProfile | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("cards");
  const donationLoadSequence = useRef(0);

  const loadDonors = async () => {
    try {
      setDonors(await financeApi.listDonors());
      setDonorLoadError("");
    } catch (err: any) {
      setDonorLoadError(err.response?.data?.detail ?? t("failedLoadDonors"));
    }
  };
  const loadDonations = async () => {
    const requestId = ++donationLoadSequence.current;
    setIsLoading(true);
    try {
      const nextDonations = await financeApi.listDonations({
        donor_id: filters.donor_id || undefined,
        category_id: filters.category_id || undefined,
        date_from: filters.date_from || undefined,
        date_to: filters.date_to || undefined,
      });
      if (requestId === donationLoadSequence.current) {
        setDonations(nextDonations);
        setError("");
      }
    } catch (err: any) {
      if (requestId === donationLoadSequence.current) {
        setError(err.response?.data?.detail ?? t("failedLoadDonations"));
      }
    } finally {
      if (requestId === donationLoadSequence.current) setIsLoading(false);
    }
  };
  useEffect(() => {
    void loadDonors();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    void loadDonations();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.donor_id, filters.category_id, filters.date_from, filters.date_to]);

  const matchingDonors = useMemo(() => {
    const query = donorSearch.trim().toLowerCase();
    if (!query) return donors;
    return donors.filter((donor) => (
      donor.name.toLowerCase().includes(query) || donor.contact.toLowerCase().includes(query)
    ));
  }, [donorSearch, donors]);
  const visibleDonations = useMemo(() => {
    const query = recordSearch.trim().toLowerCase();
    if (!query) return donations;
    return donations.filter((donation) => [
      donation.donor_name, donation.category_name, donation.note, donation.amount, donation.currency,
    ].some((value) => String(value ?? "").toLowerCase().includes(query)));
  }, [donations, recordSearch]);
  const hasFilters = Boolean(recordSearch || filters.donor_id || filters.category_id || filters.date_from || filters.date_to);

  const donationFields = (d: Donation): DataField[] => [
    { label: t("donorCol"), value: d.donor_name ?? t("deletedPersonLabel") },
    { label: t("categoryCol"), value: d.category_name ?? t("unknownLabel") },
    { label: t("amountCol"), value: `${d.currency} ${d.amount}` },
    { label: t("dateCol"), value: d.donation_date },
    { label: t("notesLabel"), value: d.note ?? "—" },
  ];

  return (
    <>
      <FilterBar
        searchValue={recordSearch}
        onSearchChange={setRecordSearch}
        searchPlaceholder={t("searchDonationsPlaceholder")}
        fields={[
          { key: "donor", type: "select", value: filters.donor_id, ariaLabel: t("donorCol"), placeholder: t("allDonors"), options: donors.map((donor) => ({ value: donor.id, label: donor.name })), onChange: (value) => setFilters({ ...filters, donor_id: value }) },
          { key: "category", type: "select", value: filters.category_id, ariaLabel: t("categoryCol"), placeholder: t("allCategories"), options: categories.map((category) => ({ value: category.id, label: category.name })), onChange: (value) => setFilters({ ...filters, category_id: value }) },
          { key: "date-from", type: "date", label: t("fromLabel"), value: filters.date_from, onChange: (value) => setFilters({ ...filters, date_from: value }) },
          { key: "date-to", type: "date", label: t("toLabel"), value: filters.date_to, onChange: (value) => setFilters({ ...filters, date_to: value }) },
        ]}
        onClearAll={() => { setRecordSearch(""); setFilters({ donor_id: "", category_id: "", date_from: "", date_to: "" }); }}
      >
        <DataViewToggle viewKey="finance-donations" onChange={setViewMode} />
        {canManage && (
          <Button className="secondaryAction" type="button" onClick={() => setCreateModal("donor")}><Plus size={16} /> {t("addDonorBtn")}</Button>
        )}
        {canManage && (
          <Button className="primaryAction" type="button" onClick={() => setCreateModal("donation")}><Plus size={16} /> {t("recordDonationBtn")}</Button>
        )}
      </FilterBar>
      {canManage && createModal === "donor" && (
        <FormModal
                title={t("addDonorBtn")} onClose={() => setCreateModal(null)}
                onSubmit={async (e) => {
                          e.preventDefault();
                          setError("");
                          if (!donorForm.name || !donorForm.contact) return;
                          try {
                            await financeApi.createDonor(donorForm);
                            setDonorForm({ name: "", contact: "" });
                            setCreateModal(null);
                            await Promise.all([loadDonors(), loadDonations()]);
                          } catch (err: any) {
                            setError(err.response?.data?.detail ?? t("failedAddDonor"));
                          }
                        }}
                submitLabel={t("addDonorBtn")}
                submitIcon={<Plus size={16} />}
              >
                <label>{t("donorNameLabel")}<Input required value={donorForm.name} onChange={(e) => setDonorForm({ ...donorForm, name: e.target.value })} /></label>

              <label>{t("contactCol")}<Input required value={donorForm.contact} onChange={(e) => setDonorForm({ ...donorForm, contact: e.target.value })} /></label>
              </FormModal>
      )}

      {canManage && createModal === "donation" && (
        <FormModal
                title={t("recordDonationBtn")} onClose={() => setCreateModal(null)}
                onSubmit={async (e) => {
                          e.preventDefault();
                          setError("");
                          const { donor_id, category_id, amount, donation_date } = form;
                          if (!donor_id || !category_id || !amount || !donation_date) return;
                          try {
                            await financeApi.createDonation({ donor_id, category_id, amount: Number(amount), donation_date, note: form.note || undefined });
                            setForm({ donor_id: "", category_id: "", amount: "", donation_date: "", note: "" });
                            setDonorSearch("");
                            setCreateModal(null);
                            await loadDonations();
                          } catch (err: any) {
                            setError(err.response?.data?.detail ?? t("failedRecordPayment"));
                          }
                        }}
                submitLabel={t("recordDonationBtn")}
                submitIcon={<Plus size={16} />}
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
              </FormModal>
      )}
      {donorLoadError && <ErrorState message={donorLoadError} />}
      {!isLoading && error && <ErrorState message={error} />}

      {viewMode === "cards" ? (
        <CardsList>
          {isLoading && <LoadingState />}
          {!isLoading && !error && visibleDonations.length === 0 && <p>{t("noDonationsYet")}</p>}
          {!isLoading && !error && visibleDonations.map((d) => (
            <DataCard
              key={d.id}
              title={d.donor_name ?? t("deletedPersonLabel")}
              subtitle={`${d.currency} ${d.amount}`}
              fields={donationFields(d)}
              actions={
                <ActionMenu items={[
                  { label: t("downloadReceiptLabel"), icon: <FileDown size={14} />, onClick: () => financeApi.downloadDonationReceipt(d.id) },
                  ...(canManage ? [{
                    label: t("shareWhatsAppLabel"),
                    icon: <MessageCircle size={14} />,
                    onClick: async () => {
                      try {
                        const link = await financeApi.shareDonationReceipt(d.id);
                        if (link.url) window.open(link.url, "_blank", "noopener,noreferrer");
                      } catch (err: any) {
                        setError(err.response?.data?.detail ?? t("failedShareReceipt"));
                      }
                    },
                  }] : []),
                ]} ariaLabel={`${t("actionsCol")}: ${d.donor_name ?? t("deletedPersonLabel")}`} />
              }
            />
          ))}
        </CardsList>
      ) : (
        <Box sx={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left", padding: "12px", borderBottom: "2px solid #e0e6df" }}>{t("donorCol")}</th>
                <th style={{ textAlign: "left", padding: "12px", borderBottom: "2px solid #e0e6df" }}>{t("categoryCol")}</th>
                <th style={{ textAlign: "left", padding: "12px", borderBottom: "2px solid #e0e6df" }}>{t("amountCol")}</th>
                <th style={{ textAlign: "left", padding: "12px", borderBottom: "2px solid #e0e6df" }}>{t("dateCol")}</th>
                <th style={{ textAlign: "left", padding: "12px", borderBottom: "2px solid #e0e6df" }}>{t("notesLabel")}</th>
                <th style={{ textAlign: "left", padding: "12px", borderBottom: "2px solid #e0e6df" }}>{t("receiptCol")}</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr><td colSpan={6}><LoadingState /></td></tr>
              )}
              {!isLoading && !error && visibleDonations.length === 0 && (
                <tr><td colSpan={6}><p>{t("noDonationsYet")}</p></td></tr>
              )}
              {!isLoading && !error && visibleDonations.map((d) => (
                <tr key={d.id}>
                  <td style={{ padding: "12px", borderBottom: "1px solid #e0e6df" }}>
                    <Button className="secondaryAction" type="button" onClick={() => void financeApi.donorProfile(d.donor_id).then(setProfile).catch((err: any) => setError(err.response?.data?.detail ?? t("failedLoadDonations")))}>
                      {d.donor_name ?? t("deletedPersonLabel")}
                    </Button>
                  </td>
                  <td style={{ padding: "12px", borderBottom: "1px solid #e0e6df" }}>{d.category_name ?? t("unknownLabel")}</td>
                  <td style={{ padding: "12px", borderBottom: "1px solid #e0e6df" }}>{d.currency} {d.amount}</td>
                  <td style={{ padding: "12px", borderBottom: "1px solid #e0e6df" }}>{d.donation_date}<HijriTag date={d.donation_date} /></td>
                  <td style={{ padding: "12px", borderBottom: "1px solid #e0e6df" }}>{d.note ?? "—"}</td>
                  <td style={{ padding: "12px", borderBottom: "1px solid #e0e6df" }}>
                    <ActionMenu items={[
                      { label: t("downloadReceiptLabel"), icon: <FileDown size={14} />, onClick: () => financeApi.downloadDonationReceipt(d.id) },
                      ...(canManage ? [{
                        label: t("shareWhatsAppLabel"),
                        icon: <MessageCircle size={14} />,
                        onClick: async () => {
                          try {
                            const link = await financeApi.shareDonationReceipt(d.id);
                            if (link.url) window.open(link.url, "_blank", "noopener,noreferrer");
                          } catch (err: any) {
                            setError(err.response?.data?.detail ?? t("failedShareReceipt"));
                          }
                        },
                      }] : []),
                    ]} ariaLabel={`${t("actionsCol")}: ${d.donor_name ?? t("deletedPersonLabel")}`} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Box>
      )}
      {profile && (
        <Modal title={profile.name} onClose={() => setProfile(null)}>
          <Box sx={{ p: 3 }}>
            <Box component="dl" sx={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "4px 16px" }}>
              <dt>{t("phoneCol")}</dt><dd>{profile.contact}</dd>
            </Box>
            <h4>{t("completeDonationHistoryLabel")}</h4>
            <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
              {profile.donations.length === 0 && <p>{t("noDonationsYet")}</p>}
              {profile.donations.map((donation) => (
                <Paper key={donation.id} variant="outlined" sx={{ p: 1.5 }}>
                  <Box sx={{ display: "flex", justifyContent: "space-between" }}>
                    <span>{donation.donation_date}</span>
                    <strong>{donation.currency} {donation.amount}</strong>
                  </Box>
                  <small>{donation.category_name ?? t("unknownLabel")} · {donation.note ?? "—"}</small>
                </Paper>
              ))}
            </Box>
          </Box>
        </Modal>
      )}
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
      <FilterBar
        fields={[
          { key: "summary-from", type: "date", label: t("fromLabel"), value: range.date_from, onChange: (value) => setRange({ ...range, date_from: value }) },
          { key: "summary-to", type: "date", label: t("toLabel"), value: range.date_to, onChange: (value) => setRange({ ...range, date_to: value }) },
        ]}
      >
        <Button className="secondaryAction" type="button" onClick={load}>{t("refreshBtn")}</Button>
      </FilterBar>
      {isLoading && <LoadingState />}
      {!isLoading && error && <ErrorState message={error} />}
      {!isLoading && !error && summary && (
        <Box>
          <MetricGrid aria-label={t("financeSummaryLabel", "Finance summary")}>
            <MetricCard title={t("contributionsTab")} value={summary.total_contributions} />
            <MetricCard title={t("donationsTab")} value={summary.total_donations} />
            <MetricCard title={t("totalLabel")} value={summary.total} />
          </MetricGrid>
          <Box sx={{ display: "flex", flexDirection: "column", gap: 1, mt: 2 }}>
            {Object.entries(summary.by_category).map(([name, amount]) => (
              <Paper key={name} variant="outlined" sx={{ p: 1.5, display: "flex", justifyContent: "space-between" }}>
                <span>{name}</span>
                <strong>{amount}</strong>
              </Paper>
            ))}
          </Box>
        </Box>
      )}
    </>
  );
}
