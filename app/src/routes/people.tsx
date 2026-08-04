import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { GraduationCap, HeartHandshake, KeyRound, ShieldCheck, Users } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";

import { AppShell } from "@/components/app/AppShell";
import { FilterBar, type FilterChip } from "@/components/app/FilterBar";
import {
  Card,
  CustomDropdown,
  EmptyState,
  Field,
  Pill,
  Segmented,
  SkeletonList,
} from "@/components/app/Primitives";
import {
  GuardianDetailSheet,
  StudentDetailSheet,
  TeacherDetailSheet,
} from "@/components/app/people/PersonDetail";
import { StudentForm } from "@/components/app/people/StudentForm";
import { TeacherForm } from "@/components/app/people/TeacherForm";
import { GuardianForm } from "@/components/app/people/GuardianForm";
import { DonorForm } from "@/components/app/people/DonorForm";
import { useAuth } from "@/lib/mms/auth";
import { academicsApi, peopleApi, type Guardian, type Student, type Teacher } from "@/lib/mms/endpoints";
import { financeMutations, peopleMutations, type Donor } from "@/lib/mms/more-endpoints";

export const Route = createFileRoute("/people")({
  head: () => ({
    meta: [
      { title: "People — Suffa MS" },
      { name: "description", content: "Browse students, teachers, guardians, and donors of the madrasa." },
      { property: "og:title", content: "People — Suffa MS" },
      {
        property: "og:description",
        content: "Browse students, teachers, guardians, and donors of the madrasa.",
      },
    ],
  }),
  component: PeoplePage,
});

type Tab = "students" | "teachers" | "guardians" | "donors";
type StatusFilter = "all" | "active" | "inactive";

const TABS: { key: Tab; label: string; icon: typeof Users }[] = [
  { key: "students", label: "Students", icon: GraduationCap },
  { key: "teachers", label: "Teachers", icon: Users },
  { key: "guardians", label: "Guardians", icon: ShieldCheck },
  { key: "donors", label: "Donors", icon: HeartHandshake },
];

const PAGE_SIZE = 20;

function renderAddButton(tab: Tab, label?: string) {
  const defaultLabel = label ?? "Add";
  if (tab === "students") return <StudentForm triggerLabel={defaultLabel} />;
  if (tab === "teachers") return <TeacherForm triggerLabel={defaultLabel} />;
  if (tab === "guardians") return <GuardianForm triggerLabel={defaultLabel} />;
  return <DonorForm triggerLabel={defaultLabel} />;
}

function PeoplePage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const canManage = user?.role === "principal" || user?.role === "super_admin" || user?.is_principal_delegate;

  const [tab, setTab] = useState<Tab>("students");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [classFilter, setClassFilter] = useState("");
  const [genderFilter, setGenderFilter] = useState("all");

  const [detailStudentId, setDetailStudentId] = useState<string | null>(null);
  const [detailTeacherId, setDetailTeacherId] = useState<string | null>(null);
  const [detailGuardianId, setDetailGuardianId] = useState<string | null>(null);

  const classesQuery = useQuery({
    queryKey: ["academics", "classes"],
    queryFn: () => academicsApi.listClasses(),
  });

  const query = useInfiniteQuery({
    queryKey: ["people", tab, search],
    initialPageParam: 0,
    queryFn: async ({ pageParam }) => {
      const params = {
        search: search.trim() || undefined,
        limit: PAGE_SIZE,
        offset: pageParam as number,
      };
      if (tab === "students")
        return { kind: "students" as const, page: await peopleApi.listStudentsPage(params) };
      if (tab === "teachers")
        return { kind: "teachers" as const, page: await peopleApi.listTeachersPage(params) };
      if (tab === "guardians")
        return { kind: "guardians" as const, page: await peopleApi.listGuardiansPage(params) };

      const donorsList = await financeMutations.listDonors(search.trim() ? { q: search.trim() } : undefined);
      return {
        kind: "donors" as const,
        page: { items: donorsList, total: donorsList.length },
      };
    },
    getNextPageParam: (lastPage, pages) => {
      if (tab === "donors") return undefined;
      const loaded = pages.reduce((sum, p) => sum + p.page.items.length, 0);
      return loaded < lastPage.page.total ? loaded : undefined;
    },
  });

  const rawItems = (query.data?.pages.flatMap((p) => p.page.items as unknown[]) ?? []) as (
    Student | Teacher | Guardian | Donor
  )[];
  const items = rawItems.filter((item) => {
    const record = item as unknown as Record<string, unknown>;
    
    // Status filter
    if (status !== "all" && tab !== "donors") {
      const itemStatus = (record["status"] as string) ?? "active";
      if (status === "active" && itemStatus !== "active") return false;
      if (status === "inactive" && itemStatus === "active") return false;
    }

    // Class filter (students)
    if (classFilter && tab === "students") {
      const currentClass = String(record["current_class"] ?? "").toLowerCase();
      if (!currentClass.includes(classFilter.toLowerCase())) return false;
    }

    // Gender filter
    if (genderFilter !== "all") {
      const gender = String(record["gender"] ?? "").toLowerCase();
      if (gender && gender !== genderFilter) return false;
    }

    return true;
  });
  const total = query.data?.pages[0]?.page.total ?? 0;

  const activeCount =
    (status !== "all" ? 1 : 0) +
    (classFilter ? 1 : 0) +
    (genderFilter !== "all" ? 1 : 0) +
    (search.trim() ? 1 : 0);

  const handleClearFilters = () => {
    setStatus("all");
    setClassFilter("");
    setGenderFilter("all");
    setSearch("");
  };

  const credentials = async (id: string) => {
    try {
      const data =
        tab === "students"
          ? await peopleMutations.studentCredentialsLink(id)
          : tab === "teachers"
            ? await peopleMutations.teacherCredentialsLink(id)
            : await peopleMutations.guardianCredentialsLink(id);
      await navigator.clipboard.writeText(data.set_password_url);
      toast.success(`Link copied for ${data.username}`);
    } catch {
      toast.error("Failed to generate credentials link");
    }
  };

  const getAddLabel = () => {
    if (tab === "students") return `+ ${t("Add Student")}`;
    if (tab === "teachers") return `+ ${t("Add Teacher")}`;
    if (tab === "guardians") return `+ ${t("Add Guardian")}`;
    return `+ ${t("Add Donor")}`;
  };

  return (
    <AppShell
      title={t("People")}
      subtitle={query.data ? `${total} ${t("records")}` : t("Directory")}
      right={canManage ? renderAddButton(tab, t("Add")) : undefined}
    >
      {/* Top Header & Tab Controls */}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex-1">
          <Segmented
            value={tab}
            onChange={(next) => {
              setTab(next);
              handleClearFilters();
            }}
            options={TABS.map((tItem) => ({ key: tItem.key, label: tItem.label }))}
          />
        </div>
        {canManage ? (
          <div className="shrink-0 sm:self-center">
            {renderAddButton(tab, getAddLabel())}
          </div>
        ) : null}
      </div>

      {/* FilterBar with Filter Icon Button & Expandable Filters */}
      <FilterBar
        search={{
          value: search,
          onChange: setSearch,
          placeholder: `${t("Search")} ${t(tab)}…`,
        }}
        activeCount={activeCount}
        onClear={handleClearFilters}
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Field label={t("Status")}>
            <CustomDropdown value={status} onChange={(e) => setStatus(e.target.value as StatusFilter)}>
              <option value="all">{t("All status")}</option>
              <option value="active">{t("Active")}</option>
              <option value="inactive">{t("Inactive")}</option>
            </CustomDropdown>
          </Field>

          {tab === "students" ? (
            <Field label={t("Class")}>
              <CustomDropdown value={classFilter} onChange={(e) => setClassFilter(e.target.value)}>
                <option value="">{t("All classes")}</option>
                {(classesQuery.data ?? []).map((cls) => (
                  <option key={cls.id} value={cls.name}>
                    {cls.name}
                  </option>
                ))}
              </CustomDropdown>
            </Field>
          ) : null}

          <Field label={t("Gender")}>
            <CustomDropdown value={genderFilter} onChange={(e) => setGenderFilter(e.target.value)}>
              <option value="all">{t("All genders")}</option>
              <option value="male">{t("Male")}</option>
              <option value="female">{t("Female")}</option>
            </CustomDropdown>
          </Field>
        </div>
      </FilterBar>

      {query.isLoading ? <SkeletonList rows={6} /> : null}
      {!query.isLoading && items.length === 0 ? (
        <div className="space-y-3 py-6 text-center">
          <EmptyState title={`${t("No")} ${t(tab)} ${t("found")}`} />
          {canManage ? (
            <div className="flex justify-center">
              {renderAddButton(tab, getAddLabel())}
            </div>
          ) : null}
        </div>
      ) : null}

      {/* Responsive Grid for Cards on Mobile & Desktop */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
        {items.map((person) => {
          const record = person as unknown as Record<string, unknown>;
          const id = String(record["id"]);
          const name = String(record["name"] ?? "");
          const subtitle =
            (record["admission_number"] as string) ??
            (record["employee_code"] as string) ??
            (record["phone_numbers"] as string) ??
            (record["contact"] as string) ??
            "";

          return (
            <Card
              key={id}
              className="grid grid-cols-[auto_minmax(0,1fr)_auto_auto] items-center gap-3 p-3.5 transition-shadow hover:shadow-md"
            >
              <button
                type="button"
                className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary-soft font-display text-sm font-extrabold text-primary"
                onClick={() => {
                  if (tab === "students") setDetailStudentId(id);
                  else if (tab === "teachers") setDetailTeacherId(id);
                  else if (tab === "guardians") setDetailGuardianId(id);
                }}
              >
                {name.slice(0, 1).toUpperCase()}
              </button>
              <button
                type="button"
                className="min-w-0 text-left ltr:text-left rtl:text-right"
                onClick={() => {
                  if (tab === "students") setDetailStudentId(id);
                  else if (tab === "teachers") setDetailTeacherId(id);
                  else if (tab === "guardians") setDetailGuardianId(id);
                }}
              >
                <p className="truncate font-semibold">{name}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {subtitle}
                  {record["relationship"] ? ` · ${String(record["relationship"])}` : ""}
                  {record["current_class"] ? ` · ${String(record["current_class"])}` : ""}
                </p>
              </button>
              {canManage && tab !== "donors" ? (
                <button
                  aria-label="Copy credentials link"
                  onClick={() => credentials(id)}
                  title={t("Copy credentials link")}
                  className="grid h-9 w-9 place-items-center rounded-xl bg-primary-soft text-primary transition-colors hover:bg-primary/20"
                >
                  <KeyRound className="h-4 w-4" />
                </button>
              ) : (
                <span />
              )}
              <Pill tone={(record["status"] ?? "active") === "active" ? "success" : "muted"}>
                {t(String(record["status"] ?? "active"))}
              </Pill>
            </Card>
          );
        })}
      </div>

      {query.hasNextPage ? (
        <button
          onClick={() => void query.fetchNextPage()}
          disabled={query.isFetchingNextPage}
          className="mt-4 w-full rounded-2xl border border-border py-3 text-sm font-bold text-primary transition-colors hover:bg-muted disabled:opacity-50"
        >
          {query.isFetchingNextPage ? `${t("Loading")}…` : t("Load more")}
        </button>
      ) : null}

      <StudentDetailSheet
        student={(rawItems as Student[]).find((s) => s.id === detailStudentId) as never}
        open={Boolean(detailStudentId)}
        onOpenChange={(next) => !next && setDetailStudentId(null)}
      />
      <TeacherDetailSheet
        teacher={(rawItems as Teacher[]).find((t) => t.id === detailTeacherId) as never}
        open={Boolean(detailTeacherId)}
        onOpenChange={(next) => !next && setDetailTeacherId(null)}
      />
      <GuardianDetailSheet
        guardian={(rawItems as Guardian[]).find((g) => g.id === detailGuardianId) as never}
        open={Boolean(detailGuardianId)}
        onOpenChange={(next) => !next && setDetailGuardianId(null)}
      />
    </AppShell>
  );
}

