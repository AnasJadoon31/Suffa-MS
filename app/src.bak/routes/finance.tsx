import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Download, HandCoins, Plus, Receipt, Search, User, Wallet } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/app/AppShell";
import { FormSheet } from "@/components/app/FormSheet";
import { DonorProfileSheet } from "@/components/app/finance/DonorProfileSheet";
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
import { financeApi, financeMutations } from "@/lib/mms/more-endpoints";

export const Route = createFileRoute("/finance")({
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

type Tab = "overview" | "payments" | "donations" | "donors" | "salary";

function money(amount: number, currency?: string) {
  return `${currency ?? "PKR"} ${Number(amount ?? 0).toLocaleString()}`;
}

function FinancePage() {
  const { user } = useAuth();
  const client = useQueryClient();
  const canManage = user?.role === "principal" || user?.role === "super_admin";
  const isTeacher = user?.role === "teacher";
  const [tab, setTab] = useState<Tab>("overview");
  const today = new Date().toISOString().slice(0, 10);

  // shared date range filter
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  // payments filters
  const [paymentClassId, setPaymentClassId] = useState("");
  const [paymentCategoryId, setPaymentCategoryId] = useState("");
  const [paymentStudentId, setPaymentStudentId] = useState("");

  // donations filters
  const [donationDonorId, setDonationDonorId] = useState("");
  const [donationCategoryId, setDonationCategoryId] = useState("");

  // donors search
  const [donorQuery, setDonorQuery] = useState("");
  const [donorProfileId, setDonorProfileId] = useState<string | null>(null);

  const tabs: { key: Tab; label: string }[] = [
    { key: "overview", label: "Overview" },
    { key: "payments", label: "Payments" },
    { key: "donations", label: "Donations" },
    { key: "donors", label: "Donors" },
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
    queryKey: ["donors", donorQuery],
    queryFn: () => financeMutations.listDonors(donorQuery ? { q: donorQuery } : {}),
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

  // create donor
  const [donorName, setDonorName] = useState("");
  const [donorContact, setDonorContact] = useState("");
  const createDonor = useMutation({
    mutationFn: () => {
      if (!donorName.trim()) throw new Error("Donor name is required");
      return financeMutations.createDonor({ name: donorName.trim(), contact: donorContact.trim() });
    },
    onSuccess: () => {
      toast.success("Donor added");
      setDonorName("");
      setDonorContact("");
      void client.invalidateQueries({ queryKey: ["donors"] });
    },
    onError: (err: unknown) => {
      if (err instanceof Error) toast.error(err.message);
    },
  });

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
        title="Record payment"
        triggerLabel="Record"
        submitLabel="Save"
        onSubmit={() => createPayment.mutateAsync()}
      >
        <Field label="Student">
          <CustomDropdown
            required
            value={payStudentId}
            onChange={(e) => setPayStudentId(e.target.value)}
          >
            <option value="">Select student</option>
            {(students.data?.items ?? []).map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </CustomDropdown>
        </Field>
        <Field label="Category">
          <CustomDropdown
            required
            value={payCategoryId}
            onChange={(e) => setPayCategoryId(e.target.value)}
          >
            <option value="">Select category</option>
            {(categories.data ?? []).map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </CustomDropdown>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Amount">
            <TextInput
              type="number"
              min={0}
              step="0.01"
              required
              value={payAmount}
              onChange={(e) => setPayAmount(e.target.value)}
            />
          </Field>
          <Field label="Date">
            <TextInput
              type="date"
              required
              value={payDate}
              onChange={(e) => setPayDate(e.target.value)}
            />
          </Field>
        </div>
        <Field label="Note">
          <TextInput value={payNote} onChange={(e) => setPayNote(e.target.value)} />
        </Field>
      </FormSheet>
    ) : canManage && tab === "donations" ? (
      <FormSheet
        title="Record donation"
        triggerLabel="Record"
        submitLabel="Save"
        onSubmit={() => createDonation.mutateAsync()}
      >
        <Field label="Donor">
          <CustomDropdown required value={donDonorId} onChange={(e) => setDonDonorId(e.target.value)}>
            <option value="">Select donor</option>
            {(donors.data ?? []).map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </CustomDropdown>
        </Field>
        <Field label="Category">
          <CustomDropdown
            required
            value={donCategoryId}
            onChange={(e) => setDonCategoryId(e.target.value)}
          >
            <option value="">Select category</option>
            {(categories.data ?? []).map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </CustomDropdown>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Amount">
            <TextInput
              type="number"
              min={0}
              step="0.01"
              required
              value={donAmount}
              onChange={(e) => setDonAmount(e.target.value)}
            />
          </Field>
          <Field label="Date">
            <TextInput
              type="date"
              required
              value={donDate}
              onChange={(e) => setDonDate(e.target.value)}
            />
          </Field>
        </div>
        <Field label="Note">
          <TextInput value={donNote} onChange={(e) => setDonNote(e.target.value)} />
        </Field>
      </FormSheet>
    ) : canManage && tab === "donors" ? (
      <FormSheet
        title="Add donor"
        triggerLabel="Add"
        submitLabel="Save"
        onSubmit={() => createDonor.mutateAsync()}
      >
        <Field label="Name">
          <TextInput required value={donorName} onChange={(e) => setDonorName(e.target.value)} />
        </Field>
        <Field label="Contact">
          <TextInput value={donorContact} onChange={(e) => setDonorContact(e.target.value)} />
        </Field>
      </FormSheet>
    ) : undefined;

  return (
    <AppShell title="Finance" subtitle="Contributions, donations and salary" right={action}>
      <div className="grid grid-cols-2 gap-2.5">
        <StatCard
          label="Contributions"
          value={summary.data ? money(summary.data.total_contributions) : "—"}
          icon={Receipt}
        />
        <StatCard
          label="Donations"
          value={summary.data ? money(summary.data.total_donations) : "—"}
          icon={HandCoins}
          tone="gold"
        />
      </div>

      {tab !== "salary" ? (
        <Card className="mt-3 grid grid-cols-2 gap-3 p-3.5">
          <Field label="From">
            <TextInput type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          </Field>
          <Field label="To">
            <TextInput type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          </Field>
        </Card>
      ) : null}

      <div
        className={cn(
          "mt-4 grid gap-1.5 rounded-2xl bg-muted p-1",
          tabs.length === 5 ? "grid-cols-5" : "grid-cols-4",
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
            {label}
          </button>
        ))}
      </div>

      {tab === "overview" ? (
        <>
          <SectionTitle>By category</SectionTitle>
          {summary.isLoading ? (
            <SkeletonList rows={3} />
          ) : Object.keys(byCategory).length === 0 ? (
            <EmptyState title="No category breakdown yet" />
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
          <SectionTitle>Total</SectionTitle>
          <Card className="flex items-center justify-between p-3.5">
            <p className="font-semibold text-muted-foreground">Overall total</p>
            <span className="font-display text-base font-extrabold">
              {summary.data ? money(summary.data.total) : "—"}
            </span>
          </Card>
        </>
      ) : null}

      {tab === "payments" ? (
        <>
          <Card className="mt-4 grid grid-cols-2 gap-3 p-3.5">
            <Field label="Class">
              <CustomDropdown
                value={paymentClassId}
                onChange={(e) => setPaymentClassId(e.target.value)}
              >
                <option value="">All classes</option>
                {(classes.data ?? []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </CustomDropdown>
            </Field>
            <Field label="Category">
              <CustomDropdown
                value={paymentCategoryId}
                onChange={(e) => setPaymentCategoryId(e.target.value)}
              >
                <option value="">All categories</option>
                {(categories.data ?? []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </CustomDropdown>
            </Field>
            {canManage ? (
              <Field label="Student">
                <CustomDropdown
                  value={paymentStudentId}
                  onChange={(e) => setPaymentStudentId(e.target.value)}
                  className="col-span-2"
                >
                  <option value="">All students</option>
                  {(students.data?.items ?? []).map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </CustomDropdown>
              </Field>
            ) : null}
          </Card>
          <SectionTitle
            action={
              <span className="font-display text-sm font-extrabold text-primary">
                {money(paymentsTotal)}
              </span>
            }
          >
            Payments
          </SectionTitle>
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
              />
            ))}
          </List>
        </>
      ) : null}

      {tab === "donations" ? (
        <>
          <Card className="mt-4 grid grid-cols-2 gap-3 p-3.5">
            <Field label="Donor">
              <CustomDropdown
                value={donationDonorId}
                onChange={(e) => setDonationDonorId(e.target.value)}
              >
                <option value="">All donors</option>
                {(donors.data ?? []).map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </CustomDropdown>
            </Field>
            <Field label="Category">
              <CustomDropdown
                value={donationCategoryId}
                onChange={(e) => setDonationCategoryId(e.target.value)}
              >
                <option value="">All categories</option>
                {(categories.data ?? []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </CustomDropdown>
            </Field>
          </Card>
          <SectionTitle
            action={
              <span className="font-display text-sm font-extrabold text-primary">
                {money(donationsTotal)}
              </span>
            }
          >
            Donations
          </SectionTitle>
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
              />
            ))}
          </List>
        </>
      ) : null}

      {tab === "donors" ? (
        <>
          <div className="relative mt-4">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <TextInput
              value={donorQuery}
              onChange={(e) => setDonorQuery(e.target.value)}
              placeholder="Search donors"
              className="pl-10"
            />
          </div>
          {canManage ? (
            <Card className="mt-3 space-y-3 p-3.5">
              <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-muted-foreground">
                Add category
              </p>
              <div className="flex gap-2">
                <TextInput
                  value={newCategoryName}
                  onChange={(e) => setNewCategoryName(e.target.value)}
                  placeholder="Category name"
                />
                <ActionButton variant="soft" onClick={() => createCategory.mutate()}>
                  <Plus className="h-4 w-4" />
                </ActionButton>
              </div>
            </Card>
          ) : null}
          <SectionTitle>Donors</SectionTitle>
          <List
            loading={donors.isLoading}
            empty={(donors.data ?? []).length === 0}
            emptyTitle="No donors found"
          >
            {(donors.data ?? []).map((donor) => (
              <button
                key={donor.id}
                onClick={() => setDonorProfileId(donor.id)}
                className="block w-full text-left"
              >
                <Card className="flex items-center gap-3 p-3.5">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary">
                    <User className="h-5 w-5" />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{donor.name}</p>
                    <p className="truncate text-xs text-muted-foreground">{donor.contact || "—"}</p>
                  </div>
                </Card>
              </button>
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
              label="Base salary"
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
            title="No salary record"
            hint="Salary details are available to staff accounts."
          />
        )
      ) : null}

      {donorProfileId ? (
        <DonorProfileSheet donorId={donorProfileId} onClose={() => setDonorProfileId(null)} />
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
  if (loading) return <SkeletonList rows={5} />;
  if (empty) return <EmptyState title={emptyTitle} />;
  return <div className="space-y-2">{children}</div>;
}

function Row({
  title,
  subtitle,
  value,
  onReceipt,
}: {
  title: string;
  subtitle: string;
  value: string;
  onReceipt?: () => void;
}) {
  return (
    <Card className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-3 p-3.5">
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
    </Card>
  );
}
