import { useEffect, useMemo, useState } from "react";
import { Check, Settings as SettingsIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

import { operationsApi, type TypedSetting } from "../lib/endpoints";
import { useAuth } from "../lib/AuthContext";
import { Input, Select } from "./ui/Field";

export function SettingsView() {
  const { t } = useTranslation();
  const { hasPermission } = useAuth();
  const canManage = hasPermission("settings.manage");
  const [settings, setSettings] = useState<TypedSetting[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [savedKey, setSavedKey] = useState("");
  const [error, setError] = useState("");

  const load = async () => setSettings(await operationsApi.settingsCatalog());
  useEffect(() => {
    void load();
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
    } catch (err: any) {
      setError(err.response?.data?.detail ?? t("failedSaveSetting"));
    }
  };

  const draftValue = (item: TypedSetting) => drafts[item.key] ?? item.value;

  return (
    <section className="modulePanel">
      <div className="moduleHeader">
        <h2><SettingsIcon size={18} /> {t("settingsTitle")}</h2>
        <p className="notice">{t("settingsSubtitle")}</p>
      </div>
      {error && <p className="notice" style={{ color: "var(--rose)" }}>{error}</p>}

      {categories.map(([category, items]) => (
        <div className="modulePanel" key={category} style={{ marginBottom: 16 }}>
          <h3 className="settingsCategory">{t(`settingsCategory_${category}`, { defaultValue: category })}</h3>
          <div className="settingsList">
            {items.map((item) => (
              <label className="settingsRow" key={item.key}>
                <span className="settingsLabel">{item.label}</span>
                {item.type === "bool" ? (
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
