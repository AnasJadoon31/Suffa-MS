import { useEffect, useState } from "react";
import { Megaphone, Plus } from "lucide-react";

import { operationsApi, type Announcement } from "../lib/endpoints";
import { useAuth } from "../lib/AuthContext";

export function AnnouncementsView() {
  const { hasPermission } = useAuth();
  const canPost = hasPermission("announcements.post");
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [form, setForm] = useState({ title: "", body: "", attachment_link: "", publish_at: "", expires_at: "" });
  const [error, setError] = useState("");

  const load = async () => setAnnouncements(await operationsApi.listAnnouncements());
  useEffect(() => {
    void load();
  }, []);

  return (
    <section className="modulePanel">
      <div className="moduleHeader">
        <h2>Announcements</h2>
        <p className="notice">Notices published to staff, students, or guardians.</p>
      </div>

      {canPost && (
        <form
          className="inlineForm"
          onSubmit={async (e) => {
            e.preventDefault();
            setError("");
            if (!form.title || !form.body) return;
            try {
              await operationsApi.createAnnouncement({
                title: form.title,
                body: form.body,
                attachment_link: form.attachment_link || undefined,
                publish_at: form.publish_at ? new Date(form.publish_at).toISOString() : undefined,
                expires_at: form.expires_at ? new Date(form.expires_at).toISOString() : undefined,
              });
              setForm({ title: "", body: "", attachment_link: "", publish_at: "", expires_at: "" });
              await load();
            } catch (err: any) {
              setError(err.response?.data?.detail ?? "Failed to post announcement");
            }
          }}
        >
          <label>Title<input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></label>
          <label style={{ gridColumn: "span 2" }}>
            Body
            <input required value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} />
          </label>
          <label>Attachment link<input value={form.attachment_link} onChange={(e) => setForm({ ...form, attachment_link: e.target.value })} placeholder="optional" /></label>
          <label>Publish at<input type="datetime-local" value={form.publish_at} onChange={(e) => setForm({ ...form, publish_at: e.target.value })} /></label>
          <label>Expires at<input type="datetime-local" value={form.expires_at} onChange={(e) => setForm({ ...form, expires_at: e.target.value })} /></label>
          <div className="formActions">
            <button className="primaryAction" type="submit"><Plus size={16} /> Post announcement</button>
          </div>
        </form>
      )}
      {error && <p className="notice" style={{ color: "var(--rose)" }}>{error}</p>}

      <div className="roster">
        {announcements.length === 0 && <p className="emptyState">No announcements yet.</p>}
        {announcements.map((a) => (
          <div className="rosterRow" key={a.id}>
            <div>
              <strong><Megaphone size={14} /> {a.title}</strong>
              <small>{a.body}</small>
              {a.attachment_link && (
                <small><a href={a.attachment_link} target="_blank" rel="noreferrer">Attachment</a></small>
              )}
            </div>
            <small>{new Date(a.created_at).toLocaleString()}</small>
          </div>
        ))}
      </div>
    </section>
  );
}
