import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { CalendarDays, Loader2, Plus } from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/app/AppShell";
import { FilterBar } from "@/components/app/FilterBar";
import {
  Card,
  EmptyState,
  Field,
  Pill,
  SectionTitle,
  SelectInput,
  SkeletonList,
} from "@/components/app/Primitives";
import { useAuth } from "@/lib/mms/auth";
import { apiErrorMessage } from "@/lib/mms/api";
import { academicsApi } from "@/lib/mms/endpoints";
import { opsApi, type Leave } from "@/lib/mms/more-endpoints";

export const Route = createFileRoute("/leave")({
  head: () => ({
    meta: [
      { title: "Leave — Suffa MS" },
      { name: "description", content: "Apply for leave and track approvals across the madrasa." },
      { property: "og:title", content: "Leave — Suffa MS" },
      { property: "og:description", content: "Apply for leave and track approvals." },
    ],
  }),
  component: LeavePage,
});

const STATUS_CHIPS = ["all", "pending", "approved", "rejected"] as const;

function tone(status: string) {
  if (status === "approved") return "success" as const;
  if (status === "rejected") return "destructive" as const;
  return "warning" as const;
}

const emptyFilters = {
  status: "",
  personType: "" as "" | "teacher" | "student",
  classId: "",
  dateFrom: "",
  dateTo: "",
  search: "",
};

function LeavePage() {
  const { hasPermission } = useAuth();
  const canReview = hasPermission("leave.manage");
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ start_date: "", end_date: "", reason: "" });
  const [filters, setFilters] = useState(emptyFilters);

  const classes = useQuery({
    queryKey: ["classes"],
    queryFn: () => academicsApi.listClasses(),
    enabled: canReview,
  });

  const params = useMemo(
    () => ({
      status: filters.status || undefined,
      person_type: canReview ? filters.personType || undefined : undefined,
      class_id: canReview ? filters.classId || undefined : undefined,
      date_from: filters.dateFrom || undefined,
      date_to: filters.dateTo || undefined,
      q: filters.search || undefined,
    }),
    [filters, canReview],
  );

  const query = useQuery({
    queryKey: ["leave", canReview, params],
    queryFn: () => (canReview ? opsApi.listLeave(params) : opsApi.listMyLeave()),
  });

  const create = useMutation({
    mutationFn: () => opsApi.createLeave(form),
    onSuccess: () => {
      toast.success("Leave request submitted");
      setOpen(false);
      setForm({ start_date: "", end_date: "", reason: "" });
      void queryClient.invalidateQueries({ queryKey: ["leave"] });
    },
    onError: (error) => toast.error(apiErrorMessage(error, "Couldn't submit request")),
  });

  const review = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      opsApi.setLeaveStatus(id, status),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["leave"] }),
  });

  let items = query.data ?? [];
  if (!canReview && filters.status) items = items.filter((item) => item.status === filters.status);
  if (!canReview && filters.dateFrom)
    items = items.filter((item) => item.end_date >= filters.dateFrom);
  if (!canReview && filters.dateTo)
    items = items.filter((item) => item.start_date <= filters.dateTo);
  if (!canReview && filters.search) {
    const q = filters.search.toLowerCase();
    items = items.filter((item) =>
      [item.reason ?? "", item.status, item.person_name ?? ""].some((v) =>
        v.toLowerCase().includes(q),
      ),
    );
  }

  const activeCount = [
    filters.status,
    canReview ? filters.personType : "",
    canReview ? filters.classId : "",
    filters.dateFrom,
    filters.dateTo,
    filters.search,
  ].filter(Boolean).length;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    create.mutate();
  };

  return (
    <AppShell
      title="Leave"
      subtitle={canReview ? "All requests" : "My requests"}
      right={
        <button
          onClick={() => setOpen((value) => !value)}
          className="grid h-10 w-10 place-items-center rounded-2xl bg-primary-foreground/15 text-primary-foreground"
          aria-label="New leave request"
        >
          <Plus className="h-5 w-5" />
        </button>
      }
    >
      {open ? (
        <form onSubmit={submit} className="card-surface mb-3 space-y-3 p-4">
          <p className="font-display text-sm font-extrabold">New request</p>
          <div className="grid grid-cols-2 gap-2">
            <input
              type="date"
              required
              value={form.start_date}
              onChange={(e) => setForm({ ...form, start_date: e.target.value })}
              className="rounded-xl bg-muted px-3 py-2.5 text-sm outline-none"
            />
            <input
              type="date"
              required
              value={form.end_date}
              onChange={(e) => setForm({ ...form, end_date: e.target.value })}
              className="rounded-xl bg-muted px-3 py-2.5 text-sm outline-none"
            />
          </div>
          <textarea
            required
            rows={3}
            placeholder="Reason"
            value={form.reason}
            onChange={(e) => setForm({ ...form, reason: e.target.value })}
            className="w-full rounded-xl bg-muted px-3 py-2.5 text-sm outline-none"
          />
          <button
            type="submit"
            disabled={create.isPending}
            className="gradient-emerald flex w-full items-center justify-center gap-2 rounded-2xl py-3 font-display text-sm font-extrabold text-primary-foreground disabled:opacity-60"
          >
            {create.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Submit request
          </button>
        </form>
      ) : null}

      <FilterBar
        chips={STATUS_CHIPS.map((key) => ({
          key,
          label: key,
          active: (filters.status || "all") === key,
          onClick: () => setFilters((f) => ({ ...f, status: key === "all" ? "" : key })),
        }))}
        search={{
          value: filters.search,
          onChange: (v) => setFilters((f) => ({ ...f, search: v })),
          placeholder: "Search reason, name…",
        }}
        activeCount={activeCount}
        onClear={() => setFilters(emptyFilters)}
      >
        {canReview ? (
          <>
            <Field label="Person type">
              <SelectInput
                value={filters.personType}
                onChange={(e) =>
                  setFilters((f) => ({
                    ...f,
                    personType: e.target.value as "" | "teacher" | "student",
                  }))
                }
              >
                <option value="">All</option>
                <option value="teacher">Teacher</option>
                <option value="student">Student</option>
              </SelectInput>
            </Field>
            <Field label="Class">
              <SelectInput
                value={filters.classId}
                onChange={(e) => setFilters((f) => ({ ...f, classId: e.target.value }))}
              >
                <option value="">All classes</option>
                {(classes.data ?? []).map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </SelectInput>
            </Field>
          </>
        ) : null}
        <div className="grid grid-cols-2 gap-3">
          <Field label="From">
            <input
              type="date"
              value={filters.dateFrom}
              onChange={(e) => setFilters((f) => ({ ...f, dateFrom: e.target.value }))}
              className="w-full rounded-2xl border border-border bg-card px-3.5 py-2.5 text-sm outline-none focus:border-primary"
            />
          </Field>
          <Field label="To">
            <input
              type="date"
              value={filters.dateTo}
              onChange={(e) => setFilters((f) => ({ ...f, dateTo: e.target.value }))}
              className="w-full rounded-2xl border border-border bg-card px-3.5 py-2.5 text-sm outline-none focus:border-primary"
            />
          </Field>
        </div>
      </FilterBar>

      <SectionTitle>Requests</SectionTitle>
      {query.isLoading ? <SkeletonList rows={4} /> : null}
      {!query.isLoading && items.length === 0 ? <EmptyState title="No leave requests" /> : null}

      <div className="space-y-2.5">
        {items.map((item: Leave) => (
          <Card key={item.id} className="space-y-2 p-3.5">
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
              <div className="min-w-0">
                <p className="truncate font-semibold">{item.person_name ?? "Leave request"}</p>
                <p className="flex items-center gap-1 text-xs text-muted-foreground">
                  <CalendarDays className="h-3.5 w-3.5" />
                  {new Date(item.start_date).toLocaleDateString()} —{" "}
                  {new Date(item.end_date).toLocaleDateString()}
                </p>
              </div>
              <Pill tone={tone(item.status)}>{item.status}</Pill>
            </div>
            {item.reason ? <p className="text-sm text-muted-foreground">{item.reason}</p> : null}
            {canReview && item.status === "pending" ? (
              <div className="grid grid-cols-2 gap-2 pt-1">
                <button
                  onClick={() => review.mutate({ id: item.id, status: "approved" })}
                  className="rounded-xl bg-primary-soft py-2 text-xs font-bold uppercase tracking-wide text-success"
                >
                  Approve
                </button>
                <button
                  onClick={() => review.mutate({ id: item.id, status: "rejected" })}
                  className="rounded-xl bg-destructive/10 py-2 text-xs font-bold uppercase tracking-wide text-destructive"
                >
                  Reject
                </button>
              </div>
            ) : null}
          </Card>
        ))}
      </div>
    </AppShell>
  );
}
