import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Edit2, FileText, Send, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/app/AppShell";
import { FormEditorSheet } from "@/components/app/forms/FormEditorSheet";
import { FillFormSheet } from "@/components/app/forms/FillFormSheet";
import { ResponsesPanel } from "@/components/app/forms/ResponsesPanel";
import {
  Card,
  EmptyState,
  Pill,
  Segmented,
  CustomDropdown,
  SkeletonList,
  TextInput,
} from "@/components/app/Primitives";
import { useAuth } from "@/lib/mms/auth";
import { formsApi, type FormDef } from "@/lib/mms/more-endpoints";
import { useTranslation } from "react-i18next";

export const Route = createFileRoute("/forms")({
  head: () => ({
    meta: [
      { title: "Forms — Suffa MS" },
      { name: "description", content: "Custom forms and responses" },
    ],
  }),
  component: FormsPage,
});

function windowState(form: FormDef): { label: string; tone: "success" | "destructive" | "muted" } {
  const now = Date.now();
  if (form.open_from && new Date(form.open_from).getTime() > now) {
    return { label: "Not open yet", tone: "muted" };
  }
  if (form.open_until && new Date(form.open_until).getTime() < now) {
    return { label: "Closed", tone: "destructive" };
  }
  return { label: "Open", tone: "success" };
}

function scopeLabel(form: FormDef): string {
  if (!form.visibility_scope || form.visibility_scope.all) return "Everyone";
  const roles = form.visibility_scope.roles ?? [];
  return roles.length ? roles.join(", ") : "Restricted";
}

function FormsPage() {
    const { t } = useTranslation();
  const { user, hasPermission } = useAuth();
  const client = useQueryClient();
  const canCreate =
    user?.role === "principal" || user?.role === "super_admin" || hasPermission("forms.create");
  const canViewResponses = hasPermission("forms.responses.view") || canCreate;

  const [tab, setTab] = useState<"forms" | "responses">("forms");
  const [category, setCategory] = useState("");
  const [search, setSearch] = useState("");
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingForm, setEditingForm] = useState<FormDef | null>(null);
  const [fillForm, setFillForm] = useState<FormDef | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<FormDef | null>(null);

  const query = useQuery({
    queryKey: ["forms", category],
    queryFn: () => formsApi.listForms({ category: category || undefined }),
  });
  const forms = query.data ?? [];

  const categories = useMemo(
    () => Array.from(new Set(forms.map((f) => f.category).filter(Boolean))) as string[],
    [forms],
  );

  const visibleForms = forms.filter((f) =>
    search.trim() ? f.title.toLowerCase().includes(search.trim().toLowerCase()) : true,
  );

  const remove = useMutation({
    mutationFn: (id: string) => formsApi.deleteForm(id),
    onSuccess: () => {
      toast.success("Form deleted");
      setDeleteTarget(null);
      void client.invalidateQueries({ queryKey: ["forms"] });
    },
    onError: () => toast.error("Failed to delete form"),
  });

  const canEditForm = (form: FormDef) =>
    canCreate && (form.created_by_id === user?.id || hasPermission("forms.manage_all"));

  return (
    <AppShell
      title={t("Forms")}
      subtitle={`${forms.length} forms`}
      right={
        canCreate && tab === "forms" ? (
          <button
            type="button"
            onClick={() => {
              setEditingForm(null);
              setEditorOpen(true);
            }}
            className="gradient-emerald inline-flex items-center gap-1.5 rounded-2xl px-3.5 py-2 font-display text-xs font-extrabold uppercase tracking-wide text-primary-foreground shadow-[var(--shadow-raised)]"
          >
            {t("New")}</button>
        ) : undefined
      }
    >
      {canViewResponses ? (
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { key: "forms", label: "Forms" },
            { key: "responses", label: "Responses" },
          ]}
        />
      ) : null}

      {tab === "forms" ? (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2.5">
            <TextInput
              placeholder={t("Search forms…")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <CustomDropdown value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="">{t("All categories")}</option>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </CustomDropdown>
          </div>

          {query.isLoading ? <SkeletonList rows={4} /> : null}
          {!query.isLoading && visibleForms.length === 0 ? (
            <EmptyState title={t("No forms found")} hint="New forms will appear here." />
          ) : null}

          <div className="space-y-2.5">
            {visibleForms.map((form) => {
              const state = windowState(form);
              return (
                <Card key={form.id} className="space-y-2.5 p-3.5">
                  <div className="flex items-start gap-3">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary">
                      <FileText className="h-4 w-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-display text-base font-extrabold leading-snug">
                        {form.title}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {form.category ?? "General"} · {scopeLabel(form)}
                      </p>
                    </div>
                    <Pill tone={state.tone}>{state.label}</Pill>
                  </div>
                  {form.description ? (
                    <p className="text-sm text-muted-foreground">{form.description}</p>
                  ) : null}
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      disabled={state.label !== "Open"}
                      onClick={() => setFillForm(form)}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-primary-soft px-3 py-1.5 text-xs font-bold text-primary disabled:opacity-40"
                    >
                      <Send className="h-3.5 w-3.5" /> {t("Fill out")}</button>
                    {canEditForm(form) ? (
                      <>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingForm(form);
                            setEditorOpen(true);
                          }}
                          className="inline-flex items-center gap-1.5 rounded-xl bg-muted px-3 py-1.5 text-xs font-bold"
                        >
                          <Edit2 className="h-3.5 w-3.5" /> {t("Edit")}</button>
                        <button
                          type="button"
                          onClick={() => setDeleteTarget(form)}
                          className="ml-auto inline-flex items-center gap-1.5 rounded-xl bg-destructive/10 px-3 py-1.5 text-xs font-bold text-destructive"
                        >
                          <Trash2 className="h-3.5 w-3.5" /> {t("Delete")}</button>
                      </>
                    ) : null}
                  </div>
                </Card>
              );
            })}
          </div>
        </div>
      ) : (
        <ResponsesPanel forms={forms} />
      )}

      <FormEditorSheet
        form={editingForm}
        open={editorOpen}
        onOpenChange={setEditorOpen}
        onSaved={() => {
          setEditorOpen(false);
          void client.invalidateQueries({ queryKey: ["forms"] });
        }}
      />

      {fillForm ? (
        <FillFormSheet
          form={fillForm}
          open={Boolean(fillForm)}
          onOpenChange={(next) => !next && setFillForm(null)}
          onSubmitted={() => {
            setFillForm(null);
            void client.invalidateQueries({ queryKey: ["form-responses"] });
          }}
        />
      ) : null}

      {deleteTarget ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
          <div className="w-full max-w-sm space-y-3 rounded-3xl bg-card p-5">
            <p className="font-display text-base font-extrabold">{t("Delete this form?")}</p>
            <p className="text-sm text-muted-foreground">
              "{deleteTarget.title}{t("\" and its responses will be removed. This cannot be undone.")}</p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                className="flex-1 rounded-2xl bg-muted px-4 py-2.5 text-sm font-bold"
              >
                {t("Cancel")}</button>
              <button
                type="button"
                onClick={() => remove.mutate(deleteTarget.id)}
                disabled={remove.isPending}
                className="flex-1 rounded-2xl bg-destructive px-4 py-2.5 text-sm font-bold text-destructive-foreground disabled:opacity-60"
              >
                {t("Delete")}</button>
            </div>
          </div>
        </div>
      ) : null}
    </AppShell>
  );
}
