import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Outlet, useLocation, useNavigate } from "@tanstack/react-router";
import { Edit2, FileText, Phone, Share2, Trash2, UserPlus } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { api } from "@/lib/mms/api";

import { AppShell } from "@/components/app/AppShell";
import { FilterBar } from "@/components/app/FilterBar";
import {
  ActionButton,
  Card,
  EmptyState,
  Field,
  Pill,
  CustomDropdown,
  SkeletonList,
  TextInput,
  Segmented,
} from "@/components/app/Primitives";
import { AdmissionFormEditorSheet } from "@/components/app/admissions/AdmissionFormEditorSheet";
import { useAuth } from "@/lib/mms/auth";
import {
  academicsExtraApi,
  filesApi,
  opsApi,
  type AdmissionApplication,
  type AdmissionForm,
} from "@/lib/mms/more-endpoints";
import { useTranslation } from "react-i18next";

export const Route = createFileRoute("/admissions")({
  head: () => ({
    meta: [
      { title: "Admissions — Suffa MS" },
      { name: "description", content: "Track admission applications from enquiry to enrolment." },
      { property: "og:title", content: "Admissions — Suffa MS" },
      {
        property: "og:description",
        content: "Track admission applications from enquiry to enrolment.",
      },
    ],
  }),
  component: AdmissionsPage,
});

const FILTERS = ["all", "pending", "accepted", "rejected"] as const;
const emptyExtra = { search: "" };

function ApplicationAvatar({ application }: { application: AdmissionApplication }) {
  const pictureKey = typeof application.extra_data?.["student_profile_picture"] === "string"
    ? application.extra_data["student_profile_picture"]
    : "";
  const picture = useQuery({
    queryKey: ["admission-photo", pictureKey],
    queryFn: () => filesApi.presignDownload(pictureKey),
    enabled: Boolean(pictureKey),
    retry: false,
  });

  return <span className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-xl bg-primary-soft text-primary">
    {picture.data ? <img src={picture.data} alt="" className="h-full w-full object-cover" /> : <UserPlus className="h-5 w-5" />}
  </span>;
}

function AdmissionsPage() {
    const { t } = useTranslation();
  const { hasPermission } = useAuth();
  const canManage = hasPermission("admissions.manage");
  const location = useLocation();
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("all");
  const [extra, setExtra] = useState(emptyExtra);
  const [applicationFormFilter, setApplicationFormFilter] = useState("");
  const [applicationProgramFilter, setApplicationProgramFilter] = useState("");
  const [conversionFilter, setConversionFilter] = useState("all");
  const [applicationFrom, setApplicationFrom] = useState("");
  const [applicationTo, setApplicationTo] = useState("");
  const [formSearch, setFormSearch] = useState("");
  const [formStatusFilter, setFormStatusFilter] = useState("all");
  const [formCategoryFilter, setFormCategoryFilter] = useState("");
  const [formProgramFilter, setFormProgramFilter] = useState("");
  const navigate = useNavigate();
  const [tab, setTab] = useState<"applications" | "forms">("applications");
  const [formEditorOpen, setFormEditorOpen] = useState(false);
  const [editingForm, setEditingForm] = useState<AdmissionForm | null>(null);
  const [deleteForm, setDeleteForm] = useState<AdmissionForm | null>(null);

  const query = useQuery({
    queryKey: ["admissions"],
    queryFn: () => opsApi.listAdmissions(),
    retry: false,
  });

  const items = useMemo(() => {
    const search = extra.search.trim().toLowerCase();
    return (query.data ?? []).filter((item) => {
      if (filter !== "all" && item.status !== filter) return false;
      if (applicationFormFilter && item.form_id !== applicationFormFilter) return false;
      if (applicationProgramFilter && item.program_id !== applicationProgramFilter) return false;
      if (conversionFilter === "converted" && !item.converted_at) return false;
      if (conversionFilter === "not_converted" && item.converted_at) return false;
      if (applicationFrom && item.created_at.slice(0, 10) < applicationFrom) return false;
      if (applicationTo && item.created_at.slice(0, 10) > applicationTo) return false;
      if (!search) return true;
      return [
        item.applicant_name,
        item.guardian_contact,
        item.notes ?? "",
        item.form_title_snapshot ?? "",
      ]
        .join(" ")
        .toLowerCase()
        .includes(search);
    });
  }, [applicationFormFilter, applicationFrom, applicationProgramFilter, applicationTo, conversionFilter, extra.search, filter, query.data]);

  const programs = useQuery({
    queryKey: ["programs"],
    queryFn: () => academicsExtraApi.listPrograms(),
    enabled: canManage,
    retry: false,
  });
  const forms = useQuery({
    queryKey: ["admission-forms"],
    queryFn: () => opsApi.listAdmissionForms(),
    enabled: canManage,
    retry: false,
  });

  const filteredForms = useMemo(() => {
    const search = formSearch.trim().toLowerCase();
    return (forms.data ?? []).filter((form) => {
      if (formStatusFilter === "open" && !form.is_open) return false;
      if (formStatusFilter === "closed" && form.is_open) return false;
      if (formCategoryFilter && form.category !== formCategoryFilter) return false;
      if (formProgramFilter && form.program_id !== formProgramFilter) return false;
      if (!search) return true;
      return `${form.title} ${form.description} ${form.category} ${form.program_name ?? ""}`.toLowerCase().includes(search);
    });
  }, [formCategoryFilter, formProgramFilter, formSearch, formStatusFilter, forms.data]);

  async function shareApplicationForm(form: AdmissionForm) {
    const link = new URL(`/admission/${form.public_token}`, window.location.origin).toString();
    const supportsNativeShare = typeof navigator.share === "function" && navigator.maxTouchPoints > 0;
    try {
      if (supportsNativeShare) {
        await navigator.share({ title: form.title, text: form.description || form.title, url: link });
        return;
      }
      await navigator.clipboard.writeText(link);
      toast.success("Application form link copied");
    } catch (error) {
      if ((error as DOMException)?.name !== "AbortError") toast.error("Failed to share application form");
    }
  }

  const activeCount =
    (filter !== "all" ? 1 : 0) +
    (extra.search ? 1 : 0) +
    (applicationFormFilter ? 1 : 0) +
    (applicationProgramFilter ? 1 : 0) +
    (conversionFilter !== "all" ? 1 : 0) +
    (applicationFrom ? 1 : 0) +
    (applicationTo ? 1 : 0);

  const formActiveCount =
    (formSearch ? 1 : 0) +
    (formStatusFilter !== "all" ? 1 : 0) +
    (formCategoryFilter ? 1 : 0) +
    (formProgramFilter ? 1 : 0);

  if (/^\/admissions\/[^/]+$/.test(location.pathname)) return <Outlet />;

  return (
    <AppShell
      title={t("Admissions")}
      subtitle={tab === "forms" ? `${filteredForms.length} application forms` : `${items.length} applications`}
      right={canManage && tab === "forms" ? (
        <button type="button" onClick={() => { setEditingForm(null); setFormEditorOpen(true); }} className="gradient-emerald inline-flex items-center gap-1.5 rounded-2xl px-3.5 py-2 font-display text-xs font-extrabold uppercase tracking-wide text-primary-foreground">
          {t("New")}
        </button>
      ) : undefined}
    >
      <Segmented value={tab} onChange={(value) => setTab(value as "applications" | "forms")} options={[{ key: "applications", label: "Applications" }, { key: "forms", label: "Application forms" }]} />

      {tab === "forms" ? (
        <>
        <FilterBar
          search={{ value: formSearch, onChange: setFormSearch, placeholder: "Search application forms…" }}
          activeCount={formActiveCount}
          onClear={() => {
            setFormSearch("");
            setFormStatusFilter("all");
            setFormCategoryFilter("");
            setFormProgramFilter("");
          }}
        >
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Field label={t("Status")}>
              <CustomDropdown value={formStatusFilter} onChange={(event) => setFormStatusFilter(event.target.value)}>
                <option value="all">{t("All statuses")}</option>
                <option value="open">{t("Open")}</option>
                <option value="closed">{t("Closed")}</option>
              </CustomDropdown>
            </Field>
            <Field label={t("Category")}>
              <CustomDropdown value={formCategoryFilter} onChange={(event) => setFormCategoryFilter(event.target.value)}>
                <option value="">{t("All categories")}</option>
                {[...new Set((forms.data ?? []).map((form) => form.category))].filter(Boolean).sort().map((category) => (
                  <option key={category} value={category}>{category}</option>
                ))}
              </CustomDropdown>
            </Field>
            <Field label={t("Program")}>
              <CustomDropdown value={formProgramFilter} onChange={(event) => setFormProgramFilter(event.target.value)}>
                <option value="">{t("All programs")}</option>
                {(programs.data ?? []).map((program) => <option key={program.id} value={program.id}>{program.name}</option>)}
              </CustomDropdown>
            </Field>
          </div>
        </FilterBar>
        <div className="space-y-2.5">
          {filteredForms.map((form) => (
            <Card key={form.id} className="space-y-2 p-3.5">
              <div className="flex items-start gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-primary-soft text-primary"><FileText className="h-5 w-5" /></span><div className="min-w-0 flex-1"><p className="font-semibold">{form.title}</p><p className="text-xs text-muted-foreground">{form.program_name ?? form.category} · {form.is_open ? "Open" : "Closed"}</p></div></div>
              {form.description ? <p className="text-sm text-muted-foreground">{form.description}</p> : null}
              <p className="text-xs text-muted-foreground">{form.fields_definition.filter((field) => field.enabled !== false && field.type !== "label" && !field.built_in).length} fields</p>
              {canManage ? <div className="flex flex-wrap gap-2"><button type="button" className="inline-flex items-center gap-1 rounded-xl bg-primary-soft px-3 py-2 text-xs font-bold text-primary" onClick={() => void shareApplicationForm(form)}><Share2 className="h-3.5 w-3.5" />{t("Share")}</button><button type="button" className="inline-flex items-center gap-1 rounded-xl bg-muted px-3 py-2 text-xs font-bold" onClick={() => { setEditingForm(form); setFormEditorOpen(true); }}><Edit2 className="h-3.5 w-3.5" />{t("Edit")}</button><button type="button" className="inline-flex items-center gap-1 rounded-xl bg-destructive/10 px-3 py-2 text-xs font-bold text-destructive" onClick={() => setDeleteForm(form)}><Trash2 className="h-3.5 w-3.5" />{t("Delete")}</button></div> : null}
            </Card>
          ))}
          {!forms.isLoading && filteredForms.length === 0 ? <EmptyState title="No application forms" /> : null}
        </div>
        </>
      ) : <>
      <FilterBar
        chips={FILTERS.map((key) => ({
          key,
          label: key,
          active: filter === key,
          onClick: () => setFilter(key),
        }))}
        search={{
          value: extra.search,
          onChange: (v) => setExtra({ search: v }),
          placeholder: "Search applicant, guardian…",
        }}
        activeCount={activeCount}
        onClear={() => {
          setFilter("all");
          setExtra(emptyExtra);
          setApplicationFormFilter("");
          setApplicationProgramFilter("");
          setConversionFilter("all");
          setApplicationFrom("");
          setApplicationTo("");
        }}
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label={t("Application form")}>
            <CustomDropdown value={applicationFormFilter} onChange={(event) => setApplicationFormFilter(event.target.value)}>
              <option value="">{t("All forms")}</option>
              {(forms.data ?? []).map((form) => <option key={form.id} value={form.id}>{form.title}</option>)}
            </CustomDropdown>
          </Field>
          <Field label={t("Program")}>
            <CustomDropdown value={applicationProgramFilter} onChange={(event) => setApplicationProgramFilter(event.target.value)}>
              <option value="">{t("All programs")}</option>
              {(programs.data ?? []).map((program) => <option key={program.id} value={program.id}>{program.name}</option>)}
            </CustomDropdown>
          </Field>
          <Field label={t("Conversion")}>
            <CustomDropdown value={conversionFilter} onChange={(event) => setConversionFilter(event.target.value)}>
              <option value="all">{t("All applications")}</option>
              <option value="converted">{t("Converted")}</option>
              <option value="not_converted">{t("Not converted")}</option>
            </CustomDropdown>
          </Field>
          <Field label={t("From") }><TextInput type="date" value={applicationFrom} onChange={(event) => setApplicationFrom(event.target.value)} /></Field>
          <Field label={t("To") }><TextInput type="date" value={applicationTo} onChange={(event) => setApplicationTo(event.target.value)} /></Field>
        </div>
      </FilterBar>

      {query.isLoading ? <SkeletonList rows={5} /> : null}
      {query.isError ? (
        <EmptyState title={t("Admissions unavailable")} hint="You may not have access to this module." />
      ) : null}
      {!query.isLoading && !query.isError && items.length === 0 ? (
        <EmptyState title={t("No applications")} />
      ) : null}

      <div className="space-y-2.5">
        {items.map((item) => (
          <Card key={item.id} className="space-y-2 p-3.5">
            <button type="button" className="block w-full text-left" onClick={() => navigate({ to: "/admissions/$applicationId", params: { applicationId: item.id } })}>
              <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3">
                <ApplicationAvatar application={item} />
                <div className="min-w-0">
                  <p className="truncate font-semibold">{item.applicant_name}</p>
                  <p className="flex items-center gap-1 truncate text-xs text-muted-foreground">
                    <Phone className="h-3.5 w-3.5" />
                    {item.guardian_contact}
                  </p>
                </div>
                <Pill
                  tone={
                    item.status === "accepted"
                      ? "success"
                      : item.status === "rejected"
                        ? "destructive"
                        : "warning"
                  }
                >
                  {item.status}
                </Pill>
              </div>
              {item.notes ? <p className="mt-2 text-sm text-muted-foreground">{item.notes}</p> : null}
            </button>
          </Card>
        ))}
      </div>

      </>}
      <AdmissionFormEditorSheet form={editingForm} open={formEditorOpen} onOpenChange={setFormEditorOpen} onSaved={() => { setFormEditorOpen(false); void queryClient.invalidateQueries({ queryKey: ["admission-forms"] }); }} />
      {deleteForm ? <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"><Card className="w-full max-w-sm space-y-3 p-5"><p className="font-display font-extrabold">Delete application form?</p><p className="text-sm text-muted-foreground">{deleteForm.title} will no longer be available for new students.</p><div className="flex gap-2"><ActionButton className="flex-1" variant="soft" onClick={() => setDeleteForm(null)}>{t("Cancel")}</ActionButton><ActionButton className="flex-1" variant="danger" onClick={async () => { await opsApi.deleteAdmissionForm(deleteForm.id); setDeleteForm(null); void queryClient.invalidateQueries({ queryKey: ["admission-forms"] }); }}>{t("Delete")}</ActionButton></div></Card></div> : null}
    </AppShell>
  );
}
