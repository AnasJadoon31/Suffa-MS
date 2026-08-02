import { useInfiniteQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { GraduationCap, KeyRound, Search, ShieldCheck, Users } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/app/AppShell";
import {
  Card,
  EmptyState,
  Pill,
  Segmented,
  SkeletonList,
  TextInput,
} from "@/components/app/Primitives";
import {
  GuardianDetailSheet,
  StudentDetailSheet,
  TeacherDetailSheet,
} from "@/components/app/people/PersonDetail";
import { StudentForm } from "@/components/app/people/StudentForm";
import { TeacherForm } from "@/components/app/people/TeacherForm";
import { GuardianForm } from "@/components/app/people/GuardianForm";
import { useAuth } from "@/lib/mms/auth";
import { peopleApi, type Guardian, type Student, type Teacher } from "@/lib/mms/endpoints";
import { peopleMutations } from "@/lib/mms/more-endpoints";

export const Route = createFileRoute("/people")({
  head: () => ({
    meta: [
      { title: "People — Suffa MS" },
      { name: "description", content: "Browse students, teachers and guardians of the madrasa." },
      { property: "og:title", content: "People — Suffa MS" },
      {
        property: "og:description",
        content: "Browse students, teachers and guardians of the madrasa.",
      },
    ],
  }),
  component: PeoplePage,
});

type Tab = "students" | "teachers" | "guardians";
type StatusFilter = "all" | "active" | "inactive";

const TABS: { key: Tab; label: string; icon: typeof Users }[] = [
  { key: "students", label: "Students", icon: GraduationCap },
  { key: "teachers", label: "Teachers", icon: Users },
  { key: "guardians", label: "Guardians", icon: ShieldCheck },
];

const PAGE_SIZE = 20;

function PeoplePage() {
  const { user } = useAuth();
  const canManage = user?.role === "principal" || user?.role === "super_admin";

  const [tab, setTab] = useState<Tab>("students");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");

  const [detailStudentId, setDetailStudentId] = useState<string | null>(null);
  const [detailTeacherId, setDetailTeacherId] = useState<string | null>(null);
  const [detailGuardianId, setDetailGuardianId] = useState<string | null>(null);

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
      return { kind: "guardians" as const, page: await peopleApi.listGuardiansPage(params) };
    },
    getNextPageParam: (lastPage, pages) => {
      const loaded = pages.reduce((sum, p) => sum + p.page.items.length, 0);
      return loaded < lastPage.page.total ? loaded : undefined;
    },
  });

  const rawItems = (query.data?.pages.flatMap((p) => p.page.items as unknown[]) ?? []) as (
    Student | Teacher | Guardian
  )[];
  const items = rawItems.filter((item) => {
    if (status === "all") return true;
    const itemStatus = (item as { status?: string }).status ?? "active";
    return status === "active" ? itemStatus === "active" : itemStatus !== "active";
  });
  const total = query.data?.pages[0]?.page.total ?? 0;

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

  return (
    <AppShell
      title="People"
      subtitle={query.data ? `${total} records` : "Directory"}
      right={
        canManage ? (
          tab === "students" ? (
            <StudentForm triggerLabel="Add" />
          ) : tab === "teachers" ? (
            <TeacherForm triggerLabel="Add" />
          ) : (
            <GuardianForm triggerLabel="Add" />
          )
        ) : undefined
      }
    >
      <Segmented
        value={tab}
        onChange={(next) => {
          setTab(next);
          setStatus("all");
        }}
        options={TABS.map(({ key, label }) => ({ key, label }))}
      />

      <div className="mb-3 space-y-2">
        <label className="card-surface flex items-center gap-2 px-3.5 py-2.5">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={`Search ${tab}`}
            className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
        </label>
        <Segmented
          value={status}
          onChange={setStatus}
          options={[
            { key: "all", label: "All" },
            { key: "active", label: "Active" },
            { key: "inactive", label: "Inactive" },
          ]}
        />
      </div>

      {query.isLoading ? <SkeletonList rows={6} /> : null}
      {!query.isLoading && items.length === 0 ? <EmptyState title={`No ${tab} found`} /> : null}

      <div className="space-y-2">
        {items.map((person) => {
          const record = person as unknown as Record<string, unknown>;
          const id = String(record["id"]);
          const name = String(record["name"] ?? "");
          const subtitle =
            (record["admission_number"] as string) ??
            (record["employee_code"] as string) ??
            (record["phone_numbers"] as string) ??
            "";
          return (
            <Card
              key={id}
              className="grid grid-cols-[auto_minmax(0,1fr)_auto_auto] items-center gap-3 p-3"
            >
              <button
                type="button"
                className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary-soft font-display text-sm font-extrabold text-primary"
                onClick={() => {
                  if (tab === "students") setDetailStudentId(id);
                  else if (tab === "teachers") setDetailTeacherId(id);
                  else setDetailGuardianId(id);
                }}
              >
                {name.slice(0, 1).toUpperCase()}
              </button>
              <button
                type="button"
                className="min-w-0 text-left"
                onClick={() => {
                  if (tab === "students") setDetailStudentId(id);
                  else if (tab === "teachers") setDetailTeacherId(id);
                  else setDetailGuardianId(id);
                }}
              >
                <p className="truncate font-semibold">{name}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {subtitle}
                  {record["relationship"] ? ` · ${String(record["relationship"])}` : ""}
                  {record["current_class"] ? ` · ${String(record["current_class"])}` : ""}
                </p>
              </button>
              {canManage ? (
                <button
                  aria-label="Copy credentials link"
                  onClick={() => credentials(id)}
                  className="grid h-9 w-9 place-items-center rounded-xl bg-primary-soft text-primary"
                >
                  <KeyRound className="h-4 w-4" />
                </button>
              ) : (
                <span />
              )}
              <Pill tone={(record["status"] ?? "active") === "active" ? "success" : "muted"}>
                {String(record["status"] ?? "active")}
              </Pill>
            </Card>
          );
        })}
      </div>

      {query.hasNextPage ? (
        <button
          onClick={() => void query.fetchNextPage()}
          disabled={query.isFetchingNextPage}
          className="mt-3 w-full rounded-2xl border border-border py-2.5 text-sm font-bold text-primary disabled:opacity-50"
        >
          {query.isFetchingNextPage ? "Loading…" : "Load more"}
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
