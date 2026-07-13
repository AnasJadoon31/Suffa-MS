import { useEffect, useState } from "react";
import { ChevronDown, ChevronRight, Megaphone, Pencil, Plus, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";

import { operationsApi, type Announcement, type Scope } from "../lib/endpoints";
import { useAuth } from "../lib/AuthContext";
import { RichTextEditor } from "./RichTextEditor";
import { Input, Select } from "./ui/Field";


function toScope(audience: string): Scope {
  if (audience === "students") return { all: false, classes: [], roles: ["student"] };
  if (audience === "teachers") return { all: false, classes: [], roles: ["teacher"] };
  return { all: true, classes: [], roles: [] };
}

function fromScope(scope: Scope): string {
  if (scope.roles?.includes("student")) return "students";
  if (scope.roles?.includes("teacher")) return "teachers";
  return "all";
}

const audienceLabelKey: Record<string, string> = { all: "audienceEveryone", teachers: "teachers", students: "students" };

export function AnnouncementsView() {
  const { t } = useTranslation();
  const { hasPermission } = useAuth();
  const canPost = hasPermission("announcements.post");
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [form, setForm] = useState({ title: "", body: "", attachment_link: "", audience: "all", publish_at: "", expires_at: "" });
  const [error, setError] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ title: "", body: "", attachment_link: "", audience: "all", publish_at: "", expires_at: "" });
  const [editError, setEditError] = useState("");
  const [tab, setTab] = useState<"all" | "teachers" | "students">("all");
  const [search, setSearch] = useState("");
  const [dates, setDates] = useState({ date_from: "", date_to: "" });

  const load = async () => {
    const params: Parameters<typeof operationsApi.listAnnouncements>[0] = {};
    if (canPost && tab !== "all") params.audience = tab;
    if (search) params.q = search;
    if (dates.date_from) params.date_from = dates.date_from;
    if (dates.date_to) params.date_to = dates.date_to;
    setAnnouncements(await operationsApi.listAnnouncements(params));
  };
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, search, dates]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!form.title || !form.body) return;
    try {
      await operationsApi.createAnnouncement({
        title: form.title,
        body: form.body,
        attachment_link: form.attachment_link || undefined,
        audience_scope: toScope(form.audience),
        publish_at: form.publish_at ? new Date(form.publish_at).toISOString() : undefined,
        expires_at: form.expires_at ? new Date(form.expires_at).toISOString() : undefined,
      });
      setForm({ title: "", body: "", attachment_link: "", audience: "all", publish_at: "", expires_at: "" });
      await load();
    } catch (err: any) {
      setError(err.response?.data?.detail ?? t("failedPostAnnouncement"));
    }
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    setEditError("");
    if (!editId || !editForm.title || !editForm.body) return;
    try {
      await operationsApi.updateAnnouncement(editId, {
        title: editForm.title,
        body: editForm.body,
        attachment_link: editForm.attachment_link || undefined,
        audience_scope: toScope(editForm.audience),
        publish_at: editForm.publish_at ? new Date(editForm.publish_at).toISOString() : undefined,
        expires_at: editForm.expires_at ? new Date(editForm.expires_at).toISOString() : undefined,
      });
      setEditId(null);
      await load();
    } catch (err: any) {
      setEditError(err.response?.data?.detail ?? t("failedUpdateAnnouncement"));
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm(t("deleteAnnouncementConfirm"))) return;
    try {
      await operationsApi.deleteAnnouncement(id);
      await load();
    } catch (err: any) {
      alert(t("failedDelete") + ": " + (err.response?.data?.detail ?? err.message));
    }
  };

  const modalOverlayStyle: React.CSSProperties = {
    position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: "rgba(0,0,0,0.5)",
    display: "flex", alignItems: "center", justifyContent: "center",
    zIndex: 1000
  };
  const modalContentStyle: React.CSSProperties = {
    backgroundColor: "var(--surface)", padding: "2rem", borderRadius: "8px",
    width: "100%", maxWidth: "700px", maxHeight: "90vh", overflowY: "auto",
    boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.1)"
  };

  return (
    <section className="modulePanel">
      <div className="moduleHeader">
        <h2>{t("announcementsHeading")}</h2>
        <p className="notice">{t("announcementsSubtitle")}</p>
      </div>

      {canPost && (
        <form className="inlineForm" onSubmit={handleCreate}>
          <label>{t("titleLabel")}<Input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></label>
          <label>{t("targetAudienceLabel")}
            <Select value={form.audience} onChange={(e) => setForm({ ...form, audience: e.target.value })}>
              <option value="all">{t("audienceEveryone")}</option>
              <option value="teachers">{t("teachers")}</option>
              <option value="students">{t("students")}</option>
            </Select>
          </label>
          <label>{t("attachmentLinkLabel")}<Input value={form.attachment_link} onChange={(e) => setForm({ ...form, attachment_link: e.target.value })} placeholder={t("optionalPlaceholder")} /></label>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
            <label>{t("publishAtLabel")}<Input type="datetime-local" value={form.publish_at} onChange={(e) => setForm({ ...form, publish_at: e.target.value })} /></label>
            <label>{t("expiresAtLabel")}<Input type="datetime-local" value={form.expires_at} onChange={(e) => setForm({ ...form, expires_at: e.target.value })} /></label>
          </div>
          <div style={{ gridColumn: "1 / -1", display: "flex", flexDirection: "column", gap: "6px" }}>
            <span style={{ color: "var(--muted)", fontWeight: 650, fontSize: "0.86rem" }}>{t("bodyLabel")}</span>
            <RichTextEditor
              value={form.body}
              onChange={(html) => setForm({ ...form, body: html })}
              placeholder={t("announcementContentPlaceholder")}
            />
          </div>
          <div className="formActions">
            <button className="primaryAction" type="submit"><Plus size={16} /> {t("postAnnouncementBtn")}</button>
          </div>
        </form>
      )}
      {error && <p className="notice" style={{ color: "var(--rose)" }}>{error}</p>}

      <div className="filterBar">
        {canPost && (
          <>
            <button className={tab === "all" ? "primaryAction" : "secondaryAction"} type="button" onClick={() => setTab("all")}>{t("audienceEveryone")}</button>
            <button className={tab === "teachers" ? "primaryAction" : "secondaryAction"} type="button" onClick={() => setTab("teachers")}>{t("teachers")}</button>
            <button className={tab === "students" ? "primaryAction" : "secondaryAction"} type="button" onClick={() => setTab("students")}>{t("students")}</button>
          </>
        )}
        <Input placeholder={t("searchAnnouncementsPlaceholder")} value={search} onChange={(e) => setSearch(e.target.value)} />
        <Input type="date" value={dates.date_from} onChange={(e) => setDates({ ...dates, date_from: e.target.value })} />
        <Input type="date" value={dates.date_to} onChange={(e) => setDates({ ...dates, date_to: e.target.value })} />
      </div>

      <div className="roster">
        {announcements.length === 0 && <p className="emptyState">{t("noAnnouncementsListYet")}</p>}
        {announcements.map((a) => (
          <div className="rosterRow" key={a.id} style={{ alignItems: "flex-start", cursor: "pointer", transition: "background-color 0.15s ease" }} onClick={() => setExpandedId(expandedId === a.id ? null : a.id)}>
            <div style={{ flex: 1, padding: "0.5rem 0" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                {expandedId === a.id ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                <strong><Megaphone size={14} /> {a.title}</strong>
              </div>
              
              {expandedId === a.id ? (
                <div style={{ marginTop: "1rem", marginLeft: "24px" }}>
                  <div dangerouslySetInnerHTML={{ __html: a.body }} className="richTextContent" />
                  {a.attachment_link && (
                    <div style={{ marginTop: "1rem" }}>
                      <a href={a.attachment_link} target="_blank" rel="noreferrer" style={{ fontWeight: 500, color: "var(--brand)" }}>{t("viewAttachmentLink")}</a>
                    </div>
                  )}
                  <div style={{ marginTop: "1rem", color: "var(--slate-500)", fontSize: "0.85rem" }}>
                    {t("announcementAudienceLine", { audience: t(audienceLabelKey[fromScope(a.audience_scope)]) })}
                  </div>
                </div>
              ) : (
                <div style={{ marginLeft: "24px", color: "var(--slate-500)", fontSize: "0.9rem", marginTop: "4px" }}>
                  {a.body.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 100)}...
                </div>
              )}
            </div>
            
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "0.5rem", padding: "0.5rem 0" }}>
              <small style={{ color: "var(--slate-500)" }}>{new Date(a.created_at).toLocaleString()}</small>
              {canPost && expandedId === a.id && (
                <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.5rem" }} onClick={(e) => e.stopPropagation()}>
                  <button
                    type="button"
                    style={{ background: "none", border: "1px solid var(--border)", borderRadius: "4px", padding: "4px 8px", cursor: "pointer" }}
                    onClick={() => {
                      setEditId(a.id);
                      setEditForm({
                        title: a.title,
                        body: a.body,
                        attachment_link: a.attachment_link || "",
                        audience: fromScope(a.audience_scope),
                        publish_at: a.publish_at ? new Date(a.publish_at).toISOString().slice(0, 16) : "",
                        expires_at: a.expires_at ? new Date(a.expires_at).toISOString().slice(0, 16) : "",
                      });
                    }}
                    title={t("editBtn")}
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    type="button"
                    style={{ background: "none", border: "1px solid var(--border)", borderRadius: "4px", padding: "4px 8px", cursor: "pointer", color: "var(--rose)" }}
                    onClick={() => handleDelete(a.id)}
                    title={t("deleteBtn")}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {editId && (
        <div style={modalOverlayStyle} onClick={() => setEditId(null)}>
          <div style={modalContentStyle} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ marginTop: 0, marginBottom: "1.5rem" }}>{t("editAnnouncementHeading")}</h3>
            <form className="inlineForm" style={{ gridTemplateColumns: "1fr", gap: "1.25rem", border: "none", padding: 0 }} onSubmit={handleUpdate}>
              <label>{t("titleLabel")}<Input required value={editForm.title} onChange={(e) => setEditForm({ ...editForm, title: e.target.value })} /></label>
              <label>{t("targetAudienceLabel")}
                <Select value={editForm.audience} onChange={(e) => setEditForm({ ...editForm, audience: e.target.value })}>
                  <option value="all">{t("audienceEveryone")}</option>
                  <option value="teachers">{t("teachers")}</option>
                  <option value="students">{t("students")}</option>
                </Select>
              </label>
              <label>{t("attachmentLinkLabel")}<Input value={editForm.attachment_link} onChange={(e) => setEditForm({ ...editForm, attachment_link: e.target.value })} /></label>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
                <label>{t("publishAtLabel")}<Input type="datetime-local" value={editForm.publish_at} onChange={(e) => setEditForm({ ...editForm, publish_at: e.target.value })} /></label>
                <label>{t("expiresAtLabel")}<Input type="datetime-local" value={editForm.expires_at} onChange={(e) => setEditForm({ ...editForm, expires_at: e.target.value })} /></label>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                <span style={{ color: "var(--muted)", fontWeight: 650, fontSize: "0.86rem" }}>{t("bodyLabel")}</span>
                <RichTextEditor
                  value={editForm.body}
                  onChange={(html) => setEditForm({ ...editForm, body: html })}
                />
              </div>

              {editError && <p className="notice" style={{ color: "var(--rose)" }}>{editError}</p>}

              <div className="formActions" style={{ justifyContent: "flex-end", marginTop: "1rem" }}>
                <button type="button" onClick={() => setEditId(null)}>{t("cancelBtn")}</button>
                <button className="primaryAction" type="submit">{t("saveChangesBtn")}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}
