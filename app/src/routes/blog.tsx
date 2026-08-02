import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { ArrowLeft, Edit2, Newspaper, Search, Send, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";

import { AppShell } from "@/components/app/AppShell";
import { BlogPostFormFields, type BlogPostFormValues } from "@/components/app/content/BlogPostFormFields";
import { FormSheet } from "@/components/app/FormSheet";
import { Card, EmptyState, Pill, Segmented, SkeletonList, TextInput } from "@/components/app/Primitives";
import { RichText } from "@/components/app/RichText";
import { useAuth } from "@/lib/mms/auth";
import { applyMutationSuccess } from "@/lib/mms/mutation-helpers";
import { opsApi, opsMutations, type BlogPost } from "@/lib/mms/more-endpoints";

export const Route = createFileRoute("/blog")({
  head: () => ({
    meta: [
      { title: "Blog — Suffa MS" },
      { name: "description", content: "Articles and stories published by the madrasa." },
      { property: "og:title", content: "Blog — Suffa MS" },
      { property: "og:description", content: "Articles and stories published by the madrasa." },
    ],
  }),
  component: BlogPage,
});

function BlogPage() {
  const { user } = useAuth();
  const client = useQueryClient();
  const canManage = user?.role === "principal" || user?.role === "super_admin";

  const [view, setView] = useState<"published" | "all">("published");
  const publishedOnly = view === "published" || !canManage;

  const query = useQuery({
    queryKey: ["blog", publishedOnly],
    queryFn: () => opsApi.listBlog(publishedOnly),
    retry: false,
  });
  const items = query.data ?? [];

  const [search, setSearch] = useState("");
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (post) => post.title.toLowerCase().includes(q) || post.body.toLowerCase().includes(q),
    );
  }, [items, search]);

  const [active, setActive] = useState<BlogPost | null>(null);
  const [editing, setEditing] = useState<BlogPost | null>(null);

  const [form, setForm] = useState<BlogPostFormValues>({ title: "", body: "" });

  const create = useMutation({
    mutationFn: (published: boolean) =>
      opsMutations.createBlogPost({ title: form.title.trim(), body: form.body.trim(), published }),
    onSuccess: () =>
      applyMutationSuccess({
        client,
        message: "Post saved",
        queryKeys: [["blog"]],
        afterSuccess: () => setForm({ title: "", body: "" }),
      }),
  });

  const publish = useMutation({
    mutationFn: (id: string) => opsMutations.publishBlogPost(id),
    onSuccess: () =>
      applyMutationSuccess({
        client,
        message: "Published",
        queryKeys: [["blog"]],
      }),
  });

  const remove = useMutation({
    mutationFn: (id: string) => opsMutations.deleteBlogPost(id),
    onSuccess: () =>
      applyMutationSuccess({
        client,
        message: "Deleted",
        queryKeys: [["blog"]],
        afterSuccess: () => setActive(null),
      }),
  });

  if (active) {
    return (
      <AppShell title="Post" subtitle={active.published ? "Live" : "Draft"}>
        <button
          onClick={() => setActive(null)}
          className="mb-3 inline-flex items-center gap-1.5 text-sm font-bold text-primary"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to blog
        </button>
        <Card className="space-y-3 p-4">
          <div className="flex items-start gap-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary">
              <Newspaper className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-display text-lg font-extrabold leading-snug">{active.title}</p>
              <p className="text-xs text-muted-foreground">
                {new Date(active.publish_at ?? active.created_at).toLocaleDateString()}
              </p>
            </div>
            <Pill tone={active.published ? "success" : "muted"}>
              {active.published ? "Live" : "Draft"}
            </Pill>
          </div>
          <RichText html={active.body} />
          {canManage ? (
            <div className="flex items-center gap-2 pt-2">
              <button
                onClick={() => setEditing(active)}
                className="inline-flex items-center gap-1.5 rounded-xl bg-primary-soft px-3 py-1.5 text-xs font-bold text-primary"
              >
                <Edit2 className="h-3.5 w-3.5" />
                Edit
              </button>
              {!active.published ? (
                <button
                  onClick={() => publish.mutate(active.id)}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-primary-soft px-3 py-1.5 text-xs font-bold text-primary"
                >
                  <Send className="h-3.5 w-3.5" />
                  Publish
                </button>
              ) : null}
              <button
                onClick={() => remove.mutate(active.id)}
                className="ml-auto inline-flex items-center gap-1.5 rounded-xl bg-destructive/10 px-3 py-1.5 text-xs font-bold text-destructive"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Delete
              </button>
            </div>
          ) : null}
        </Card>
      </AppShell>
    );
  }

  return (
    <AppShell
      title="Blog"
      subtitle={`${filtered.length} posts`}
      right={
        canManage ? (
          <FormSheet
            title="New post"
            triggerLabel="Write"
            submitLabel="Save draft"
            onSubmit={() => create.mutateAsync(false)}
          >
            <BlogPostFormFields
              values={form}
              onChange={(patch) => setForm((current) => ({ ...current, ...patch }))}
            />
          </FormSheet>
        ) : undefined
      }
    >
      <div className="relative mb-3">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <TextInput
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search posts…"
          className="pl-9"
        />
      </div>

      {canManage ? (
        <Segmented
          value={view}
          onChange={setView}
          options={[
            { key: "published", label: "Published" },
            { key: "all", label: "All posts" },
          ]}
        />
      ) : null}

      {query.isLoading ? <SkeletonList rows={4} /> : null}
      {!query.isLoading && filtered.length === 0 ? <EmptyState title="No posts yet" /> : null}

      <div className="space-y-2.5">
        {filtered.map((post) => (
          <Card key={post.id} className="space-y-2 p-4">
            <button onClick={() => setActive(post)} className="block w-full text-left">
              <div className="flex items-start gap-3">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary">
                  <Newspaper className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-display text-base font-extrabold leading-snug">{post.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(post.publish_at ?? post.created_at).toLocaleDateString()}
                  </p>
                </div>
                <Pill tone={post.published ? "success" : "muted"}>
                  {post.published ? "Live" : "Draft"}
                </Pill>
              </div>
              <RichText html={post.body} clampLines={4} className="mt-2" />
            </button>
            {canManage ? (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setEditing(post)}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-primary-soft px-3 py-1.5 text-xs font-bold text-primary"
                >
                  <Edit2 className="h-3.5 w-3.5" />
                  Edit
                </button>
                {!post.published ? (
                  <button
                    onClick={() => publish.mutate(post.id)}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-primary-soft px-3 py-1.5 text-xs font-bold text-primary"
                  >
                    <Send className="h-3.5 w-3.5" />
                    Publish
                  </button>
                ) : null}
                <button
                  onClick={() => remove.mutate(post.id)}
                  className="ml-auto inline-flex items-center gap-1.5 rounded-xl bg-destructive/10 px-3 py-1.5 text-xs font-bold text-destructive"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Delete
                </button>
              </div>
            ) : null}
          </Card>
        ))}
      </div>

      {editing ? <EditBlogSheet post={editing} onClose={() => setEditing(null)} /> : null}
    </AppShell>
  );
}

function EditBlogSheet({ post, onClose }: { post: BlogPost; onClose: () => void }) {
  const client = useQueryClient();
  const [form, setForm] = useState<BlogPostFormValues>({ title: post.title, body: post.body });

  const update = useMutation({
    mutationFn: () =>
      opsMutations.updateBlogPost(post.id, {
        title: form.title.trim(),
        body: form.body.trim(),
      }),
    onSuccess: () =>
      applyMutationSuccess({
        client,
        message: "Post updated",
        queryKeys: [["blog"]],
        afterSuccess: onClose,
      }),
  });

  return (
    <FormSheet
      title="Edit post"
      submitLabel="Save changes"
      open
      onOpenChange={(next) => !next && onClose()}
      onSubmit={() => update.mutateAsync()}
    >
      <BlogPostFormFields
        values={form}
        onChange={(patch) => setForm((current) => ({ ...current, ...patch }))}
      />
    </FormSheet>
  );
}
