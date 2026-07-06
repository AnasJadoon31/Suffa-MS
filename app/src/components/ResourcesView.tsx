import { useEffect, useState } from "react";
import { Download, FolderPlus, Plus, Video } from "lucide-react";

import { filesApi, operationsApi, type ResourceCategory, type ResourceItem } from "../lib/endpoints";
import { useAuth } from "../lib/AuthContext";

export function ResourcesView() {
  const { hasPermission } = useAuth();
  const canManage = hasPermission("resources.manage");
  const [categories, setCategories] = useState<ResourceCategory[]>([]);
  const [resources, setResources] = useState<ResourceItem[]>([]);
  const [categoryFilter, setCategoryFilter] = useState("");
  const [categoryName, setCategoryName] = useState("");
  const [form, setForm] = useState({ category_id: "", title: "", description: "", video_url: "" });
  const [file, setFile] = useState<File | null>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const loadResources = async (categoryId?: string) => setResources(await operationsApi.listResources(categoryId || undefined));
  const refreshAll = async () => {
    setCategories(await operationsApi.listResourceCategories());
    await loadResources(categoryFilter);
  };

  useEffect(() => {
    void refreshAll();
  }, []);

  return (
    <section className="modulePanel">
      <div className="moduleHeader">
        <h2>Resources</h2>
        <p className="notice">Study material for classes and students.</p>
      </div>

      {canManage && (
        <form
          className="inlineForm"
          onSubmit={async (e) => {
            e.preventDefault();
            setError("");
            if (!categoryName) return;
            await operationsApi.createResourceCategory(categoryName);
            setCategoryName("");
            await refreshAll();
          }}
        >
          <label>Category name<input required value={categoryName} onChange={(e) => setCategoryName(e.target.value)} placeholder="e.g. Tajweed" /></label>
          <div className="formActions"><button className="primaryAction" type="submit"><FolderPlus size={16} /> Add category</button></div>
        </form>
      )}

      <div className="moduleToolbar">
        <div className="searchBox">
          <label htmlFor="resource-category">Category</label>
          <select
            id="resource-category"
            value={categoryFilter}
            onChange={(e) => {
              setCategoryFilter(e.target.value);
              void loadResources(e.target.value);
            }}
          >
            <option value="">All categories</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
      </div>

      {canManage && (
        <form
          className="inlineForm"
          onSubmit={async (e) => {
            e.preventDefault();
            setError("");
            setNotice("");
            if (!form.category_id || !form.title) return;
            try {
              let file_key: string | undefined;
              if (file) {
                const { object_key, upload_url } = await filesApi.presignUpload({
                  category: "resources", filename: file.name, content_type: file.type || "application/octet-stream",
                });
                await fetch(upload_url, { method: "PUT", body: file, headers: { "Content-Type": file.type || "application/octet-stream" } });
                file_key = object_key;
              }
              await operationsApi.createResource({
                category_id: form.category_id, title: form.title, description: form.description || undefined,
                file_key, video_url: form.video_url || undefined,
              });
              setForm({ category_id: form.category_id, title: "", description: "", video_url: "" });
              setFile(null);
              setNotice("Resource added.");
              await refreshAll();
            } catch (err: any) {
              setError(err.response?.data?.detail ?? "Failed to add resource");
            }
          }}
        >
          <label>
            Category
            <select required value={form.category_id} onChange={(e) => setForm({ ...form, category_id: e.target.value })}>
              <option value="">Select…</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
          <label>Title<input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></label>
          <label>Description<input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></label>
          <label>Video URL<input value={form.video_url} onChange={(e) => setForm({ ...form, video_url: e.target.value })} placeholder="optional" /></label>
          <label>File<input type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} /></label>
          <div className="formActions"><button className="primaryAction" type="submit"><Plus size={16} /> Add resource</button></div>
        </form>
      )}
      {error && <p className="notice" style={{ color: "var(--rose)" }}>{error}</p>}
      {notice && <p className="notice">{notice}</p>}

      <div className="dataTable">
        <div className="dataRow header"><span>Title</span><span>Category</span><span>Description</span><span></span></div>
        {resources.length === 0 && <p className="emptyState">No resources yet.</p>}
        {resources.map((r) => (
          <ResourceRow key={r.id} resource={r} categoryName={categories.find((c) => c.id === r.category_id)?.name ?? "—"} />
        ))}
      </div>
    </section>
  );
}

function ResourceRow({ resource, categoryName }: Readonly<{ resource: ResourceItem; categoryName: string }>) {
  return (
    <div className="dataRow">
      <span>{resource.title}</span>
      <span>{categoryName}</span>
      <span>{resource.description ?? "—"}</span>
      <span>
        {resource.video_url && (
          <a className="tableAction" href={resource.video_url} target="_blank" rel="noreferrer">
            <Video size={14} /> Watch
          </a>
        )}
        {resource.file_key && (
          <button
            className="tableAction"
            type="button"
            onClick={async () => {
              const { url } = await filesApi.presignDownload(resource.file_key!);
              window.open(url, "_blank", "noreferrer");
            }}
          >
            <Download size={14} /> Download
          </button>
        )}
      </span>
    </div>
  );
}
