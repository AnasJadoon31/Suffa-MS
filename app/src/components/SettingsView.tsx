import { useEffect, useState } from "react";
import { Plus, Settings as SettingsIcon } from "lucide-react";

import { operationsApi, type MadrasaSetting } from "../lib/endpoints";
import { useAuth } from "../lib/AuthContext";
import { Input } from "./ui/Field";


export function SettingsView() {
  const { hasPermission } = useAuth();
  const canManage = hasPermission("academics.manage");
  const [settings, setSettings] = useState<MadrasaSetting[]>([]);
  const [form, setForm] = useState({ key: "", value: "" });
  const [error, setError] = useState("");

  const load = async () => setSettings(await operationsApi.listSettings());
  useEffect(() => {
    void load();
  }, []);

  return (
    <section className="modulePanel">
      <div className="moduleHeader">
        <h2><SettingsIcon size={18} /> Settings</h2>
        <p className="notice">Madrasa-wide key/value configuration.</p>
      </div>

      {canManage && (
        <form
          className="inlineForm"
          onSubmit={async (e) => {
            e.preventDefault();
            setError("");
            if (!form.key || !form.value) return;
            try {
              await operationsApi.upsertSetting(form.key, form.value);
              setForm({ key: "", value: "" });
              await load();
            } catch (err: any) {
              setError(err.response?.data?.detail ?? "Failed to save setting");
            }
          }}
        >
          <label>Key<Input required value={form.key} onChange={(e) => setForm({ ...form, key: e.target.value })} placeholder="e.g. content_language" /></label>
          <label>Value<Input required value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} /></label>
          <div className="formActions"><button className="primaryAction" type="submit"><Plus size={16} /> Save</button></div>
        </form>
      )}
      {error && <p className="notice" style={{ color: "var(--rose)" }}>{error}</p>}

      <div className="settingsGrid">
        <div className="dataTable">
          <div className="dataRow header"><span>Key</span><span>Value</span><span>Updated</span></div>
          {settings.length === 0 && <p className="emptyState">No settings configured yet.</p>}
          {settings.map((s) => (
            <div
              className="dataRow"
              key={s.id}
              style={canManage ? { cursor: "pointer" } : undefined}
              onClick={() => canManage && setForm({ key: s.key, value: s.value })}
            >
              <span>{s.key}</span>
              <span>{s.value}</span>
              <span>{new Date(s.updated_at).toLocaleString()}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
