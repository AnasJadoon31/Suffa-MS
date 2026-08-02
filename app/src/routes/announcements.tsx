import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Megaphone, Search, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/app/AppShell";
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
import { RichText } from "@/components/app/RichText";
import { RichTextEditor } from "@/components/app/RichTextEditor";
import { useAuth } from "@/lib/mms/auth";
import { opsApi, opsMutations } from "@/lib/mms/more-endpoints";

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
  const { user, hasPermission } = useAuth();
  const client = useQueryClient();
  const canManage =
    user?.role === "principal" ||
    user?.role === "super_admin" ||
    hasPermission("announcements.manage");

  const [audienceFilter, setAudienceFilter] = useState<"all" | "teachers" | "students">("all");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const filterParams = {
    ...(audienceFilter !== "all" ? { audience: audienceFilter } : {}),
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

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [category, setCategory] = useState("");
  const [audience, setAudience] = useState("all");
  const [link, setLink] = useState("");

  const create = useMutation({
    mutationFn: () =>
      opsMutations.createAnnouncement({
        title: title.trim(),
        body: body.trim(),
        ...(category.trim() ? { category: category.trim() } : {}),
        ...(link.trim() ? { attachment_link: link.trim() } : {}),
        audience_scope: audience === "all" ? { all: true } : { all: false, roles: [audience] },
      }),
    onSuccess: () => {
      toast.success("Announcement published");
      setTitle("");
      setBody("");
      setCategory("");
      setLink("");
      void client.invalidateQueries({ queryKey: ["announcements"] });
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) => opsMutations.deleteAnnouncement(id),
    onSuccess: () => {
      toast.success("Deleted");
      void client.invalidateQueries({ queryKey: ["announcements"] });
    },
  });

  return (
    <AppShell
      title="Announcements"
      subtitle={`${items.length} notices`}
      right={
        canManage ? (
          <FormSheet
            title="New announcement"
            triggerLabel="New"
            submitLabel="Publish"
            onSubmit={() => create.mutateAsync()}
          >
            <Field label="Title">
              <TextInput required value={title} onChange={(e) => setTitle(e.target.value)} />
            </Field>
            <Field label="Message">
              <RichTextEditor value={body} onChange={setBody} placeholder="Write the notice…" />
            </Field>
            <Field label="Category">
              <TextInput
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="General"
              />
            </Field>
            <Field label="Audience">
              <SelectInput value={audience} onChange={(e) => setAudience(e.target.value)}>
                <option value="all">Everyone</option>
                <option value="teacher">Teachers</option>
                <option value="student">Students</option>
                <option value="parent">Guardians</option>
              </SelectInput>
            </Field>
            <Field label="Attachment link">
              <TextInput
                value={link}
                onChange={(e) => setLink(e.target.value)}
                placeholder="https://"
              />
            </Field>
          </FormSheet>
        ) : undefined
      }
    >
      <div className="mb-3 space-y-2.5">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <TextInput
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search announcements…"
            className="pl-9"
          />
        </div>
        <div className="grid grid-cols-2 gap-2.5">
          <Field label="Audience">
            <SelectInput
              value={audienceFilter}
              onChange={(e) => setAudienceFilter(e.target.value as typeof audienceFilter)}
            >
              <option value="all">All</option>
              <option value="teachers">Teachers</option>
              <option value="students">Students</option>
            </SelectInput>
          </Field>
          <Field label="Category">
            <TextInput
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              placeholder="Any"
            />
          </Field>
          <Field label="From">
            <TextInput type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          </Field>
          <Field label="To">
            <TextInput type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          </Field>
        </div>
      </div>

      {query.isLoading ? <SkeletonList rows={4} /> : null}
      {!query.isLoading && items.length === 0 ? (
        <EmptyState title="Nothing announced yet" hint="New notices will appear here." />
      ) : null}

      <div className="space-y-2.5">
        {items.map((item) => (
          <Card key={item.id} className="space-y-2 p-4">
            <div className="flex items-start gap-3">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent-foreground">
                <Megaphone className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-display text-base font-extrabold leading-snug">{item.title}</p>
                <p className="text-xs text-muted-foreground">
                  {new Date(item.publish_at ?? item.created_at).toLocaleString()}
                </p>
              </div>
              {item.category ? <Pill tone="gold">{item.category}</Pill> : null}
            </div>
            <RichText html={item.body} />
            <div className="flex items-center gap-3">
              {item.attachment_link ? (
                <a
                  href={item.attachment_link}
                  target="_blank"
                  rel="noreferrer"
                  className="text-sm font-bold text-primary underline underline-offset-4"
                >
                  Open attachment
                </a>
              ) : null}
              {canManage ? (
                <button
                  onClick={() => remove.mutate(item.id)}
                  className="ml-auto inline-flex items-center gap-1.5 rounded-xl bg-destructive/10 px-3 py-1.5 text-xs font-bold text-destructive"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Delete
                </button>
              ) : null}
            </div>
          </Card>
        ))}
      </div>
    </AppShell>
  );
}
