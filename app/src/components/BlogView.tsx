import { Button } from "./ui/Button";
import { useEffect, useState } from "react";
import { Box } from "./ui/Mui";
import { Paper } from "./ui/Mui";
import { Typography } from "./ui/Mui";
import { Alert } from "./ui/Mui";
import { Chip } from "./ui/Mui";
import { CheckCircle2, Newspaper, Pencil, Plus, Trash2, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useDialog } from "../lib/DialogContext";

import { operationsApi, type BlogPost } from "../lib/endpoints";
import { useAuth } from "../lib/AuthContext";
import { RichTextEditor } from "./RichTextEditor";
import { Input } from "./ui/Field";
import { ErrorState, LoadingState } from "./ui/AsyncState";
import { useSessionReadOnly } from "./SessionSwitcher";
import { Modal, FormModal } from "./ui/Modal";
import { PageSection, PageHeader } from "./ui/Layout";
import { BlogCard } from "./ui/Card";
import { ActionMenu } from "./ui/ActionMenu";

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

export function BlogView() {
  const { t } = useTranslation();
  const { confirm, alert } = useDialog();
  const { hasPermission } = useAuth();
  const readOnly = useSessionReadOnly();
  const canManage = !readOnly && hasPermission("blog.manage");
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [form, setForm] = useState({ title: "", body: "" });
  const [editing, setEditing] = useState<BlogPost | null>(null);
  const [editForm, setEditForm] = useState({ title: "", body: "" });
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [showCreate, setShowCreate] = useState(false);

  const load = async () => setPosts(await operationsApi.listBlogPosts());
  useEffect(() => {
    void (async () => {
      setIsLoading(true);
      try {
        await load();
        setLoadError("");
      } catch (err: any) {
        setLoadError(err.response?.data?.detail ?? t("failedLoadPosts"));
      } finally {
        setIsLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startEdit = (post: BlogPost) => {
    setEditing(post);
    setEditForm({ title: post.title, body: post.body });
  };

  return (
    <PageSection>
      <PageHeader
        title={t("blog")}
        icon={<Newspaper size={18} />}
        notice={t("descBlog")}
      />

      {canManage && !editing && <Button type="button" onClick={() => setShowCreate(true)}><Plus size={16} /> {t("saveDraftBtn")}</Button>}
      {canManage && !editing && showCreate && (
        <FormModal
                title={t("saveDraftBtn")} onClose={() => setShowCreate(false)}
                onSubmit={async (e) => {
                          e.preventDefault();
                          setError("");
                          if (!form.title || !stripHtml(form.body)) return;
                          try {
                            await operationsApi.createBlogPost(form);
                            setForm({ title: "", body: "" });
                            setShowCreate(false);
                            await load();
                          } catch (err: any) {
                            setError(err.response?.data?.detail ?? t("failedCreatePost"));
                          }
                        }}
                submitLabel={t("saveDraftBtn")}
                submitIcon={<Plus size={16} />}
              >
                <label>{t("titleLabel")}<Input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></label>

              <Box sx={{ gridColumn: "1 / -1", display: "flex", flexDirection: "column", gap: 0.75 }}>
                          <Typography component="span" sx={{ color: "text.secondary", fontWeight: 650, fontSize: "0.86rem" }}>
                            {t("bodyLabel")}
                          </Typography>
                          <RichTextEditor
                            value={form.body}
                            onChange={(body) => setForm((current) => ({ ...current, body }))}
                            placeholder={t("writePostPlaceholder")}
                          />
                        </Box>
              </FormModal>
      )}

      {canManage && editing && (
        <FormModal
                title={t("editPostHeading", { title: editing.title })} onClose={() => setEditing(null)}
                onSubmit={async (e) => {
                          e.preventDefault();
                          setError("");
                          try {
                            await operationsApi.updateBlogPost(editing.id, editForm);
                            setEditing(null);
                            await load();
                          } catch (err: any) {
                            setError(err.response?.data?.detail ?? t("failedUpdate"));
                          }
                        }}
                submitLabel={t("saveBtn")}
              >
                <Typography variant="h6" sx={{ gridColumn: "1 / -1" }}>{t("editPostHeading", { title: editing.title })}</Typography>

              <label>{t("titleLabel")}<Input required value={editForm.title} onChange={(e) => setEditForm({ ...editForm, title: e.target.value })} /></label>

              <Box sx={{ gridColumn: "1 / -1" }}>
                          <RichTextEditor value={editForm.body} onChange={(body) => setEditForm((cur) => ({ ...cur, body }))} />
                        </Box>
              </FormModal>
      )}

      {error && <Alert severity="error" sx={{ mt: 1 }}>{error}</Alert>}

      {isLoading && <LoadingState />}
      {!isLoading && loadError && <ErrorState message={loadError} />}
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "repeat(2, 1fr)", lg: "repeat(3, 1fr)" }, gap: 2 }}>
        {!isLoading && !loadError && posts.length === 0 && <Typography sx={{ color: "text.secondary", fontStyle: "italic" }}>{t("noPostsYet")}</Typography>}
        {!isLoading && !loadError && posts.map((p) => (
          <BlogCard key={p.id}>
            <header>
              <h3>{p.title}</h3>
              <Chip
                label={p.published ? t("publishedLabel") : t("draftLabel")}
                size="small"
                color={p.published ? "success" : "default"}
              />
            </header>
            <p>{stripHtml(p.body).slice(0, 220)}{stripHtml(p.body).length > 220 ? "…" : ""}</p>
            <small>{new Date(p.created_at).toLocaleDateString()}</small>
            {canManage && (
              <ActionMenu
                ariaLabel={`${t("actionsCol")}: ${p.title}`}
                items={[
                  ...(!p.published ? [{
                    label: t("publishBtn"),
                    icon: <CheckCircle2 size={14} />,
                    onClick: async () => { await operationsApi.publishBlogPost(p.id); await load(); },
                  }] : []),
                  {
                    label: t("editBtn"),
                    icon: <Pencil size={14} />,
                    onClick: () => startEdit(p),
                  },
                  {
                    label: t("deleteBtn"),
                    icon: <Trash2 size={14} />,
                    destructive: true,
                    onClick: async () => {
                      if (!(await confirm(t("deletePostConfirm", { title: p.title })))) return;
                      await operationsApi.deleteBlogPost(p.id);
                      await load();
                    },
                  },
                ]}
              />
            )}
          </BlogCard>
        ))}
      </Box>
    </PageSection>
  );
}
