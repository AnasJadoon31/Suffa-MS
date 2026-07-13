import { useEffect, useState } from "react";
import { Download, Edit2, FolderPlus, Plus, Trash2, Video } from "lucide-react";
import { useTranslation } from "react-i18next";

import {
  academicsApi,
  operationsApi,
  filesApi,
  type AcademicClass,
  type ResourceCategory,
  type ResourceItem,
  type Scope,
  type Section,
} from "../lib/endpoints";
import { AudiencePicker } from "./AudiencePicker";
import { useAuth } from "../lib/AuthContext";
import { cachedFetch } from "../lib/offlineCache";
import { Input, Select } from "./ui/Field";

const emptyForm = { category_id: "", title: "", description: "", video_url: "" };

export function ResourcesView() {
  const { t } = useTranslation();
  const { hasPermission } = useAuth();
  const canManage = hasPermission("resources.manage");
  const canManageAll = hasPermission("resources.manage_all");
  const [categories, setCategories] = useState<ResourceCategory[]>([]);
  const [resources, setResources] = useState<ResourceItem[]>([]);
  const [classes, setClasses] = useState<AcademicClass[]>([]);
  const [sections, setSections] = useState<Section[]>([]);

  const [categoryFilter, setCategoryFilter] = useState("");
  const [classFilter, setClassFilter] = useState("");
  const [sectionFilter, setSectionFilter] = useState("");
  const [mineOnly, setMineOnly] = useState(false);

  const [categoryName, setCategoryName] = useState("");
  const [categoryIsGlobal, setCategoryIsGlobal] = useState(true);
  const [form, setForm] = useState(emptyForm);
  const [audience, setAudience] = useState<Scope>({ all: true });
  const [file, setFile] = useState<File | null>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const [editing, setEditing] = useState<ResourceItem | null>(null);
  const [editAudience, setEditAudience] = useState<Scope>({ all: true });
  const [editError, setEditError] = useState("");

  const loadResources = async () => {
    const { data } = await cachedFetch(
      `resources:${categoryFilter || "all"}:${classFilter}:${sectionFilter}:${mineOnly}`,
      () =>
        operationsApi.listResources({
          category_id: categoryFilter || undefined,
          class_id: canManageAll ? classFilter || undefined : undefined,
          section_id: canManageAll ? sectionFilter || undefined : undefined,
          mine_only: mineOnly || undefined,
        }),
    );
    setResources(data);
  };
  const refreshAll = async () => {
    const { data } = await cachedFetch("resource-categories", () => operationsApi.listResourceCategories());
    setCategories(data);
    if (canManageAll) {
      const classList = await academicsApi.listClasses();
      setClasses(classList);
    }
    await loadResources();
  };

  useEffect(() => {
    void refreshAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    void loadResources();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categoryFilter, classFilter, sectionFilter, mineOnly]);
  useEffect(() => {
    if (!classFilter) {
      setSections([]);
      setSectionFilter("");
      return;
    }
    void academicsApi.listSections(classFilter).then(setSections);
  }, [classFilter]);

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
            await operationsApi.createResourceCategory(categoryName, categoryIsGlobal);
            setCategoryName("");
            await refreshAll();
          }}
        >
          <label>{t("categoryNameLabel")}<Input required value={categoryName} onChange={(e) => setCategoryName(e.target.value)} placeholder="e.g. Tajweed" /></label>
          {canManageAll && (
            <label style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Input type="checkbox" checked={categoryIsGlobal} onChange={(e) => setCategoryIsGlobal(e.target.checked)} />
              {t("globalLabel")}
            </label>
          )}
          <div className="formActions"><button className="primaryAction" type="submit"><FolderPlus size={16} /> {t("addCategoryBtn")}</button></div>
        </form>
      )}

      <div className="moduleToolbar">
        <div className="searchBox">
          <label htmlFor="resource-category">{t("categoryCol")}</label>
          <Select id="resource-category" value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
            <option value="">{t("allCategories")}</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}{c.is_mine && c.owner_id ? ` (${t("mineTagLabel")})` : ""}</option>
            ))}
          </Select>
        </div>
        {canManageAll && (
          <>
            <div className="searchBox">
              <label htmlFor="resource-browse-class">{t("browseByClassLabel")}</label>
              <Select id="resource-browse-class" value={classFilter} onChange={(e) => setClassFilter(e.target.value)}>
                <option value="">{t("allClasses")}</option>
                {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
            </div>
            {classFilter && (
              <div className="searchBox">
                <label htmlFor="resource-browse-section">{t("browseBySectionLabel")}</label>
                <Select id="resource-browse-section" value={sectionFilter} onChange={(e) => setSectionFilter(e.target.value)}>
                  <option value="">{t("allSections")}</option>
                  {sections.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </Select>
              </div>
            )}
          </>
        )}
        {canManage && (
          <label style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Input type="checkbox" checked={mineOnly} onChange={(e) => setMineOnly(e.target.checked)} />
            {t("myUploadsOnlyLabel")}
          </label>
        )}
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
              setForm({ ...emptyForm, category_id: form.category_id });
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
        <div className="dataRow header"><span>{t("titleCol")}</span><span>{t("categoryCol")}</span><span>{t("ownerCol")}</span><span></span></div>
        {resources.length === 0 && <p className="emptyState">{t("noResourcesYet")}</p>}
        {resources.map((r) => (
          <ResourceRow
            key={r.id}
            resource={r}
            categoryName={categories.find((c) => c.id === r.category_id)?.name ?? "—"}
            canEdit={canManage}
            onEdit={() => {
              setEditing(r);
              setEditAudience(r.visibility_scope);
              setEditError("");
            }}
            onDelete={async () => {
              if (!confirm(t("deleteResourceConfirm") ?? "")) return;
              try {
                await operationsApi.deleteResource(r.id);
                await refreshAll();
              } catch (err: any) {
                alert(err.response?.data?.detail ?? t("failedDeleteResource"));
              }
            }}
          />
        ))}
      </div>

      {editing && (
        <div
          style={{
            position: "fixed", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.5)",
            display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000,
          }}
          onClick={() => setEditing(null)}
        >
          <div
            style={{
              backgroundColor: "var(--surface)", padding: "2rem", borderRadius: "8px", width: "100%",
              maxWidth: "600px", maxHeight: "90vh", overflowY: "auto",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ marginTop: 0 }}>{t("editResourceHeading")}</h3>
            <form
              className="inlineForm"
              style={{ gridTemplateColumns: "1fr", border: "none", padding: 0 }}
              onSubmit={async (e) => {
                e.preventDefault();
                if (!editing) return;
                setEditError("");
                try {
                  await operationsApi.updateResource(editing.id, {
                    category_id: editing.category_id, title: editing.title, description: editing.description ?? undefined,
                    visibility_scope: editAudience,
                  });
                  setEditing(null);
                  await refreshAll();
                } catch (err: any) {
                  setEditError(err.response?.data?.detail ?? t("failedUpdateResource"));
                }
              }}
            >
              <label>{t("titleLabel")}<Input required value={editing.title} onChange={(e) => setEditing({ ...editing, title: e.target.value })} /></label>
              <label>
                {t("categoryCol")}
                <Select value={editing.category_id} onChange={(e) => setEditing({ ...editing, category_id: e.target.value })}>
                  {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </Select>
              </label>
              <label>{t("descriptionLabel")}<Input value={editing.description ?? ""} onChange={(e) => setEditing({ ...editing, description: e.target.value })} /></label>
              <AudiencePicker value={editAudience} onChange={setEditAudience} />
              {editError && <p className="notice" style={{ color: "var(--rose)" }}>{editError}</p>}
              <div className="formActions" style={{ justifyContent: "flex-end" }}>
                <button type="button" onClick={() => setEditing(null)}>{t("cancelBtn")}</button>
                <button className="primaryAction" type="submit">{t("editBtn")}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}

function ResourceRow({
  resource, categoryName, canEdit, onEdit, onDelete,
}: Readonly<{
  resource: ResourceItem; categoryName: string; canEdit: boolean; onEdit: () => void; onDelete: () => void;
}>) {
  const { t } = useTranslation();
  return (
    <div className="dataRow">
      <span>{resource.title}</span>
      <span>{categoryName}</span>
      <span>{resource.owner_name ?? "—"}</span>
      <span style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
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
        {canEdit && (
          <>
            <button className="iconBtn" type="button" title={t("editBtn") ?? ""} onClick={onEdit}><Edit2 size={14} /></button>
            <button className="iconBtn" type="button" title={t("deleteBtn") ?? ""} onClick={onDelete}><Trash2 size={14} /></button>
          </>
        )}
      </span>
    </div>
  );
}
