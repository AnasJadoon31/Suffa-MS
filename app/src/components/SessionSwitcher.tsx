import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { styled } from "@mui/material/styles";
import { Box } from "./ui/Mui";
import { academicsApi, type AcademicSession } from "../lib/endpoints";
import { useAuth } from "../lib/AuthContext";
import { Select } from "./ui/Field";

const ReadOnlyBanner = styled("div")(({ theme }) => ({
  padding: theme.spacing(1, 2),
  backgroundColor: theme.palette.warning.light,
  color: theme.palette.warning.dark,
  fontSize: "0.875rem",
  textAlign: "center",
  borderBottom: `1px solid ${theme.palette.divider}`,
}));

const StyledSelect = styled(Select)(({ theme }) => ({
  fontSize: "0.85rem",
  minHeight: 44,
  width: "auto",
}));

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
    <StyledSelect
      value={selectedId}
      onChange={handleChange}
      disabled={saving}
    >
      {sessions.map((s) => (
        <option key={s.id} value={s.id}>
          {s.name} {s.is_active ? t("sessionActiveSuffix") : ""}
        </option>
      ))}
    </StyledSelect>
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
    <ReadOnlyBanner role="status">
      {t("sessionViewOnlyBanner", { name: selected.name })}
    </ReadOnlyBanner>
  );
}
