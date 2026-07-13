import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { academicsApi, type AcademicSession } from "../lib/endpoints";
import { useAuth } from "../lib/AuthContext";
import { Select } from "./ui/Field";

export function useSessionReadOnly(): boolean {
  const { user } = useAuth();
  return Boolean(user?.selected_session_id);
}

export function SessionSwitcher() {
  const { t } = useTranslation();
  const { user, updateSelectedSession } = useAuth();
  const [sessions, setSessions] = useState<AcademicSession[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    academicsApi.listSessions().then(setSessions).catch(console.error);
  }, []);

  const activeSession = sessions.find((s) => s.is_active);
  const selectedId = user?.selected_session_id ?? activeSession?.id ?? "";

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newId = e.target.value;
    if (!newId || newId === selectedId) return;
    setSaving(true);
    // Selecting the active session clears the stored preference so the user
    // follows whatever session is active, even after the next rollover.
    void updateSelectedSession(newId === activeSession?.id ? null : newId)
      .then(() => {
        // Reload so every view refetches with the new session context.
        window.location.reload();
      })
      .catch((err) => {
        console.error(err);
        setSaving(false);
      });
  };

  if (sessions.length === 0) {
    return null;
  }

  return (
    <Select
      className="inputField"
      value={selectedId}
      onChange={handleChange}
      disabled={saving}
      style={{ padding: "4px 8px", fontSize: "0.85rem", minHeight: "32px", height: "auto", width: "auto", marginRight: "8px" }}
    >
      {sessions.map((s) => (
        <option key={s.id} value={s.id}>
          {s.name} {s.is_active ? t("sessionActiveSuffix") : ""}
        </option>
      ))}
    </Select>
  );
}

/** Banner shown when the user is viewing a non-active (archived/future)
 * academic session — the backend rejects writes in that state. */
export function SessionReadOnlyBanner() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [sessions, setSessions] = useState<AcademicSession[]>([]);

  useEffect(() => {
    if (!user?.selected_session_id) return;
    academicsApi.listSessions().then(setSessions).catch(console.error);
  }, [user?.selected_session_id]);

  if (!user?.selected_session_id) return null;
  const selected = sessions.find((s) => s.id === user.selected_session_id);
  if (!selected || selected.is_active) return null;

  return (
    <div className="sessionReadOnlyBanner" role="status">
      {t("sessionViewOnlyBanner", { name: selected.name })}
    </div>
  );
}
