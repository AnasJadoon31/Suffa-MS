import { useEffect, useMemo, useState } from "react";
import { Check, Settings as SettingsIcon, Upload } from "lucide-react";
import { useTranslation } from "react-i18next";

import { filesApi, operationsApi, type TypedSetting } from "../lib/endpoints";
import { useAuth } from "../lib/AuthContext";
import { Input, Select } from "./ui/Field";
import { ErrorState, LoadingState } from "./ui/AsyncState";
import { useSessionReadOnly } from "./SessionSwitcher";

export function SettingsView() {
  const { t } = useTranslation();
  const { hasPermission, refreshProfile } = useAuth();
  const readOnly = useSessionReadOnly();
  const canManage = !readOnly && hasPermission("settings.manage");
  const [settings, setSettings] = useState<TypedSetting[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [savedKey, setSavedKey] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const load = async () => setSettings(await operationsApi.settingsCatalog());
  useEffect(() => {
    void (async () => {
      setIsLoading(true);
      try {
        await load();
        setLoadError("");
      } catch (err: any) {
        setLoadError(err.response?.data?.detail ?? t("failedLoadSettings"));
      } finally {
        setIsLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const categories = useMemo(() => {
    const grouped = new Map<string, TypedSetting[]>();
    for (const item of settings) {
      grouped.set(item.category, [...(grouped.get(item.category) ?? []), item]);
    }
    return [...grouped.entries()];
  }, [settings]);

  const save = async (item: TypedSetting) => {
    const value = drafts[item.key];
    if (value === undefined || value === item.value) return;
    setError("");
    setSavedKey("");
    try {
      await operationsApi.upsertSetting(item.key, value);
      setSavedKey(item.key);
      await load();
      if (item.key.startsWith("madrasa.")) await refreshProfile();
    } catch (err: any) {
      setError(err.response?.data?.detail ?? t("failedSaveSetting"));
    }
  };

  const draftValue = (item: TypedSetting) => drafts[item.key] ?? item.value;

  const uploadFile = async (item: TypedSetting, file: File) => {
    setError("");
    setSavedKey("");
    try {
      const contentType = file.type || "application/octet-stream";
      const { object_key, upload_url } = await filesApi.presignUpload({
        category: "settings",
        filename: file.name,
        content_type: contentType,
        size_bytes: file.size,
      });
      const upload = await fetch(upload_url, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": contentType },
      });
      if (!upload.ok) throw new Error(t("failedUploadSettingFile"));
      await operationsApi.upsertSetting(item.key, object_key);
      setDrafts((current) => ({ ...current, [item.key]: object_key }));
      setSavedKey(item.key);
      await load();
      await refreshProfile();
    } catch (err: any) {
      setError(err.response?.data?.detail ?? err.message ?? t("failedUploadSettingFile"));
    }
  };

  return (
    <section className="modulePanel">
      <div className="moduleHeader">
        <h2><SettingsIcon size={18} /> {t("settingsTitle")}</h2>
        <p className="notice">{t("settingsSubtitle")}</p>
      </div>
      {error && <p className="notice" style={{ color: "var(--rose)" }}>{error}</p>}

      {isLoading && <LoadingState />}
      {!isLoading && loadError && <ErrorState message={loadError} />}
      {!isLoading && !loadError && categories.length === 0 && <p className="emptyState">{t("noSettingsYet")}</p>}
      {!isLoading && !loadError && categories.map(([category, items]) => (
        <div className="modulePanel" key={category} style={{ marginBottom: 16 }}>
          <h3 className="settingsCategory">{t(`settingsCategory_${category}`, { defaultValue: category })}</h3>
          <div className="settingsList">
            {items.map((item) => (
              <label className="settingsRow" key={item.key}>
                <span className="settingsLabel">{item.label}</span>
                {item.type === "file" ? (
                  <div className="settingFileControl">
                    {draftValue(item) && <span className="notice">{t("fileUploadedLabel")}</span>}
                    <label className={`secondaryAction${canManage ? "" : " disabled"}`}>
                      <Upload size={16} /> {t("chooseLogoBtn")}
                      <input
                        className="visuallyHidden"
                        type="file"
                        accept="image/jpeg,image/png,image/webp,image/gif"
                        disabled={!canManage}
                        onChange={(event) => {
                          const file = event.target.files?.[0];
                          if (file) void uploadFile(item, file);
                          event.target.value = "";
                        }}
                      />
                    </label>
                  </div>
                ) : item.type === "bool" ? (
                  <Select
                    disabled={!canManage}
                    value={draftValue(item)}
                    onChange={(e) => {
                      setDrafts({ ...drafts, [item.key]: e.target.value });
                    }}
                    onBlur={() => void save(item)}
                  >
                    <option value="true">{t("yesLabel")}</option>
                    <option value="false">{t("noLabel")}</option>
                  </Select>
                ) : (
                  <Input
                    disabled={!canManage}
                    type={item.type === "int" ? "number" : "text"}
                    value={draftValue(item)}
                    onChange={(e) => setDrafts({ ...drafts, [item.key]: e.target.value })}
                    onBlur={() => void save(item)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                    }}
                  />
                )}
                {savedKey === item.key && <Check size={16} className="savedTick" />}
              </label>
            ))}
          </div>
        </div>
      ))}
    </section>
  );
}
