import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { FileText, Trash2, Video } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/app/AppShell";
import { FilterBar } from "@/components/app/FilterBar";
import { FormSheet } from "@/components/app/FormSheet";
import {
  Card,
  EmptyState,
  Field,
  SelectInput,
  SkeletonList,
  TextArea,
  TextInput,
} from "@/components/app/Primitives";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/mms/auth";
import { academicsApi } from "@/lib/mms/endpoints";
import { academicsExtraApi, opsApi, opsMutations } from "@/lib/mms/more-endpoints";

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

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  const [formCategory, setFormCategory] = useState("");
  const [newCategory, setNewCategory] = useState("");

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
    mutationFn: () =>
      opsMutations.createResource({
        category_id: formCategory,
        title: title.trim(),
        ...(description.trim() ? { description: description.trim() } : {}),
        ...(videoUrl.trim() ? { video_url: videoUrl.trim() } : {}),
      }),
    onSuccess: () => {
      toast.success("Resource shared");
      setTitle("");
      setDescription("");
      setVideoUrl("");
      void client.invalidateQueries({ queryKey: ["resources"] });
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) => opsMutations.deleteResource(id),
    onSuccess: () => {
      toast.success("Removed");
      void client.invalidateQueries({ queryKey: ["resources"] });
    },
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
            <Field label="Category">
              <SelectInput
                required
                value={formCategory}
                onChange={(e) => setFormCategory(e.target.value)}
              >
                <option value="">Select category</option>
                {(categories.data ?? []).map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </SelectInput>
            </Field>
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
            <Field label="Title">
              <TextInput required value={title} onChange={(e) => setTitle(e.target.value)} />
            </Field>
            <Field label="Description">
              <TextArea value={description} onChange={(e) => setDescription(e.target.value)} />
            </Field>
            <Field label="Video link">
              <TextInput
                value={videoUrl}
                onChange={(e) => setVideoUrl(e.target.value)}
                placeholder="https://"
              />
            </Field>
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
            <SelectInput
              value={extra.classId}
              onChange={(e) => setExtra((f) => ({ ...f, classId: e.target.value, sectionId: "" }))}
            >
              <option value="">All classes</option>
              {(classes.data ?? []).map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </SelectInput>
          </Field>
          <Field label="Section">
            <SelectInput
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
            </SelectInput>
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
            </div>
            {canManage ? (
              <button
                aria-label="Delete resource"
                onClick={() => remove.mutate(item.id)}
                className="grid h-9 w-9 place-items-center rounded-xl bg-destructive/10 text-destructive"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            ) : (
              <span />
            )}
          </Card>
        ))}
      </div>
    </AppShell>
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
