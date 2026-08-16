import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Wallet } from "lucide-react";
import { useMemo, useState } from "react";

import { AppShell } from "@/components/app/AppShell";
import { FilterBar } from "@/components/app/FilterBar";
import {
  Card,
  CustomDropdown,
  EmptyState,
  Field,
  SkeletonList,
  StatCard,
  TextInput,
} from "@/components/app/Primitives";
import { useAuth } from "@/lib/mms/auth";
import { financeApi } from "@/lib/mms/more-endpoints";
import { useTranslation } from "react-i18next";

export const Route = createFileRoute("/donations")({
  head: () => ({
    meta: [
      { title: "Donations — Suffa MS" },
      { name: "description", content: "Your donation history." },
    ],
  }),
  component: DonationsPage,
});

function DonationsPage() {
  const { t } = useTranslation();
  const { user } = useAuth();

  const profile = useQuery({
    queryKey: ["donor-profile-me"],
    queryFn: () => financeApi.myDonorProfile(),
    enabled: Boolean(user) && (user?.role === "donor" || (user?.role === "parent" && user?.is_donor)),
    retry: false,
  });

  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [categoryId, setCategoryId] = useState("");

  const categories = useMemo(() => {
    if (!profile.data?.donations) return [];
    const map = new Map<string, string>();
    for (const d of profile.data.donations) {
      if (d.category_id && !map.has(d.category_id)) {
        map.set(d.category_id, d.category_name ?? d.category_id);
      }
    }
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [profile.data]);

  const filtered = useMemo(() => {
    if (!profile.data?.donations) return [];
    return profile.data.donations.filter((d) => {
      if (categoryId && d.category_id !== categoryId) return false;
      if (dateFrom && d.donation_date < dateFrom) return false;
      if (dateTo && d.donation_date > dateTo) return false;
      return true;
    });
  }, [profile.data, dateFrom, dateTo, categoryId]);

  const total = filtered.reduce((sum: number, d: { amount?: number }) => sum + Number(d.amount ?? 0), 0);
  const activeCount = [dateFrom, dateTo, categoryId].filter(Boolean).length;

  return (
    <AppShell
      title={t("Donations")}
      subtitle={profile.data?.name ?? (user?.name ?? user?.username ?? "")}
      right={
        <span className="rounded-full bg-primary-foreground/15 px-3 py-1 text-[0.68rem] font-bold uppercase tracking-wider">
          {t("Donor")}
        </span>
      }
    >
      {profile.isLoading ? <SkeletonList rows={4} /> : null}
      {profile.isError ? (
        <EmptyState title={t("Couldn't load donor data")} hint={t("Please try again or contact support.")} />
      ) : null}
      {!profile.isLoading && !profile.isError && !profile.data ? (
        <EmptyState title={t("No donor data")} hint={t("Your donation history will appear here.")} />
      ) : null}
      {profile.data ? (
        <>
          <StatCard
            icon={Wallet}
            label={t("Total donations")}
            value={total.toLocaleString("en-PK", { minimumFractionDigits: 2 })}
          />
          <FilterBar
            activeCount={activeCount}
            onClear={() => { setDateFrom(""); setDateTo(""); setCategoryId(""); }}
          >
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label={t("From")}>
                <TextInput type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
              </Field>
              <Field label={t("To")}>
                <TextInput type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
              </Field>
              <Field label={t("Category")} className="sm:col-span-2">
                <CustomDropdown value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
                  <option value="">{t("All categories")}</option>
                  {categories.map((c) => (<option key={c.id} value={c.id}>{c.name}</option>))}
                </CustomDropdown>
              </Field>
            </div>
          </FilterBar>
          <h2 className="mb-2 mt-4 text-sm font-bold uppercase tracking-wider text-muted-foreground">
            {t("Donation history")}
          </h2>
          {filtered.length === 0 ? (
            <EmptyState title={t("No donations match filters")} hint={t("Try adjusting your date or category filter.")} />
          ) : (
            <div className="space-y-2.5">
              {filtered.map((d) => (
                <Card key={d.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 p-3.5">
                  <div className="min-w-0">
                    <p className="font-semibold">{d.category_name ?? d.category_id}</p>
                    <p className="text-xs text-muted-foreground">{d.donation_date}</p>
                  </div>
                  <span className="font-display text-lg font-extrabold text-primary">
                    {d.amount.toLocaleString("en-PK", { minimumFractionDigits: 2 })}
                  </span>
                </Card>
              ))}
            </div>
          )}
        </>
      ) : null}
    </AppShell>
  );
}
