import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Download, Edit2, FileText, Trash2, Upload, Video } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/app/AppShell";
import { ResourceFormFields, type ResourceFormValues } from "@/components/app/content/ResourceFormFields";
import { FilterBar } from "@/components/app/FilterBar";
import { FormSheet } from "@/components/app/FormSheet";
import {
  Card,
  EmptyState,
  CustomDropdown,
  SkeletonList,
  TextInput,
} from "@/components/app/Primitives";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/mms/auth";
import { academicsApi } from "@/lib/mms/endpoints";
import { applyMutationSuccess } from "@/lib/mms/mutation-helpers";
import {
  academicsExtraApi,
  filesApi,
  opsApi,
  opsMutations,
  uploadFile,
  type ResourceItem,
} from "@/lib/mms/more-endpoints";

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
  const { user } = useAuth();
  const client = useQueryClient();
  const canManage =
    user?.role === "principal" || user?.role === "super_admin" || user?.role === "teacher";

  const [categoryId, setCategoryId] = useState<string>("");
  const [extra, setExtra] = useState(emptyExtra);

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
      setFormCategory(category.id);
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

  return (
    <AppShell
      title="Resources"
      subtitle={`${items.length} items`}
      right={
        canManage ? (
          <FormSheet
            title="Share a resource"
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
                  <Field label="New category">
                    <TextInput
                      value={newCategory}
                      onChange={(e) => setNewCategory(e.target.value)}
                      placeholder="e.g. Tajweed notes"
                    />
                  </Field>
                  <button
                    type="button"
                    disabled={!newCategory.trim()}
                    onClick={() => createCategory.mutate()}
                    className="rounded-2xl bg-muted px-3.5 py-2.5 text-sm font-bold disabled:opacity-50"
                  >
                    Add
                  </button>
                </div>
              }
            />
          </FormSheet>
        ) : undefined
      }
    >
      <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
        <Chip active={categoryId === ""} onClick={() => setCategoryId("")} label="All" />
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
      >
        <div className="grid grid-cols-2 gap-3">
          <Field label="Class">
            <CustomDropdown
              value={extra.classId}
              onChange={(e) => setExtra((f) => ({ ...f, classId: e.target.value, sectionId: "" }))}
            >
              <option value="">All classes</option>
              {(classes.data ?? []).map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </CustomDropdown>
          </Field>
          <Field label="Section">
            <CustomDropdown
              value={extra.sectionId}
              disabled={!extra.classId}
              onChange={(e) => setExtra((f) => ({ ...f, sectionId: e.target.value }))}
            >
              <option value="">All sections</option>
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
          Mine only
        </label>
      </FilterBar>

      {resources.isLoading ? <SkeletonList rows={5} /> : null}
      {!resources.isLoading && items.length === 0 ? (
        <EmptyState title="No resources yet" hint="Teachers can share notes and videos here." />
      ) : null}

      <div className="space-y-2.5">
        {items.map((item) => (
          <Card
            key={item.id}
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
                  className="mt-1 inline-block text-sm font-bold text-primary underline underline-offset-4"
                >
                  Watch
                </a>
              ) : null}
              {item.file_key ? (
                <button
                  type="button"
                  onClick={async () => {
                    const url = await filesApi.presignDownload(item.file_key!);
                    window.open(url, "_blank", "noopener,noreferrer");
                  }}
                  className="mt-1 inline-flex items-center gap-1 text-sm font-bold text-primary underline underline-offset-4"
                >
                  <Download className="h-3.5 w-3.5" />
                  Open file
                </button>
              ) : null}
            </div>
            {canManage ? (
              <div className="flex gap-2">
                <button
                  aria-label="Edit resource"
                  onClick={() => setEditing(item)}
                  className="grid h-9 w-9 place-items-center rounded-xl bg-primary-soft text-primary"
                >
                  <Edit2 className="h-4 w-4" />
                </button>
                <button
                  aria-label="Delete resource"
                  onClick={() => remove.mutate(item.id)}
                  className="grid h-9 w-9 place-items-center rounded-xl bg-destructive/10 text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <span />
            )}
          </Card>
        ))}
      </div>

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

function EditResourceSheet({
  resource,
  categories,
  onClose,
}: {
  resource: ResourceItem;
  categories: { id: string; name: string }[];
  onClose: () => void;
}) {
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
      title="Edit resource"
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
