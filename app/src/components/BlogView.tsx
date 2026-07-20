import { useEffect, useState } from "react";
import { CheckCircle2, Newspaper, Pencil, Plus, Trash2, X } from "lucide-react";
import { useTranslation } from "react-i18next";

import { operationsApi, type BlogPost } from "../lib/endpoints";
import { useAuth } from "../lib/AuthContext";
import { RichTextEditor } from "./RichTextEditor";
import { Input } from "./ui/Field";
import { ErrorState, LoadingState } from "./ui/AsyncState";
import { useSessionReadOnly } from "./SessionSwitcher";
import { Modal } from "./ui/Modal";

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

export function BlogView() {
  const { t } = useTranslation();
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
    <section className="modulePanel">
      <div className="moduleHeader">
        <h2><Newspaper size={18} /> {t("blog")}</h2>
        <p className="notice">{t("descBlog")}</p>
      </div>

      {canManage && !editing && <button className="primaryAction" type="button" onClick={() => setShowCreate(true)}><Plus size={16} /> {t("saveDraftBtn")}</button>}
      {canManage && !editing && showCreate && (
        <Modal title={t("saveDraftBtn")} onClose={() => setShowCreate(false)}><form
          className="inlineForm"
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
        >
          <label>{t("titleLabel")}<Input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></label>
          <div style={{ gridColumn: "1 / -1", display: "flex", flexDirection: "column", gap: "6px" }}>
            <span style={{ color: "var(--muted)", fontWeight: 650, fontSize: "0.86rem" }}>{t("bodyLabel")}</span>
            <RichTextEditor
              value={form.body}
              onChange={(body) => setForm((current) => ({ ...current, body }))}
              placeholder={t("writePostPlaceholder")}
            />
          </div>
          <div className="formActions"><button className="primaryAction" type="submit"><Plus size={16} /> {t("saveDraftBtn")}</button></div>
        </form></Modal>
      )}

      {canManage && editing && (
        <Modal title={t("editPostHeading", { title: editing.title })} onClose={() => setEditing(null)}><form
          className="inlineForm"
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
        >
          <h3 style={{ gridColumn: "1 / -1" }}>{t("editPostHeading", { title: editing.title })}</h3>
          <label>{t("titleLabel")}<Input required value={editForm.title} onChange={(e) => setEditForm({ ...editForm, title: e.target.value })} /></label>
          <div style={{ gridColumn: "1 / -1" }}>
            <RichTextEditor value={editForm.body} onChange={(body) => setEditForm((cur) => ({ ...cur, body }))} />
          </div>
          <div className="formActions">
            <button className="primaryAction" type="submit">{t("saveBtn")}</button>
            <button className="secondaryAction" type="button" onClick={() => setEditing(null)}><X size={14} /> {t("cancelBtn")}</button>
          </div>
        </form></Modal>
      )}

      {error && <p className="notice" style={{ color: "var(--rose)" }}>{error}</p>}

      {isLoading && <LoadingState />}
      {!isLoading && loadError && <ErrorState message={loadError} />}
      <div className="blogGrid">
        {!isLoading && !loadError && posts.length === 0 && <p className="emptyState">{t("noPostsYet")}</p>}
        {!isLoading && !loadError && posts.map((p) => (
          <article className="blogCard" key={p.id}>
            <header>
              <h3>{p.title}</h3>
              <span className={p.published ? "badge badgePublished" : "badge badgeDraft"}>
                {p.published ? t("publishedLabel") : t("draftLabel")}
              </span>
            </header>
            <p>{stripHtml(p.body).slice(0, 220)}{stripHtml(p.body).length > 220 ? "…" : ""}</p>
            <small>{new Date(p.created_at).toLocaleDateString()}</small>
            {canManage && (
              <div className="formActions">
                {!p.published && (
                  <button
                    className="tableAction"
                    type="button"
                    onClick={async () => { await operationsApi.publishBlogPost(p.id); await load(); }}
                  >
                    <CheckCircle2 size={14} /> {t("publishBtn")}
                  </button>
                )}
                <button className="tableAction" type="button" onClick={() => startEdit(p)}>
                  <Pencil size={14} /> {t("editBtn")}
                </button>
                <button
                  className="tableAction"
                  type="button"
                  onClick={async () => {
                    if (!window.confirm(t("deletePostConfirm", { title: p.title }))) return;
                    await operationsApi.deleteBlogPost(p.id);
                    await load();
                  }}
                >
                  <Trash2 size={14} /> {t("deleteBtn")}
                </button>
              </div>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}
