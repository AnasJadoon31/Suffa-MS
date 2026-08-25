import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { ChevronDown, Download, Edit2, FileText, Trash2, Upload, Video, MoreVertical } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/app/AppShell";
import { ResourceFormFields, type ResourceFormValues } from "@/components/app/content/ResourceFormFields";
import { FilterBar } from "@/components/app/FilterBar";
import { FormSheet } from "@/components/app/FormSheet";
import {
  Card,
  EmptyState,
  Field,
  CustomDropdown,
  SkeletonList,
  TextInput,
} from "@/components/app/Primitives";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ActionMenu } from "@/components/ui/action-menu";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/mms/auth";
import { academicsApi, reportingApi, type ParentDashboard } from "@/lib/mms/endpoints";
import { applyMutationSuccess } from "@/lib/mms/mutation-helpers";
import {
  academicsExtraApi,
  filesApi,
  opsApi,
  opsMutations,
  uploadFile,
  type ResourceItem,
} from "@/lib/mms/more-endpoints";
import { useTranslation } from "react-i18next";

export const Route = createFileRoute("/resources")({
  head: () => ({
    meta: [
      { title: "Resources — Suffa MS" },
      {
        name: "description",
        content: "Shared study material, notes and video links for your classes.",
      },
      { property: "og:title", content: "Resources — Suffa MS" },
      { property: "og:description", content: "Shared study material, notes and video links." },
    ],
  }),
  component: ResourcesPage,
});

const emptyExtra = { classId: "", sectionId: "", mineOnly: false };

function ResourcesPage() {
    const { t } = useTranslation();
  const { user } = useAuth();
  const client = useQueryClient();
  const canManage =
    user?.role === "principal" || user?.role === "super_admin" || user?.is_principal_delegate || user?.role === "teacher";
  const isGuardian = user?.role === "parent";

  const [categoryId, setCategoryId] = useState<string>("");
  const [extra, setExtra] = useState(emptyExtra);
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);

  const categories = useQuery({
    queryKey: ["resource-categories"],
    queryFn: () => opsApi.listResourceCategories(),
  });
  const classes = useQuery({ queryKey: ["classes"], queryFn: () => academicsApi.listClasses() });
  const sections = useQuery({
    queryKey: ["sections", extra.classId],
    queryFn: () => academicsExtraApi.listSections(extra.classId),
    enabled: !!extra.classId,
  });

  const params = useMemo(
    () => ({
      category_id: categoryId || undefined,
      class_id: extra.classId || undefined,
      section_id: extra.sectionId || undefined,
      mine_only: extra.mineOnly || undefined,
    }),
    [categoryId, extra],
  );

  const resources = useQuery({
    queryKey: ["resources", params],
    queryFn: () => opsApi.listResources(params),
  });

  const dashboard = useQuery({
    queryKey: ["dashboard"],
    queryFn: () => reportingApi.dashboard(),
    enabled: isGuardian,
  });

  const items = resources.data ?? [];
  const activeCount = [extra.classId, extra.sectionId, extra.mineOnly ? "1" : ""].filter(
    Boolean,
  ).length;

  const [form, setForm] = useState<ResourceFormValues>({
    categoryId: "",
    title: "",
    description: "",
    videoUrl: "",
    file: null,
  });
  const [newCategory, setNewCategory] = useState("");
  const [editing, setEditing] = useState<ResourceItem | null>(null);

  const createCategory = useMutation({
    mutationFn: () => opsMutations.createResourceCategory(newCategory.trim()),
    onSuccess: (category) => {
      toast.success("Category created");
      setNewCategory("");
      setForm({ ...form, categoryId: category.id });
      void client.invalidateQueries({ queryKey: ["resource-categories"] });
    },
  });

  const createResource = useMutation({
    mutationFn: async () =>
      opsMutations.createResource({
        category_id: form.categoryId,
        title: form.title.trim(),
        ...(form.description.trim() ? { description: form.description.trim() } : {}),
        ...(form.videoUrl.trim() ? { video_url: form.videoUrl.trim() } : {}),
        ...(form.file ? { file_key: await uploadFile(form.file, "resources") } : {}),
      }),
    onSuccess: () =>
      applyMutationSuccess({
        client,
        message: "Resource shared",
        queryKeys: [["resources"]],
        afterSuccess: () =>
          setForm({ categoryId: "", title: "", description: "", videoUrl: "", file: null }),
      }),
  });

  const remove = useMutation({
    mutationFn: (id: string) => opsMutations.deleteResource(id),
    onSuccess: () =>
      applyMutationSuccess({
        client,
        message: "Removed",
        queryKeys: [["resources"]],
      }),
  });

  const children = useMemo(() => {
    if (!isGuardian) return [];
    const data = dashboard.data as ParentDashboard | undefined;
    return data?.children ?? [];
  }, [isGuardian, dashboard.data]);

  const grouped = useMemo(() => {
    if (!isGuardian) return null;
    const filtered = search.trim()
      ? items.filter((item) =>
          item.title.toLowerCase().includes(search.trim().toLowerCase()) ||
          item.description?.toLowerCase().includes(search.trim().toLowerCase()),
        )
      : items;

    const childGroups: { id: string; name: string; items: ResourceItem[] }[] = [];
    const globalItems: ResourceItem[] = [];

    for (const child of children) {
      const classId = child.current_class?.id;
      const sectionId = child.current_class?.section_id;
      const childResources = filtered.filter((item) => {
        const scope = item.visibility_scope;
        if (!scope) return false;
        if (scope.all) return false;
        const scopeClasses = (scope.classes as string[]) ?? [];
        const scopeSections = (scope.sections as string[]) ?? [];
        if (classId && scopeClasses.includes(classId)) return true;
        if (sectionId && scopeSections.includes(sectionId)) return true;
        return false;
      });
      if (childResources.length > 0) {
        childGroups.push({ id: child.id, name: child.name, items: childResources });
      }
    }

    for (const item of filtered) {
      const scope = item.visibility_scope;
      if (!scope) {
        globalItems.push(item);
        continue;
      }
      if (scope.all) {
        globalItems.push(item);
        continue;
      }
      const scopeClasses = (scope.classes as string[]) ?? [];
      const scopeSections = (scope.sections as string[]) ?? [];
      const scopeCourses = (scope.courses as string[]) ?? [];
      if (scopeClasses.length === 0 && scopeSections.length === 0 && scopeCourses.length === 0) {
        globalItems.push(item);
      }
    }

    return { childGroups, globalItems };
  }, [isGuardian, items, children, search]);

  return (
    <AppShell
      title={t("Resources")}
      subtitle={`${items.length} items`}
    >
      {isGuardian ? (
        <>
          <Field label={t("Search resources")} className="mb-4">
            <TextInput
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("Type a title or description…")}
            />
          </Field>

          {resources.isLoading || dashboard.isLoading ? <SkeletonList rows={5} /> : null}
          {!resources.isLoading && !dashboard.isLoading && items.length === 0 ? (
            <EmptyState title={t("No resources yet")} hint="Teachers can share notes and videos here." />
          ) : null}

          {grouped ? (
            <div className="space-y-2.5">
              {grouped.childGroups.map((group) => {
                const isOpen = expanded === group.id;
                return (
                  <Card key={group.id} className="overflow-hidden p-0">
                    <button
                      onClick={() => setExpanded(isOpen ? null : group.id)}
                      className="flex w-full items-center justify-between gap-3 p-3.5 text-left"
                    >
                      <span className="font-display text-sm font-extrabold">{group.name}</span>
                      <ChevronDown
                        className={cn(
                          "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
                          isOpen && "rotate-180",
                        )}
                      />
                    </button>
                    {isOpen ? (
                      <div className="overflow-hidden border-t border-border">
                        <Table>
                          <TableHeader className="bg-muted/30">
                            <TableRow>
                              <TableHead className="w-[60px] text-center"></TableHead>
                              <TableHead>{t("Resource")}</TableHead>
                              <TableHead>{t("Description")}</TableHead>
                              <TableHead className="text-right">{t("Actions")}</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {group.items.map((item) => (
                              <ResourceCard key={item.id} item={item} canManage={canManage} onEdit={() => setEditing(item)} onDelete={() => remove.mutate(item.id)} />
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    ) : null}
                  </Card>
                );
              })}

              {grouped.globalItems.length > 0 ? (
                (() => {
                  const isOpen = expanded === "global";
                  return (
                    <Card className="overflow-hidden p-0">
                      <button
                        onClick={() => setExpanded(isOpen ? null : "global")}
                        className="flex w-full items-center justify-between gap-3 p-3.5 text-left"
                      >
                        <span className="font-display text-sm font-extrabold">{t("General")}</span>
                        <ChevronDown
                          className={cn(
                            "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
                            isOpen && "rotate-180",
                          )}
                        />
                      </button>
                      {isOpen ? (
                        <div className="border-t border-border">
                          <div className="space-y-2.5 md:hidden p-3.5">
                            {grouped.globalItems.map((item) => (
                              <ResourceCard key={item.id} item={item} canManage={canManage} onEdit={() => setEditing(item)} onDelete={() => remove.mutate(item.id)} />
                            ))}
                          </div>
                          <div className="hidden md:block">
                            <Table>
                              <TableHeader className="bg-muted/30">
                                <TableRow>
                                  <TableHead className="w-[60px] text-center"></TableHead>
                                  <TableHead>{t("Resource")}</TableHead>
                                  <TableHead>{t("Description")}</TableHead>
                                  <TableHead className="text-right">{t("Actions")}</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {grouped.globalItems.map((item) => (
                                  <ResourceTableRow key={item.id} item={item} canManage={canManage} onEdit={() => setEditing(item)} onDelete={() => remove.mutate(item.id)} />
                                ))}
                              </TableBody>
                            </Table>
                          </div>
                        </div>
                      ) : null}
                    </Card>
                  );
                })()
              ) : null}
            </div>
          ) : null}
        </>
      ) : (
        <>
          <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
            <Chip active={categoryId === ""} onClick={() => setCategoryId("")} label={t("All")} />
            {(categories.data ?? []).map((category) => (
              <Chip
                key={category.id}
                active={categoryId === category.id}
                onClick={() => setCategoryId(category.id)}
                label={category.name}
              />
            ))}
          </div>

          <FilterBar
            activeCount={activeCount}
            onClear={() => {
              setExtra(emptyExtra);
            }}
            action={
              canManage ? (
                <FormSheet
                  title={t("Share a resource")}
                  triggerLabel="Share"
                  submitLabel="Share"
                  onSubmit={() => createResource.mutateAsync()}
                >
                  <ResourceFormFields
                    values={form}
                    categories={categories.data ?? []}
                    onChange={(patch) => setForm((current) => ({ ...current, ...patch }))}
                    categoryComposer={
                      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-2">
                        <Field label={t("New category")}>
                          <TextInput
                            value={newCategory}
                            onChange={(e) => setNewCategory(e.target.value)}
                            placeholder={t("e.g. Tajweed notes")}
                          />
                        </Field>
                        <button
                          type="button"
                          disabled={!newCategory.trim()}
                          onClick={() => createCategory.mutate()}
                          className="rounded-2xl bg-muted px-3.5 py-2.5 text-sm font-bold disabled:opacity-50"
                        >
                          {t("Add")}</button>
                      </div>
                    }
                  />
                </FormSheet>
              ) : undefined
            }
          >
            <div className="grid grid-cols-2 gap-3">
              <Field label={t("Class")}>
                <CustomDropdown
                  value={extra.classId}
                  onChange={(e) => setExtra((f) => ({ ...f, classId: e.target.value, sectionId: "" }))}
                >
                  <option value="">{t("All classes")}</option>
                  {(classes.data ?? []).map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </CustomDropdown>
              </Field>
              <Field label={t("Section")}>
                <CustomDropdown
                  value={extra.sectionId}
                  disabled={!extra.classId}
                  onChange={(e) => setExtra((f) => ({ ...f, sectionId: e.target.value }))}
                >
                  <option value="">{t("All sections")}</option>
                  {(sections.data ?? []).map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </CustomDropdown>
              </Field>
            </div>
            <label className="flex items-center gap-2 text-sm font-semibold">
              <input
                type="checkbox"
                checked={extra.mineOnly}
                onChange={(e) => setExtra((f) => ({ ...f, mineOnly: e.target.checked }))}
                className="h-4 w-4 rounded border-border"
              />
              {t("Mine only")}</label>
          </FilterBar>

          {resources.isLoading ? <SkeletonList rows={5} /> : null}
          {!resources.isLoading && items.length === 0 ? (
            <EmptyState title={t("No resources yet")} hint="Teachers can share notes and videos here." />
          ) : null}

          <div className="space-y-2.5 md:hidden">
            {items.map((item) => (
              <ResourceCard key={item.id} item={item} canManage={canManage} onEdit={() => setEditing(item)} onDelete={() => remove.mutate(item.id)} />
            ))}
          </div>

          <div className="hidden md:block rounded-2xl border border-border bg-card overflow-hidden">
            <Table>
              <TableHeader className="bg-muted/30">
                <TableRow>
                  <TableHead className="w-[60px] text-center"></TableHead>
                  <TableHead>{t("Resource")}</TableHead>
                  <TableHead>{t("Description")}</TableHead>
                  <TableHead className="text-right">{t("Actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item) => (
                  <ResourceTableRow key={item.id} item={item} canManage={canManage} onEdit={() => setEditing(item)} onDelete={() => remove.mutate(item.id)} />
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}

      {editing ? (
        <EditResourceSheet
          resource={editing}
          categories={categories.data ?? []}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </AppShell>
  );
}

function ResourceCard({ item, canManage, onEdit, onDelete }: { item: ResourceItem; canManage: boolean; onEdit: () => void; onDelete: () => void }) {
  const { t } = useTranslation();
  return (
    <Card
      className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-3 p-3.5"
    >
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary">
        {item.video_url ? <Video className="h-5 w-5" /> : <FileText className="h-5 w-5" />}
      </span>
      <div className="min-w-0">
        <p className="truncate font-semibold">{item.title}</p>
        {item.description ? (
          <p className="line-clamp-2 text-xs text-muted-foreground">{item.description}</p>
        ) : null}
        <p className="mt-1 truncate text-[0.7rem] text-muted-foreground">
          {item.owner_name ?? "Shared"} · {new Date(item.created_at).toLocaleDateString()}
        </p>
        {item.video_url ? (
          <a
            href={item.video_url}
            target="_blank"
            rel="noreferrer"
            className="mt-2 inline-flex items-center gap-1.5 text-xs font-bold text-primary hover:underline"
          >
            <Video className="h-3.5 w-3.5" />
            {t("Watch video")}
          </a>
        ) : null}
        {item.file_key ? (
          <button
            onClick={async () => {
              const url = await filesApi.presignDownload(item.file_key!);
              window.open(url, "_blank", "noopener,noreferrer");
            }}
            className="mt-2 inline-flex items-center gap-1.5 text-xs font-bold text-primary hover:underline"
          >
            <Download className="h-3.5 w-3.5" />
            {t("Download attachment")}
          </button>
        ) : null}
      </div>
      {canManage ? (
        <div className="flex gap-2">
          <button
            onClick={onEdit}
            className="grid h-9 w-9 place-items-center rounded-xl bg-primary-soft text-primary"
          >
            <Edit2 className="h-4 w-4" />
          </button>
          <button
            onClick={onDelete}
            className="grid h-9 w-9 place-items-center rounded-xl bg-destructive/10 text-destructive"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      ) : null}
    </Card>
  );
}

function ResourceTableRow({ item, canManage, onEdit, onDelete }: { item: ResourceItem; canManage: boolean; onEdit: () => void; onDelete: () => void }) {
  const { t } = useTranslation();
  return (
    <TableRow className="transition-colors hover:bg-muted/50">
      <TableCell className="w-[60px] align-top">
        <div className="grid h-10 w-10 place-items-center rounded-xl bg-primary-soft text-primary mx-auto">
          {item.video_url ? <Video className="h-5 w-5" /> : <FileText className="h-5 w-5" />}
        </div>
      </TableCell>
      <TableCell className="align-top">
        <p className="font-semibold">{item.title}</p>
        <p className="text-xs text-muted-foreground mt-1">
          {item.owner_name ?? t("Shared")} · {new Date(item.created_at).toLocaleDateString()}
        </p>
      </TableCell>
      <TableCell className="align-top">
        {item.description ? (
          <p className="line-clamp-2 text-sm text-muted-foreground">{item.description}</p>
        ) : <span className="text-muted-foreground">-</span>}
      </TableCell>
      <TableCell className="align-top text-right">
        <div className="flex justify-end mt-1">
          <ActionMenu>
            {item.video_url ? (
              <DropdownMenuItem asChild>
                <a
                  href={item.video_url}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center w-full cursor-pointer"
                >
                  <Video className="mr-2 h-4 w-4 text-muted-foreground" />
                  {t("Watch video")}
                </a>
              </DropdownMenuItem>
            ) : null}
            {item.file_key ? (
              <DropdownMenuItem
                onClick={async () => {
                  const url = await filesApi.presignDownload(item.file_key!);
                  window.open(url, "_blank", "noopener,noreferrer");
                }}
              >
                <Download className="mr-2 h-4 w-4 text-muted-foreground" />
                {t("Download attachment")}
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

function EditResourceSheet({
  resource,
  categories,
  onClose,
}: {
  resource: ResourceItem;
  categories: { id: string; name: string }[];
  onClose: () => void;
}) {
    const { t } = useTranslation();
  const client = useQueryClient();
  const [form, setForm] = useState<ResourceFormValues>({
    title: resource.title,
    description: resource.description ?? "",
    videoUrl: resource.video_url ?? "",
    categoryId: resource.category_id,
    file: null,
  });

  const update = useMutation({
    mutationFn: async () =>
      opsMutations.updateResource(resource.id, {
        title: form.title.trim(),
        category_id: form.categoryId,
        description: form.description.trim() || undefined,
        video_url: form.videoUrl.trim() || undefined,
        ...(form.file ? { file_key: await uploadFile(form.file, "resources") } : {}),
      }),
    onSuccess: () =>
      applyMutationSuccess({
        client,
        message: "Resource updated",
        queryKeys: [["resources"]],
        afterSuccess: onClose,
      }),
  });

  return (
    <FormSheet
      title={t("Edit resource")}
      submitLabel="Save changes"
      open
      onOpenChange={(next) => !next && onClose()}
      onSubmit={() => update.mutateAsync()}
    >
      <ResourceFormFields
        values={form}
        categories={categories}
        fileLabel="Replace file"
        onChange={(patch) => setForm((current) => ({ ...current, ...patch }))}
      />
    </FormSheet>
  );
}

function Chip({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
    const { t } = useTranslation();
  return (
    <button
      onClick={onClick}
      className={cn(
        "shrink-0 rounded-full px-3.5 py-2 text-xs font-bold transition-colors",
        active
          ? "gradient-emerald text-primary-foreground shadow-[var(--shadow-raised)]"
          : "bg-muted text-muted-foreground",
      )}
    >
      {label}
    </button>
  );
}
