import { useEffect, useState } from "react";
import { Download, FolderPlus, Plus, Video } from "lucide-react";
import { useTranslation } from "react-i18next";

import { filesApi, operationsApi, type ResourceCategory, type ResourceItem, type Scope } from "../lib/endpoints";
import { AudiencePicker } from "./AudiencePicker";
import { useAuth } from "../lib/AuthContext";
import { cachedFetch } from "../lib/offlineCache";
import { Input, Select } from "./ui/Field";


export function ResourcesView() {
  const { t } = useTranslation();
  const { hasPermission } = useAuth();
  const canManage = hasPermission("resources.manage");
  const [categories, setCategories] = useState<ResourceCategory[]>([]);
  const [resources, setResources] = useState<ResourceItem[]>([]);
  const [categoryFilter, setCategoryFilter] = useState("");
  const [categoryName, setCategoryName] = useState("");
  const [form, setForm] = useState({ category_id: "", title: "", description: "", video_url: "" });
  const [audience, setAudience] = useState<Scope>({ all: true });
  const [file, setFile] = useState<File | null>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const loadResources = async (categoryId?: string) => {
    const { data } = await cachedFetch(`resources:${categoryId || "all"}`, () =>
      operationsApi.listResources(categoryId || undefined),
    );
    setResources(data);
  };
  const refreshAll = async () => {
    const { data } = await cachedFetch("resource-categories", () => operationsApi.listResourceCategories());
    setCategories(data);
    await loadResources(categoryFilter);
  };

  useEffect(() => {
    void refreshAll();
  }, []);

  return (
    <section className="modulePanel">
      <div className="moduleHeader">
        <h2>{t("resources")}</h2>
        <p className="notice">{t("descResources")}</p>
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
          <label>{t("categoryNameLabel")}<Input required value={categoryName} onChange={(e) => setCategoryName(e.target.value)} placeholder="e.g. Tajweed" /></label>
          <div className="formActions"><button className="primaryAction" type="submit"><FolderPlus size={16} /> {t("addCategoryBtn")}</button></div>
        </form>
      )}

      <div className="moduleToolbar">
        <div className="searchBox">
          <label htmlFor="resource-category">{t("categoryCol")}</label>
          <Select
            id="resource-category"
            value={categoryFilter}
            onChange={(e) => {
              setCategoryFilter(e.target.value);
              void loadResources(e.target.value);
            }}
          >
            <option value="">{t("allCategories")}</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
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
                file_key, video_url: form.video_url || undefined, visibility_scope: audience,
              });
              setForm({ category_id: form.category_id, title: "", description: "", video_url: "" });
              setFile(null);
              setNotice(t("resourceAdded"));
              await refreshAll();
            } catch (err: any) {
              setError(err.response?.data?.detail ?? t("failedAddResource"));
            }
          }}
        >
          <label>
            {t("categoryCol")}
            <Select required value={form.category_id} onChange={(e) => setForm({ ...form, category_id: e.target.value })}>
              <option value="">{t("selectEllipsis")}</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </label>
          <label>{t("titleLabel")}<Input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></label>
          <label>{t("descriptionLabel")}<Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></label>
          <label>{t("videoUrlLabel")}<Input value={form.video_url} onChange={(e) => setForm({ ...form, video_url: e.target.value })} placeholder={t("optionalPlaceholder")} /></label>
          <label>{t("fileLabel")}<Input type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} /></label>
          <AudiencePicker value={audience} onChange={setAudience} />
          <div className="formActions"><button className="primaryAction" type="submit"><Plus size={16} /> {t("addResourceBtn")}</button></div>
        </form>
      )}
      {error && <p className="notice" style={{ color: "var(--rose)" }}>{error}</p>}
      {notice && <p className="notice">{notice}</p>}

      <div className="dataTable">
        <div className="dataRow header"><span>{t("titleCol")}</span><span>{t("categoryCol")}</span><span>{t("descriptionLabel")}</span><span></span></div>
        {resources.length === 0 && <p className="emptyState">{t("noResourcesYet")}</p>}
        {resources.map((r) => (
          <ResourceRow key={r.id} resource={r} categoryName={categories.find((c) => c.id === r.category_id)?.name ?? "—"} />
        ))}
      </div>
    </section>
  );
}

function ResourceRow({ resource, categoryName }: Readonly<{ resource: ResourceItem; categoryName: string }>) {
  const { t } = useTranslation();
  return (
    <div className="dataRow">
      <span>{resource.title}</span>
      <span>{categoryName}</span>
      <span>{resource.description ?? "—"}</span>
      <span>
        {resource.video_url && (
          <a className="tableAction" href={resource.video_url} target="_blank" rel="noreferrer">
            <Video size={14} /> {t("watchBtn")}
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
            <Download size={14} /> {t("downloadBtn")}
          </button>
        )}
      </span>
    </div>
  );
}
