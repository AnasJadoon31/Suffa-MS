import { useEffect, useState } from "react";
import { CheckCircle2, Newspaper, Plus } from "lucide-react";

import { operationsApi, type BlogPost } from "../lib/endpoints";
import { useAuth } from "../lib/AuthContext";

export function BlogView() {
  const { hasPermission } = useAuth();
  const canManage = hasPermission("blog.manage");
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [form, setForm] = useState({ title: "", body: "" });
  const [error, setError] = useState("");

  const load = async () => setPosts(await operationsApi.listBlogPosts());
  useEffect(() => {
    void load();
  }, []);

  return (
    <section className="modulePanel">
      <div className="moduleHeader">
        <h2><Newspaper size={18} /> Blog</h2>
        <p className="notice">Public-facing posts for the marketing site.</p>
      </div>

      {canManage && (
        <form
          className="inlineForm"
          onSubmit={async (e) => {
            e.preventDefault();
            setError("");
            if (!form.title || !form.body) return;
            try {
              await operationsApi.createBlogPost(form);
              setForm({ title: "", body: "" });
              await load();
            } catch (err: any) {
              setError(err.response?.data?.detail ?? "Failed to create post");
            }
          }}
        >
          <label>Title<input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></label>
          <label style={{ gridColumn: "span 2" }}>
            Body
            <input required value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} />
          </label>
          <div className="formActions"><button className="primaryAction" type="submit"><Plus size={16} /> Save draft</button></div>
        </form>
      )}
      {error && <p className="notice" style={{ color: "var(--rose)" }}>{error}</p>}

      <div className="dataTable">
        <div className="dataRow header"><span>Title</span><span>Body</span><span>Status</span><span></span></div>
        {posts.length === 0 && <p className="emptyState">No posts yet.</p>}
        {posts.map((p) => (
          <div className="dataRow" key={p.id}>
            <span>{p.title}</span>
            <span>{p.body}</span>
            <span>{p.published ? "Published" : "Draft"}</span>
            <span>
              {canManage && !p.published && (
                <button
                  className="tableAction"
                  type="button"
                  onClick={async () => { await operationsApi.publishBlogPost(p.id); await load(); }}
                >
                  <CheckCircle2 size={14} /> Publish
                </button>
              )}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
