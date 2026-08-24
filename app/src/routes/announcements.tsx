import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { ChevronDown, Edit2, Megaphone, Trash2, MoreVertical, Eye } from "lucide-react";
import { useMemo, useState } from "react";

import { AppShell } from "@/components/app/AppShell";
import { FilterBar } from "@/components/app/FilterBar";
import {
  AnnouncementFormFields,
  type AnnouncementFormValues,
} from "@/components/app/content/AnnouncementFormFields";
import { FormSheet } from "@/components/app/FormSheet";
import { Card, EmptyState, Field, Pill, CustomDropdown, SkeletonList, TextInput } from "@/components/app/Primitives";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ActionMenu } from "@/components/ui/action-menu";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { RichText } from "@/components/app/RichText";
import { useAuth } from "@/lib/mms/auth";
import { applyMutationSuccess } from "@/lib/mms/mutation-helpers";
import { opsApi, opsMutations, type Announcement } from "@/lib/mms/more-endpoints";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";

export const Route = createFileRoute("/announcements")({
  head: () => ({
    meta: [
      { title: "Announcements — Suffa MS" },
      { name: "description", content: "Notices and updates published for your madrasa audience." },
      { property: "og:title", content: "Announcements — Suffa MS" },
      {
        property: "og:description",
        content: "Notices and updates for students, staff and guardians.",
      },
    ],
  }),
  component: AnnouncementsPage,
});

function AnnouncementsPage() {
    const { t } = useTranslation();
  const { user, hasPermission } = useAuth();
  const client = useQueryClient();
  const canManage =
    user?.role === "principal" ||
    user?.is_principal_delegate ||
    user?.role === "super_admin" ||
    hasPermission("announcements.manage");
  const isGuardian = user?.role === "parent";

  const [audienceFilter, setAudienceFilter] = useState<"all" | "teachers" | "students">("all");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const activeCount =
    (audienceFilter !== "all" ? 1 : 0) +
    (categoryFilter.trim() ? 1 : 0) +
    (search.trim() ? 1 : 0) +
    (dateFrom ? 1 : 0) +
    (dateTo ? 1 : 0);

  const clearFilters = () => {
    setAudienceFilter("all");
    setCategoryFilter("");
    setSearch("");
    setDateFrom("");
    setDateTo("");
  };

  const filterParams = {
    ...(isGuardian ? {} : (audienceFilter !== "all" ? { audience: audienceFilter } : {})),
    ...(categoryFilter.trim() ? { category: categoryFilter.trim() } : {}),
    ...(search.trim() ? { q: search.trim() } : {}),
    ...(dateFrom ? { date_from: dateFrom } : {}),
    ...(dateTo ? { date_to: dateTo } : {}),
  };

  const query = useQuery({
    queryKey: ["announcements", filterParams],
    queryFn: () => opsApi.listAnnouncements(filterParams),
  });
  const items = query.data ?? [];
  const [editing, setEditing] = useState<(typeof items)[number] | null>(null);

  const [form, setForm] = useState<AnnouncementFormValues>({
    title: "",
    body: "",
    category: "",
    audience: "all",
    link: "",
  });

  const audienceLabel = (scope: { all?: boolean; roles?: string[] }) => {
    if (scope?.all || !scope?.roles?.length) return t("All");
    return scope.roles.map((role) => t(role === "teachers" ? "Teachers" : role === "students" ? "Students" : role)).join(", ");
  };

  const create = useMutation({
    mutationFn: () =>
      opsMutations.createAnnouncement({
        title: form.title.trim(),
        body: form.body.trim(),
        ...(form.category.trim() ? { category: form.category.trim() } : {}),
        ...(form.link.trim() ? { attachment_link: form.link.trim() } : {}),
        audience_scope:
          form.audience === "all" ? { all: true } : { all: false, roles: [form.audience] },
      }),
    onSuccess: () =>
      applyMutationSuccess({
        client,
        message: "Announcement published",
        queryKeys: [["announcements"]],
        afterSuccess: () =>
          setForm({ title: "", body: "", category: "", audience: "all", link: "" }),
      }),
  });

  const remove = useMutation({
    mutationFn: (id: string) => opsMutations.deleteAnnouncement(id),
    onSuccess: () =>
      applyMutationSuccess({
        client,
        message: "Deleted",
        queryKeys: [["announcements"]],
      }),
  });

  return (
    <AppShell
      title={t("Announcements")}
      subtitle={`${items.length} notices`}
      right={
        canManage ? (
          <FormSheet
            title={t("New announcement")}
            triggerLabel="New"
            submitLabel="Publish"
            onSubmit={() => create.mutateAsync()}
          >
            <AnnouncementFormFields
              values={form}
              onChange={(patch) => setForm((current) => ({ ...current, ...patch }))}
            />
          </FormSheet>
        ) : undefined
      }
    >
      {isGuardian ? (
        <>
          <Field label={t("Search announcements")} className="mb-4">
            <TextInput
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("Search announcements…")}
            />
          </Field>
          <GuardianAnnouncementsView
            items={items}
            isLoading={query.isLoading}
            search={search}
            expanded={expanded}
            onToggleExpand={setExpanded}
            canManage={canManage}
            onEdit={setEditing}
            onDelete={(id) => remove.mutate(id)}
          />
        </>
      ) : (
        <>
          <FilterBar
            search={{ value: search, onChange: setSearch, placeholder: t("Search announcements…") }}
            activeCount={activeCount}
            onClear={clearFilters}
          >
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              <Field label={t("Audience")}>
                <CustomDropdown
                  value={audienceFilter}
                  onChange={(e) => setAudienceFilter(e.target.value as typeof audienceFilter)}
                >
                  <option value="all">{t("All")}</option>
                  <option value="teachers">{t("Teachers")}</option>
                  <option value="students">{t("Students")}</option>
                </CustomDropdown>
              </Field>
              <Field label={t("Category")}>
                <TextInput
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value)}
                  placeholder={t("Any")}
                />
              </Field>
              <Field label={t("From")}>
                <TextInput type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
              </Field>
              <Field label={t("To")}>
                <TextInput type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
              </Field>
            </div>
          </FilterBar>

          {query.isLoading ? <SkeletonList rows={4} /> : null}
          {!query.isLoading && items.length === 0 ? (
            <EmptyState title={t("Nothing announced yet")} hint="New notices will appear here." />
          ) : null}

          <div className="space-y-2.5 md:hidden">
            {items.map((item) => (
              <AnnouncementCard key={item.id} item={item} canManage={canManage} onEdit={() => setEditing(item)} onDelete={() => remove.mutate(item.id)} />
            ))}
          </div>

          <div className="hidden md:block rounded-2xl border border-border bg-card overflow-hidden">
            <Table>
              <TableHeader className="bg-muted/30">
                <TableRow>
                  <TableHead className="w-[60px] text-center"></TableHead>
                  <TableHead>{t("Announcement")}</TableHead>
                  <TableHead>{t("Audience")}</TableHead>
                  <TableHead className="text-right">{t("Actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item) => (
                  <AnnouncementTableRow key={item.id} item={item} canManage={canManage} onEdit={() => setEditing(item)} onDelete={() => remove.mutate(item.id)} />
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}

      {editing ? (
        <EditAnnouncementSheet announcement={editing} onClose={() => setEditing(null)} />
      ) : null}
    </AppShell>
  );
}

function GuardianAnnouncementsView({
  items,
  isLoading,
  search,
  expanded,
  onToggleExpand,
  canManage,
  onEdit,
  onDelete,
}: {
  items: Announcement[];
  isLoading: boolean;
  search: string;
  expanded: string | null;
  onToggleExpand: (id: string | null) => void;
  canManage: boolean;
  onEdit: (item: Announcement) => void;
  onDelete: (id: string) => void;
}) {
  const { t } = useTranslation();

  const filtered = useMemo(() => {
    if (!search.trim()) return items;
    const q = search.trim().toLowerCase();
    return items.filter(
      (item) =>
        item.title.toLowerCase().includes(q) ||
        item.body?.toLowerCase().includes(q) ||
        item.category?.toLowerCase().includes(q),
    );
  }, [items, search]);

  const guardianItems = useMemo(
    () => filtered.filter((item) => {
      const scope = item.audience_scope;
      if (scope?.all) return true;
      const roles = scope?.roles ?? [];
      return roles.includes("parent");
    }),
    [filtered],
  );

  const studentItems = useMemo(
    () => filtered.filter((item) => {
      const scope = item.audience_scope;
      if (scope?.all) return true;
      const roles = scope?.roles ?? [];
      return roles.includes("student");
    }),
    [filtered],
  );

  if (isLoading) return <SkeletonList rows={4} />;
  if (items.length === 0) {
    return <EmptyState title={t("Nothing announced yet")} hint="New notices will appear here." />;
  }

  const groups = [
    { id: "guardian", label: t("For Guardians"), items: guardianItems },
    { id: "student", label: t("For Students"), items: studentItems },
  ].filter((g) => g.items.length > 0);

  return (
    <div className="space-y-2.5">
      {groups.map((group) => {
        const isOpen = expanded === group.id;
        return (
          <Card key={group.id} className="overflow-hidden p-0">
            <button
              onClick={() => onToggleExpand(isOpen ? null : group.id)}
              className="flex w-full items-center justify-between gap-3 p-3.5 text-left"
            >
              <span className="font-display text-sm font-extrabold">{group.label}</span>
              <div className="flex shrink-0 items-center gap-2">
                <Pill tone="muted">{group.items.length}</Pill>
                <ChevronDown
                  className={cn(
                    "h-4 w-4 text-muted-foreground transition-transform",
                    isOpen && "rotate-180",
                  )}
                />
              </div>
            </button>
            {isOpen ? <div className="overflow-hidden border-t border-border">
                  <div className="space-y-2.5 md:hidden p-3.5 bg-muted/10">
                    {group.items.map((item) => (
                      <AnnouncementCard key={item.id} item={item} canManage={canManage} onEdit={() => onEdit(item)} onDelete={() => onDelete(item.id)} />
                    ))}
                  </div>
                  <div className="hidden md:block">
                    <Table>
                      <TableHeader className="bg-muted/30">
                        <TableRow>
                          <TableHead className="w-[60px] text-center"></TableHead>
                          <TableHead>{t("Announcement")}</TableHead>
                          <TableHead>{t("Audience")}</TableHead>
                          <TableHead className="text-right">{t("Actions")}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {group.items.map((item) => (
                          <AnnouncementTableRow key={item.id} item={item} canManage={canManage} onEdit={() => onEdit(item)} onDelete={() => onDelete(item.id)} />
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div> : null}
          </Card>
        );
      })}
    </div>
  );
}

function AnnouncementCard({
  item,
  canManage,
  onEdit,
  onDelete,
}: {
  item: Announcement;
  canManage: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { t } = useTranslation();
  const audienceLabel = (scope: { all?: boolean; roles?: string[] }) => {
    if (scope?.all || !scope?.roles?.length) return t("All");
    return scope.roles.map((role) => t(role === "teachers" || role === "teacher" ? "Teachers" : role === "students" || role === "student" ? "Students" : "Guardians")).join(", ");
  };
  return (
    <Card className="space-y-2 p-4">
      <div className="flex items-start gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent-foreground">
          <Megaphone className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-display text-base font-extrabold leading-snug">{item.title}</p>
          <p className="text-xs text-muted-foreground">
            {new Date(item.publish_at ?? item.created_at).toLocaleString()}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap justify-end gap-1.5 max-w-[40%]">
          {item.category ? <Pill tone="gold">{item.category}</Pill> : null}
          <Pill>{audienceLabel(item.audience_scope)}</Pill>
        </div>
      </div>
      <div className="prose prose-sm dark:prose-invert">
        <RichText html={item.body} />
      </div>
      <div className="flex items-center gap-3">
        {item.attachment_link ? (
          <a
            href={item.attachment_link}
            target="_blank"
            rel="noreferrer"
            className="text-sm font-bold text-primary underline underline-offset-4"
          >
            {t("Open attachment")}</a>
        ) : null}
        {canManage ? (
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={onEdit}
              className="inline-flex items-center gap-1.5 rounded-xl bg-primary-soft px-3 py-1.5 text-xs font-bold text-primary"
            >
              <Edit2 className="h-3.5 w-3.5" />
              {t("Edit")}</button>
            <button
              onClick={onDelete}
              className="inline-flex items-center gap-1.5 rounded-xl bg-destructive/10 px-3 py-1.5 text-xs font-bold text-destructive"
            >
              <Trash2 className="h-3.5 w-3.5" />
              {t("Delete")}</button>
          </div>
        ) : null}
      </div>
    </Card>
  );
}

function AnnouncementTableRow({
  item,
  canManage,
  onEdit,
  onDelete,
}: {
  item: Announcement;
  canManage: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { t } = useTranslation();
  const audienceLabel = (scope: { all?: boolean; roles?: string[] }) => {
    if (scope?.all || !scope?.roles?.length) return t("All");
    return scope.roles.map((role) => t(role === "teachers" || role === "teacher" ? "Teachers" : role === "students" || role === "student" ? "Students" : "Guardians")).join(", ");
  };
  return (
    <TableRow className="transition-colors hover:bg-muted/50">
      <TableCell className="w-[60px] align-top">
        <div className="grid h-10 w-10 place-items-center rounded-xl bg-accent-soft text-accent-foreground mx-auto">
          <Megaphone className="h-5 w-5" />
        </div>
      </TableCell>
      <TableCell className="align-top">
        <p className="font-display text-base font-extrabold leading-snug">{item.title}</p>
        <p className="text-xs text-muted-foreground mb-2">
          {new Date(item.publish_at ?? item.created_at).toLocaleString()}
        </p>
        <div className="prose prose-sm dark:prose-invert line-clamp-3">
          <RichText html={item.body} />
        </div>
      </TableCell>
      <TableCell className="align-top">
        <div className="flex flex-col gap-1.5">
          {item.category ? <Pill tone="gold">{item.category}</Pill> : null}
          <Pill>{audienceLabel(item.audience_scope)}</Pill>
        </div>
      </TableCell>
      <TableCell className="align-top text-right">
        <div className="flex justify-end mt-1">
          <ActionMenu>
            {item.attachment_link ? (
              <DropdownMenuItem asChild>
                <a
                  href={item.attachment_link}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center w-full cursor-pointer"
                >
                  <Eye className="mr-2 h-4 w-4 text-muted-foreground" />
                  {t("Open attachment")}
                </a>
              </DropdownMenuItem>
            ) : null}
            {canManage ? (
              <>
                <DropdownMenuItem onClick={onEdit}>
                  <Edit2 className="mr-2 h-4 w-4 text-muted-foreground" />
                  {t("Edit")}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={onDelete} className="text-destructive focus:text-destructive">
                  <Trash2 className="mr-2 h-4 w-4" />
                  {t("Delete")}
                </DropdownMenuItem>
              </>
            ) : null}
          </ActionMenu>
        </div>
      </TableCell>
    </TableRow>
  );
}

function EditAnnouncementSheet({
  announcement,
  onClose,
}: {
  announcement: {
    id: string;
    title: string;
    body: string;
    category: string | null;
    attachment_link: string | null;
    audience_scope: { all?: boolean; roles?: string[] };
  };
  onClose: () => void;
}) {
    const { t } = useTranslation();
  const client = useQueryClient();
  const [form, setForm] = useState<AnnouncementFormValues>({
    title: announcement.title,
    body: announcement.body,
    category: announcement.category ?? "",
    link: announcement.attachment_link ?? "",
    audience: announcement.audience_scope?.all
      ? "all"
      : announcement.audience_scope?.roles?.[0] ?? "all",
  });

  const update = useMutation({
    mutationFn: () =>
      opsMutations.updateAnnouncement(announcement.id, {
        title: form.title.trim(),
        body: form.body.trim(),
        category: form.category.trim() || undefined,
        attachment_link: form.link.trim() || undefined,
        audience_scope:
          form.audience === "all" ? { all: true } : { all: false, roles: [form.audience] },
      }),
    onSuccess: () =>
      applyMutationSuccess({
        client,
        message: "Announcement updated",
        queryKeys: [["announcements"]],
        afterSuccess: onClose,
      }),
  });

  return (
    <FormSheet
      title={t("Edit announcement")}
      submitLabel="Save changes"
      open
      onOpenChange={(next) => !next && onClose()}
      onSubmit={() => update.mutateAsync()}
    >
      <AnnouncementFormFields
        values={form}
        onChange={(patch) => setForm((current) => ({ ...current, ...patch }))}
      />
    </FormSheet>
  );
}
