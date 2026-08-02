import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Palmtree, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/app/AppShell";
import { FilterBar } from "@/components/app/FilterBar";
import { FormSheet } from "@/components/app/FormSheet";
import {
  Card,
  EmptyState,
  Field,
  Pill,
  SelectInput,
  SkeletonList,
  TextInput,
} from "@/components/app/Primitives";
import { useAuth } from "@/lib/mms/auth";
import { academicsApi } from "@/lib/mms/endpoints";
import { opsApi, opsMutations } from "@/lib/mms/more-endpoints";

export const Route = createFileRoute("/holidays")({
  head: () => ({
    meta: [
      { title: "Holidays — Suffa MS" },
      { name: "description", content: "Academic calendar breaks and madrasa holidays." },
      { property: "og:title", content: "Holidays — Suffa MS" },
      { property: "og:description", content: "Academic calendar breaks and madrasa holidays." },
    ],
  }),
  component: HolidaysPage,
});

const emptyFilters = { category: "", classId: "", dateFrom: "", dateTo: "" };

function HolidaysPage() {
  const { user } = useAuth();
  const client = useQueryClient();
  const canManage = user?.role === "principal" || user?.role === "super_admin";

  const [filters, setFilters] = useState(emptyFilters);
  const classes = useQuery({ queryKey: ["classes"], queryFn: () => academicsApi.listClasses() });

  const params = useMemo(
    () => ({
      category: filters.category || undefined,
      class_id: filters.classId || undefined,
      date_from: filters.dateFrom || undefined,
      date_to: filters.dateTo || undefined,
    }),
    [filters],
  );

  const query = useQuery({
    queryKey: ["holidays", params],
    queryFn: () => opsApi.listHolidays(params),
  });
  const items = (query.data ?? []).slice().sort((a, b) => a.start_date.localeCompare(b.start_date));
  const today = new Date().toISOString().slice(0, 10);

  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const item of query.data ?? []) if (item.category) set.add(item.category);
    return Array.from(set);
  }, [query.data]);

  const activeCount = [filters.category, filters.classId, filters.dateFrom, filters.dateTo].filter(
    Boolean,
  ).length;

  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [start, setStart] = useState(today);
  const [end, setEnd] = useState(today);

  const create = useMutation({
    mutationFn: () =>
      opsMutations.createHoliday({
        name: name.trim(),
        start_date: start,
        end_date: end,
        ...(category.trim() ? { category: category.trim() } : {}),
      }),
    onSuccess: () => {
      toast.success("Holiday added");
      setName("");
      setCategory("");
      void client.invalidateQueries({ queryKey: ["holidays"] });
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) => opsMutations.deleteHoliday(id),
    onSuccess: () => {
      toast.success("Holiday removed");
      void client.invalidateQueries({ queryKey: ["holidays"] });
    },
  });

  return (
    <AppShell
      title="Holidays"
      subtitle={`${items.length} in the calendar`}
      right={
        canManage ? (
          <FormSheet title="New holiday" triggerLabel="Add" onSubmit={() => create.mutateAsync()}>
            <Field label="Name">
              <TextInput required value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
            <Field label="Category">
              <TextInput
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="Public / Religious"
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Start">
                <TextInput
                  type="date"
                  required
                  value={start}
                  onChange={(e) => setStart(e.target.value)}
                />
              </Field>
              <Field label="End">
                <TextInput
                  type="date"
                  required
                  value={end}
                  onChange={(e) => setEnd(e.target.value)}
                />
              </Field>
            </div>
          </FormSheet>
        ) : undefined
      }
    >
      <FilterBar activeCount={activeCount} onClear={() => setFilters(emptyFilters)}>
        <Field label="Category">
          <SelectInput
            value={filters.category}
            onChange={(e) => setFilters((f) => ({ ...f, category: e.target.value }))}
          >
            <option value="">All categories</option>
            {categories.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
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
        <div className="grid grid-cols-2 gap-3">
          <Field label="From">
            <TextInput
              type="date"
              value={filters.dateFrom}
              onChange={(e) => setFilters((f) => ({ ...f, dateFrom: e.target.value }))}
            />
          </Field>
          <Field label="To">
            <TextInput
              type="date"
              value={filters.dateTo}
              onChange={(e) => setFilters((f) => ({ ...f, dateTo: e.target.value }))}
            />
          </Field>
        </div>
      </FilterBar>

      {query.isLoading ? <SkeletonList rows={4} /> : null}
      {!query.isLoading && items.length === 0 ? <EmptyState title="No holidays scheduled" /> : null}

      <div className="space-y-2.5">
        {items.map((item) => {
          const upcoming = item.end_date >= today;
          return (
            <Card
              key={item.id}
              className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 p-3.5"
            >
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent-foreground">
                <Palmtree className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <p className="truncate font-semibold">{item.name}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {new Date(item.start_date).toLocaleDateString()} —{" "}
                  {new Date(item.end_date).toLocaleDateString()}
                  {item.category ? ` · ${item.category}` : ""}
                </p>
              </div>
              {canManage ? (
                <button
                  aria-label="Delete holiday"
                  onClick={() => remove.mutate(item.id)}
                  className="grid h-9 w-9 place-items-center rounded-xl bg-destructive/10 text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              ) : (
                <Pill tone={upcoming ? "success" : "muted"}>{upcoming ? "Upcoming" : "Past"}</Pill>
              )}
            </Card>
          );
        })}
      </div>
    </AppShell>
  );
}
