import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useSearch } from "@tanstack/react-router";
import { Download, HandCoins, Plus, Receipt, Wallet } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/app/AppShell";
import { FilterBar } from "@/components/app/FilterBar";
import { FormSheet } from "@/components/app/FormSheet";
import { MessageSendButton } from "@/components/app/MessageSendButton";
import {
  ActionButton,
  Card,
  EmptyState,
  Field,
  SectionTitle,
  CustomDropdown,
  SkeletonList,
  StatCard,
  TextInput,
} from "@/components/app/Primitives";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/mms/auth";
import { academicsApi, peopleApi } from "@/lib/mms/endpoints";
import { apiErrorMessage } from "@/lib/mms/api";
import { financeApi, financeMutations } from "@/lib/mms/more-endpoints";
import { useTranslation } from "react-i18next";
export const Route = createFileRoute("/finance")({
  validateSearch: (search: Record<string, unknown>) => ({
    tab: (search.tab as string) || undefined,
    donor_id: (search.donor_id as string) || undefined,
  }),
  head: () => ({
    meta: [
      { title: "Finance — Suffa MS" },
      { name: "description", content: "Fee contributions, donations and salary at a glance." },
      { property: "og:title", content: "Finance — Suffa MS" },
      {
        property: "og:description",
        content: "Fee contributions, donations and salary at a glance.",
      },
    ],
  }),
  component: FinancePage,
});

type Tab = "overview" | "payments" | "donations" | "salary";

function money(amount: number, currency?: string) {
  return `${currency ?? "PKR"} ${Number(amount ?? 0).toLocaleString()}`;
}

function FinancePage() {
    const { t } = useTranslation();
  const { user } = useAuth();
  const client = useQueryClient();
  const search = useSearch({ from: "/finance" });
  const canManage = user?.role === "principal" || user?.role === "super_admin" || user?.is_principal_delegate;
  const isTeacher = user?.role === "teacher";
  const [tab, setTab] = useState<Tab>((search.tab as Tab) || "overview");
  const today = new Date().toISOString().slice(0, 10);

  // shared date range filter
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  // payments filters
  const [paymentClassId, setPaymentClassId] = useState("");
  const [paymentCategoryId, setPaymentCategoryId] = useState("");
  const [paymentStudentId, setPaymentStudentId] = useState("");

  // donations filters
  const [donationDonorId, setDonationDonorId] = useState(search.donor_id || "");
  const [donationCategoryId, setDonationCategoryId] = useState("");

  const tabs: { key: Tab; label: string }[] = [
    { key: "overview", label: "Overview" },
    { key: "payments", label: "Payments" },
    { key: "donations", label: "Donations" },
    ...(isTeacher ? [{ key: "salary" as Tab, label: "My Salary" }] : []),
  ];

  const summary = useQuery({
    queryKey: ["finance-summary", dateFrom, dateTo],
    queryFn: () =>
      financeApi.summary({
        ...(dateFrom ? { start_date: dateFrom } : {}),
        ...(dateTo ? { end_date: dateTo } : {}),
      }),
    retry: false,
  });

  const classes = useQuery({
    queryKey: ["academic-classes"],
    queryFn: () => academicsApi.listClasses(),
    enabled: tab === "payments",
    retry: false,
  });

  const categories = useQuery({
    queryKey: ["finance-categories"],
    queryFn: () => financeMutations.listCategories(),
    retry: false,
  });

  const students = useQuery({
    queryKey: ["students-lite"],
    queryFn: () => peopleApi.listStudentsPage({ limit: 200, offset: 0 }),
    enabled: canManage && tab === "payments",
    retry: false,
  });

  const payments = useQuery({
    queryKey: ["payments", dateFrom, dateTo, paymentClassId, paymentCategoryId, paymentStudentId],
    queryFn: () =>
      financeApi.listPayments({
        ...(paymentClassId ? { class_id: paymentClassId } : {}),
        ...(paymentCategoryId ? { category_id: paymentCategoryId } : {}),
        ...(paymentStudentId ? { student_id: paymentStudentId } : {}),
        ...(dateFrom ? { date_from: dateFrom } : {}),
        ...(dateTo ? { date_to: dateTo } : {}),
      }),
    enabled: tab === "payments" || tab === "overview",
    retry: false,
  });

  const donors = useQuery({
    queryKey: ["donors"],
    queryFn: () => financeMutations.listDonors(),
    retry: false,
  });

  const donations = useQuery({
    queryKey: ["donations", dateFrom, dateTo, donationDonorId, donationCategoryId],
    queryFn: () =>
      financeApi.listDonations({
        ...(donationDonorId ? { donor_id: donationDonorId } : {}),
        ...(donationCategoryId ? { category_id: donationCategoryId } : {}),
        ...(dateFrom ? { date_from: dateFrom } : {}),
        ...(dateTo ? { date_to: dateTo } : {}),
      }),
    enabled: tab === "donations" || tab === "overview",
    retry: false,
  });

  const salary = useQuery({
    queryKey: ["my-salary"],
    queryFn: () => financeApi.mySalary(),
    enabled: tab === "salary",
    retry: false,
  });

  // record payment form state
  const [payStudentId, setPayStudentId] = useState("");
  const [payCategoryId, setPayCategoryId] = useState("");
  const [payAmount, setPayAmount] = useState("");
  const [payDate, setPayDate] = useState(today);
  const [payNote, setPayNote] = useState("");

  const resetPaymentForm = () => {
    setPayStudentId("");
    setPayCategoryId("");
    setPayAmount("");
    setPayDate(today);
    setPayNote("");
  };

  const createPayment = useMutation({
    mutationFn: () => {
      const amountNum = Number(payAmount);
      if (!payStudentId) throw new Error("Student is required");
      if (!payCategoryId) throw new Error("Category is required");
      if (!payDate) throw new Error("Date is required");
      if (!(amountNum > 0)) throw new Error("Amount must be greater than 0");
      return financeMutations.createPayment({
        student_id: payStudentId,
        category_id: payCategoryId,
        amount: amountNum,
        payment_date: payDate,
        ...(payNote.trim() ? { note: payNote.trim() } : {}),
      });
    },
    onSuccess: () => {
      toast.success("Payment recorded");
      resetPaymentForm();
      void client.invalidateQueries({ queryKey: ["payments"] });
      void client.invalidateQueries({ queryKey: ["finance-summary"] });
    },
    onError: (err: unknown) => {
      if (err instanceof Error) toast.error(err.message);
    },
  });

  // record donation form state
  const [donDonorId, setDonDonorId] = useState("");
  const [donCategoryId, setDonCategoryId] = useState("");
  const [donAmount, setDonAmount] = useState("");
  const [donDate, setDonDate] = useState(today);
  const [donNote, setDonNote] = useState("");

  const resetDonationForm = () => {
    setDonDonorId("");
    setDonCategoryId("");
    setDonAmount("");
    setDonDate(today);
    setDonNote("");
  };

  const createDonation = useMutation({
    mutationFn: () => {
      const amountNum = Number(donAmount);
      if (!donDonorId) throw new Error("Donor is required");
      if (!donCategoryId) throw new Error("Category is required");
      if (!donDate) throw new Error("Date is required");
      if (!(amountNum > 0)) throw new Error("Amount must be greater than 0");
      return financeMutations.createDonation({
        donor_id: donDonorId,
        category_id: donCategoryId,
        amount: amountNum,
        donation_date: donDate,
        ...(donNote.trim() ? { note: donNote.trim() } : {}),
      });
    },
    onSuccess: () => {
      toast.success("Donation recorded");
      resetDonationForm();
      void client.invalidateQueries({ queryKey: ["donations"] });
      void client.invalidateQueries({ queryKey: ["finance-summary"] });
    },
    onError: (err: unknown) => {
      if (err instanceof Error) toast.error(err.message);
    },
  });

  // create category
  const [newCategoryName, setNewCategoryName] = useState("");
  const createCategory = useMutation({
    mutationFn: () => {
      if (!newCategoryName.trim()) throw new Error("Category name is required");
      return financeMutations.createCategory(newCategoryName.trim());
    },
    onSuccess: () => {
      toast.success("Category added");
      setNewCategoryName("");
      void client.invalidateQueries({ queryKey: ["finance-categories"] });
    },
    onError: (err: unknown) => {
      if (err instanceof Error) toast.error(err.message);
    },
  });

  async function sendReceipt(send: () => Promise<{ normalised_number: string }>) {
    try {
      const result = await send();
      toast.success(`${t("Receipt sent on WhatsApp")} +${result.normalised_number}`);
    } catch (error) {
      toast.error(apiErrorMessage(error, t("Failed to send receipt on WhatsApp")));
    }
  }

  const paymentsTotal = useMemo(
    () => (payments.data ?? []).reduce((sum, p) => sum + Number(p.amount ?? 0), 0),
    [payments.data],
  );
  const donationsTotal = useMemo(
    () => (donations.data ?? []).reduce((sum, d) => sum + Number(d.amount ?? 0), 0),
    [donations.data],
  );

  const byCategory = summary.data?.by_category ?? {};

  const action =
    canManage && tab === "payments" ? (
      <FormSheet
        title={t("Record payment")}
        triggerLabel="Record"
        submitLabel="Save"
        onSubmit={() => createPayment.mutateAsync()}
      >
        <Field label={t("Student")}>
          <CustomDropdown
            required
            value={payStudentId}
            onChange={(e) => setPayStudentId(e.target.value)}
          >
            <option value="">{t("Select student")}</option>
            {(students.data?.items ?? []).map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </CustomDropdown>
        </Field>
        <Field label={t("Category")}>
          <CustomDropdown
            required
            value={payCategoryId}
            onChange={(e) => setPayCategoryId(e.target.value)}
          >
            <option value="">{t("Select category")}</option>
            {(categories.data ?? []).map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </CustomDropdown>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t("Amount")}>
            <TextInput
              type="number"
              min={0}
              step="0.01"
              required
              value={payAmount}
              onChange={(e) => setPayAmount(e.target.value)}
            />
          </Field>
          <Field label={t("Date")}>
            <TextInput
              type="date"
              required
              value={payDate}
              onChange={(e) => setPayDate(e.target.value)}
            />
          </Field>
        </div>
        <Field label={t("Note")}>
          <TextInput value={payNote} onChange={(e) => setPayNote(e.target.value)} />
        </Field>
      </FormSheet>
    ) : canManage && tab === "donations" ? (
      <FormSheet
        title={t("Record donation")}
        triggerLabel="Record"
        submitLabel="Save"
        onSubmit={() => createDonation.mutateAsync()}
      >
        <Field label={t("Donor")}>
          <CustomDropdown required value={donDonorId} onChange={(e) => setDonDonorId(e.target.value)}>
            <option value="">{t("Select donor")}</option>
            {(donors.data ?? []).map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </CustomDropdown>
        </Field>
        <Field label={t("Category")}>
          <CustomDropdown
            required
            value={donCategoryId}
            onChange={(e) => setDonCategoryId(e.target.value)}
          >
            <option value="">{t("Select category")}</option>
            {(categories.data ?? []).map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </CustomDropdown>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t("Amount")}>
            <TextInput
              type="number"
              min={0}
              step="0.01"
              required
              value={donAmount}
              onChange={(e) => setDonAmount(e.target.value)}
            />
          </Field>
          <Field label={t("Date")}>
            <TextInput
              type="date"
              required
              value={donDate}
              onChange={(e) => setDonDate(e.target.value)}
            />
          </Field>
        </div>
        <Field label={t("Note")}>
          <TextInput value={donNote} onChange={(e) => setDonNote(e.target.value)} />
        </Field>
      </FormSheet>
    ) : undefined;

  return (
    <AppShell title={t("Finance")} subtitle={t("Contributions, donations and salary")}>
      <div className="grid grid-cols-2 gap-2.5">
        <StatCard
          label={t("Contributions")}
          value={summary.data ? money(summary.data.total_contributions) : "—"}
          icon={Receipt}
        />
        <StatCard
          label={t("Donations")}
          value={summary.data ? money(summary.data.total_donations) : "—"}
          icon={HandCoins}
          tone="gold"
        />
      </div>

      <div
        className={cn(
          "mt-4 grid gap-1.5 rounded-2xl bg-muted p-1",
          tabs.length === 4 ? "grid-cols-4" : "grid-cols-3",
        )}
      >
        {tabs.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={cn(
              "rounded-xl py-2 text-[0.65rem] font-bold uppercase tracking-wide transition-colors",
              tab === key
                ? "bg-card text-primary shadow-[var(--shadow-soft)]"
                : "text-muted-foreground",
            )}
          >
            {t(label)}
          </button>
        ))}
      </div>

      {tab !== "salary" ? (
        <div className="mt-3">
        <FilterBar
          activeCount={[dateFrom, dateTo, donationDonorId, donationCategoryId, paymentClassId, paymentCategoryId, paymentStudentId].filter(Boolean).length}
          onClear={() => {
            setDateFrom("");
            setDateTo("");
            setDonationDonorId("");
            setDonationCategoryId("");
            setPaymentClassId("");
            setPaymentCategoryId("");
            setPaymentStudentId("");
          }}
          action={action}
        >
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label={t("From")}>
              <TextInput type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
            </Field>
            <Field label={t("To")}>
              <TextInput type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
            </Field>
            {tab === "payments" ? (
              <>
                <Field label={t("Class")}>
                  <CustomDropdown value={paymentClassId} onChange={(e) => setPaymentClassId(e.target.value)}>
                    <option value="">{t("All classes")}</option>
                    {(classes.data ?? []).map((c) => (<option key={c.id} value={c.id}>{c.name}</option>))}
                  </CustomDropdown>
                </Field>
                <Field label={t("Category")}>
                  <CustomDropdown value={paymentCategoryId} onChange={(e) => setPaymentCategoryId(e.target.value)}>
                    <option value="">{t("All categories")}</option>
                    {(categories.data ?? []).map((c) => (<option key={c.id} value={c.id}>{c.name}</option>))}
                  </CustomDropdown>
                </Field>
                {canManage ? (
                  <Field label={t("Student")} className="sm:col-span-2">
                    <CustomDropdown value={paymentStudentId} onChange={(e) => setPaymentStudentId(e.target.value)}>
                      <option value="">{t("All students")}</option>
                      {(students.data?.items ?? []).map((s) => (<option key={s.id} value={s.id}>{s.name}</option>))}
                    </CustomDropdown>
                  </Field>
                ) : null}
              </>
            ) : null}
            {tab === "donations" ? (
              <>
                <Field label={t("Donor")}>
                  <CustomDropdown value={donationDonorId} onChange={(e) => setDonationDonorId(e.target.value)}>
                    <option value="">{t("All donors")}</option>
                    {(donors.data ?? []).map((d) => (<option key={d.id} value={d.id}>{d.name}</option>))}
                  </CustomDropdown>
                </Field>
                <Field label={t("Category")}>
                  <CustomDropdown value={donationCategoryId} onChange={(e) => setDonationCategoryId(e.target.value)}>
                    <option value="">{t("All categories")}</option>
                    {(categories.data ?? []).map((c) => (<option key={c.id} value={c.id}>{c.name}</option>))}
                  </CustomDropdown>
                </Field>
              </>
            ) : null}
          </div>
        </FilterBar>
        </div>
      ) : null}

      {tab === "overview" ? (
        <>
          <SectionTitle>{t("By category")}</SectionTitle>
          {summary.isLoading ? (
            <SkeletonList rows={3} />
          ) : Object.keys(byCategory).length === 0 ? (
            <EmptyState title={t("No category breakdown yet")} />
          ) : (
            <div className="space-y-2">
              {Object.entries(byCategory).map(([name, amount]) => (
                <Card key={name} className="flex items-center justify-between p-3.5">
                  <p className="font-semibold">{name}</p>
                  <span className="font-display text-sm font-extrabold">
                    {money(amount as number)}
                  </span>
                </Card>
              ))}
            </div>
          )}
          {canManage ? (
            <Card className="mt-3 space-y-3 p-3.5">
              <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-muted-foreground">
                {t("Add category")}</p>
              <div className="flex gap-2">
                <TextInput
                  value={newCategoryName}
                  onChange={(e) => setNewCategoryName(e.target.value)}
                  placeholder={t("Category name")}
                />
                <ActionButton variant="soft" onClick={() => createCategory.mutate()}>
                  <Plus className="h-4 w-4" />
                </ActionButton>
              </div>
            </Card>
          ) : null}
          <SectionTitle className="mt-4">{t("Total")}</SectionTitle>
          <Card className="flex items-center justify-between p-3.5">
            <p className="font-semibold text-muted-foreground">{t("Overall total")}</p>
            <span className="font-display text-base font-extrabold">
              {summary.data ? money(summary.data.total) : "—"}
            </span>
          </Card>
        </>
      ) : null}

      {tab === "payments" ? (
        <>
          <SectionTitle
            action={
              <span className="font-display text-sm font-extrabold text-primary">
                {money(paymentsTotal)}
              </span>
            }
          >
            {t("Payments")}</SectionTitle>
          <List
            loading={payments.isLoading}
            empty={(payments.data ?? []).length === 0}
            emptyTitle="No payments recorded"
          >
            {(payments.data ?? []).map((item) => (
              <Row
                key={item.id}
                title={item.student_name ?? "Student"}
                subtitle={`${item.category_name ?? "Fee"} · ${new Date(item.payment_date).toLocaleDateString()}`}
                value={money(item.amount, item.currency)}
                onReceipt={() => void financeMutations.paymentReceipt(item.id)}
                onSendReceipt={() => void sendReceipt(() => financeMutations.sendPaymentReceipt(item.id))}
              />
            ))}
          </List>
        </>
      ) : null}

      {tab === "donations" ? (
        <>
          <SectionTitle
            action={
              <span className="font-display text-sm font-extrabold text-primary">
                {money(donationsTotal)}
              </span>
            }
          >
            {t("Donations")}</SectionTitle>
          <List
            loading={donations.isLoading}
            empty={(donations.data ?? []).length === 0}
            emptyTitle="No donations recorded"
          >
            {(donations.data ?? []).map((item) => (
              <Row
                key={item.id}
                title={item.donor_name ?? "Donor"}
                subtitle={`${item.category_name ?? "Donation"} · ${new Date(item.donation_date).toLocaleDateString()}`}
                value={money(item.amount, item.currency)}
                onReceipt={() => void financeMutations.donationReceipt(item.id)}
                onSendReceipt={() => void sendReceipt(() => financeMutations.sendDonationReceipt(item.id))}
              />
            ))}
          </List>
        </>
      ) : null}

      {tab === "salary" ? (
        salary.isLoading ? (
          <SkeletonList rows={3} />
        ) : salary.data ? (
          <div className="mt-4 space-y-2.5">
            <StatCard
              label={t("Base salary")}
              value={money(salary.data.base_amount ?? 0, salary.data.currency ?? undefined)}
              icon={Wallet}
            />
            {(salary.data.payments ?? []).map((payment) => (
              <Row
                key={payment.id}
                title={new Date(payment.paid_on).toLocaleDateString()}
                subtitle={payment.note ?? "Salary payment"}
                value={money(payment.amount, salary.data?.currency ?? undefined)}
              />
            ))}
          </div>
        ) : (
          <EmptyState
            title={t("No salary record")}
            hint="Salary details are available to staff accounts."
          />
        )
      ) : null}

    </AppShell>
  );
}

function List({
  loading,
  empty,
  emptyTitle,
  children,
}: {
  loading: boolean;
  empty: boolean;
  emptyTitle: string;
  children: React.ReactNode;
}) {
    const { t } = useTranslation();
  if (loading) return <SkeletonList rows={5} />;
  if (empty) return <EmptyState title={emptyTitle} />;
  return <div className="space-y-2">{children}</div>;
}

function Row({
  title,
  subtitle,
  value,
  onReceipt,
  onSendReceipt,
}: {
  title: string;
  subtitle: string;
  value: string;
  onReceipt?: () => void;
  onSendReceipt?: () => void;
}) {
    const { t } = useTranslation();
  return (
    <Card className="grid grid-cols-[minmax(0,1fr)_auto_auto_auto] items-center gap-2 p-3.5">
      <div className="min-w-0">
        <p className="truncate font-semibold">{title}</p>
        <p className="truncate text-xs text-muted-foreground">{subtitle}</p>
      </div>
      <span className="font-display text-sm font-extrabold">{value}</span>
      {onReceipt ? (
        <button
          aria-label="Download receipt"
          onClick={onReceipt}
          className="grid h-9 w-9 place-items-center rounded-xl bg-primary-soft text-primary"
        >
          <Download className="h-4 w-4" />
        </button>
      ) : (
        <span />
      )}
      {onSendReceipt ? (
        <MessageSendButton
          ariaLabel={t("Send receipt via WhatsApp")}
          onSend={onSendReceipt}
        />
      ) : (
        <span />
      )}
    </Card>
  );
}
