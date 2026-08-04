import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Edit2, Palmtree, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";

import { AppShell } from "@/components/app/AppShell";
import { HolidayFormFields, type HolidayFormValues } from "@/components/app/content/HolidayFormFields";
import { FilterBar } from "@/components/app/FilterBar";
import { FormSheet } from "@/components/app/FormSheet";
import {
  Card,
  EmptyState,
  Field,
  Pill,
  CustomDropdown,
  SkeletonList,
  TextInput,
} from "@/components/app/Primitives";
import { useAuth } from "@/lib/mms/auth";
import { academicsApi } from "@/lib/mms/endpoints";
import { applyMutationSuccess } from "@/lib/mms/mutation-helpers";
import { opsApi, opsMutations } from "@/lib/mms/more-endpoints";
import { useTranslation } from "react-i18next";

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
    const { t } = useTranslation();
  const { user } = useAuth();
  const client = useQueryClient();
  const canManage = user?.role === "principal" || user?.role === "super_admin" || user?.is_principal_delegate;

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

  const [form, setForm] = useState<HolidayFormValues>({
    name: "",
    category: "",
    start: today,
    end: today,
    classId: "",
  });
  const [editing, setEditing] = useState<(typeof items)[number] | null>(null);

  const create = useMutation({
    mutationFn: () =>
      opsMutations.createHoliday({
        name: form.name.trim(),
        start_date: form.start,
        end_date: form.end,
        ...(form.category.trim() ? { category: form.category.trim() } : {}),
        ...(form.classId ? { class_ids: [form.classId] } : {}),
      }),
    onSuccess: () =>
      applyMutationSuccess({
        client,
        message: "Holiday added",
        queryKeys: [["holidays"]],
        afterSuccess: () =>
          setForm({ name: "", category: "", start: today, end: today, classId: "" }),
      }),
  });

  const remove = useMutation({
    mutationFn: (id: string) => opsMutations.deleteHoliday(id),
    onSuccess: () =>
      applyMutationSuccess({
        client,
        message: "Holiday removed",
        queryKeys: [["holidays"]],
      }),
  });

  return (
    <AppShell
      title={t("Holidays")}
      subtitle={`${items.length} in the calendar`}
      right={
        canManage ? (
          <FormSheet title={t("New holiday")} triggerLabel="Add" onSubmit={() => create.mutateAsync()}>
            <HolidayFormFields
              values={form}
              classOptions={classes.data ?? []}
              onChange={(patch) => setForm((current) => ({ ...current, ...patch }))}
            />
          </FormSheet>
        ) : undefined
      }
    >
      <FilterBar activeCount={activeCount} onClear={() => setFilters(emptyFilters)}>
        <Field label={t("Category")}>
          <CustomDropdown
            value={filters.category}
            onChange={(e) => setFilters((f) => ({ ...f, category: e.target.value }))}
          >
            <option value="">{t("All categories")}</option>
            {categories.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </CustomDropdown>
        </Field>
        <Field label={t("Class")}>
          <CustomDropdown
            value={filters.classId}
            onChange={(e) => setFilters((f) => ({ ...f, classId: e.target.value }))}
          >
            <option value="">{t("All classes")}</option>
            {(classes.data ?? []).map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </CustomDropdown>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t("From")}>
            <TextInput
              type="date"
              value={filters.dateFrom}
              onChange={(e) => setFilters((f) => ({ ...f, dateFrom: e.target.value }))}
            />
          </Field>
          <Field label={t("To")}>
            <TextInput
              type="date"
              value={filters.dateTo}
              onChange={(e) => setFilters((f) => ({ ...f, dateTo: e.target.value }))}
            />
          </Field>
        </div>
      </FilterBar>

      {query.isLoading ? <SkeletonList rows={4} /> : null}
      {!query.isLoading && items.length === 0 ? <EmptyState title={t("No holidays scheduled")} /> : null}

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
                <div className="flex gap-2">
                  <button
                    aria-label="Edit holiday"
                    onClick={() => setEditing(item)}
                    className="grid h-9 w-9 place-items-center rounded-xl bg-primary-soft text-primary"
                  >
                    <Edit2 className="h-4 w-4" />
                  </button>
                  <button
                    aria-label="Delete holiday"
                    onClick={() => remove.mutate(item.id)}
                    className="grid h-9 w-9 place-items-center rounded-xl bg-destructive/10 text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <Pill tone={upcoming ? "success" : "muted"}>{upcoming ? "Upcoming" : "Past"}</Pill>
              )}
            </Card>
          );
        })}
      </div>

      {editing ? (
        <EditHolidaySheet holiday={editing} classes={classes.data ?? []} onClose={() => setEditing(null)} />
      ) : null}
    </AppShell>
  );
}

function EditHolidaySheet({
  holiday,
  classes,
  onClose,
}: {
  holiday: {
    id: string;
    name: string;
    category: string | null;
    start_date: string;
    end_date: string;
    class_ids: string[] | null;
  };
  classes: { id: string; name: string }[];
  onClose: () => void;
}) {
    const { t } = useTranslation();
  const client = useQueryClient();
  const [form, setForm] = useState<HolidayFormValues>({
    name: holiday.name,
    category: holiday.category ?? "",
    start: holiday.start_date,
    end: holiday.end_date,
    classId: holiday.class_ids?.[0] ?? "",
  });

  const update = useMutation({
    mutationFn: () =>
      opsMutations.updateHoliday(holiday.id, {
        name: form.name.trim(),
        category: form.category.trim() || null,
        start_date: form.start,
        end_date: form.end,
        class_ids: form.classId ? [form.classId] : null,
      }),
    onSuccess: () =>
      applyMutationSuccess({
        client,
        message: "Holiday updated",
        queryKeys: [["holidays"]],
        afterSuccess: onClose,
      }),
  });

  return (
    <FormSheet
      title={t("Edit holiday")}
      submitLabel="Save changes"
      open
      onOpenChange={(next) => !next && onClose()}
      onSubmit={() => update.mutateAsync()}
    >
      <HolidayFormFields
        values={form}
        classOptions={classes}
        onChange={(patch) => setForm((current) => ({ ...current, ...patch }))}
      />
    </FormSheet>
  );
}
