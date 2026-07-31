import { Button } from "./ui/Button";
import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";
import Alert from "@mui/material/Alert";
import FormControl from "@mui/material/FormControl";
import FormControlLabel from "@mui/material/FormControlLabel";
import Radio from "@mui/material/Radio";
import RadioGroup from "@mui/material/RadioGroup";
import { KeyRound, Moon, Settings as SettingsIcon, Sun, User as UserIcon } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { useAuth } from "../lib/AuthContext";
import { useThemeMode } from "../lib/ThemeContext";
import { authApi } from "../lib/endpoints";
import { RoleBadge } from "./Sidebar";
import { Input, Select } from "./ui/Field";
import { Modal, FormModal } from "./ui/Modal";
import { PageSection, PageHeader } from "./ui/Layout";

/** Personal settings — shared by teacher and student portals (missing entirely
 * before this). Reuses PATCH /auth/me (preferred language) and
 * POST /auth/change-password; no new backend beyond what already exists. */
export function ProfileView() {
  const { t, i18n } = useTranslation();
  const { user, updateProfile } = useAuth();
  const { mode: themeMode, setDarkMode } = useThemeMode();
  const [language, setLanguage] = useState(user?.preferred_language ?? "en");
  const [languageNotice, setLanguageNotice] = useState("");
  const [languageError, setLanguageError] = useState("");
  const [savingLanguage, setSavingLanguage] = useState(false);

  const [passwordForm, setPasswordForm] = useState({ current_password: "", new_password: "", confirm_password: "" });
  const [passwordNotice, setPasswordNotice] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);
  const [profileModal, setProfileModal] = useState<"language" | "password" | null>(null);

  const saveLanguage = async (nextLanguage: string) => {
    setLanguage(nextLanguage);
    setLanguageNotice("");
    setLanguageError("");
    setSavingLanguage(true);
    try {
      await updateProfile({ preferred_language: nextLanguage });
      await i18n.changeLanguage(nextLanguage);
      document.documentElement.dir = nextLanguage === "ur" ? "rtl" : "ltr";
      document.documentElement.lang = nextLanguage;
      setLanguageNotice(t("profileLanguageSaved"));
      setProfileModal(null);
    } catch (err: any) {
      setLanguageError(err.response?.data?.detail ?? t("profileLanguageFailed"));
    } finally {
      setSavingLanguage(false);
    }
  };

  const changePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordNotice("");
    setPasswordError("");
    if (!passwordForm.current_password || !passwordForm.new_password) return;
    if (passwordForm.new_password !== passwordForm.confirm_password) {
      setPasswordError(t("profilePasswordMismatch"));
      return;
    }
    setSavingPassword(true);
    try {
      await authApi.changePassword({
        current_password: passwordForm.current_password,
        new_password: passwordForm.new_password,
      });
      setPasswordForm({ current_password: "", new_password: "", confirm_password: "" });
      setPasswordNotice(t("profilePasswordChanged"));
      setProfileModal(null);
    } catch (err: any) {
      setPasswordError(err.response?.data?.detail ?? t("profilePasswordFailed"));
    } finally {
      setSavingPassword(false);
    }
  };

  if (!user) return null;

  return (
    <>
      <PageSection>
        <PageHeader title={t("myProfile")} icon={<UserIcon size={18} />} notice={t("descProfile")} />
        <Box sx={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: 1, mb: 2 }}>
          <Typography sx={{ fontWeight: 700 }}>{t("usernameLabel")}</Typography>
          <Typography>{user.username}</Typography>
          <Typography sx={{ fontWeight: 700 }}>{t("roleLabel")}</Typography>
          <Typography><RoleBadge role={user.role} /></Typography>
        </Box>
        <Button type="button" onClick={() => setProfileModal("language")}>{t("preferredLanguageLabel")}</Button>
        {profileModal === "language" && <Modal title={t("preferredLanguageLabel")} onClose={() => setProfileModal(null)}>
          <Box sx={{ marginTop: 2, display: "flex", flexDirection: "column", gap: 2 }}>
            <label>
              {t("preferredLanguageLabel")}
              <Select
                value={language}
                disabled={savingLanguage}
                onChange={(e) => void saveLanguage(e.target.value)}
              >
                <option value="en">English</option>
                <option value="ur">اردو</option>
              </Select>
            </label>
          </Box>
        </Modal>}
        {languageNotice && <Alert severity="success" sx={{ mt: 1 }}>{languageNotice}</Alert>}
        {languageError && <Alert severity="error" sx={{ mt: 1 }}>{languageError}</Alert>}
      </PageSection>

      <PageSection>
        <PageHeader title={t("themeTitle", { defaultValue: "Theme" })} icon={<Sun size={18} />} />
        <Typography sx={{ color: "text.secondary", fontSize: "0.875rem", mb: 2 }}>
          {t("themeDescription", { defaultValue: "Choose your preferred theme. System will follow your OS setting." })}
        </Typography>
        <FormControl component="fieldset">
          <RadioGroup
            row
            aria-label={t("themeTitle", { defaultValue: "Theme" })}
            name="theme-mode"
            value={themeMode}
            onChange={(event) => setDarkMode(event.target.value as "light" | "dark" | "system")}
          >
            <FormControlLabel value="light" control={<Radio size="small" />} label={<Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}><Sun size={15} /> {t("themeLight", { defaultValue: "Light" })}</Box>} />
            <FormControlLabel value="dark" control={<Radio size="small" />} label={<Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}><Moon size={15} /> {t("themeDark", { defaultValue: "Dark" })}</Box>} />
            <FormControlLabel value="system" control={<Radio size="small" />} label={<Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}><SettingsIcon size={15} /> {t("themeSystem", { defaultValue: "System" })}</Box>} />
          </RadioGroup>
        </FormControl>
      </PageSection>

      <PageSection>
        <PageHeader title={t("changePasswordHeading")} icon={<KeyRound size={18} />} />
        <Button type="button" onClick={() => setProfileModal("password")}>{t("changePasswordBtn")}</Button>
        {profileModal === "password" && <FormModal
                title={t("changePasswordHeading")} onClose={() => setProfileModal(null)}
                onSubmit={(e) => void changePassword(e)}
                submitLabel={t("changePasswordBtn")}
                submitDisabled={savingPassword}
              >
                <label>
                          {t("currentPasswordLabel")}
                          <Input
                            required
                            type="password"
                            autoComplete="current-password"
                            value={passwordForm.current_password}
                            onChange={(e) => setPasswordForm({ ...passwordForm, current_password: e.target.value })}
                          />
                        </label>

              <label>
                          {t("newPasswordLabel")}
                          <Input
                            required
                            minLength={8}
                            type="password"
                            autoComplete="new-password"
                            value={passwordForm.new_password}
                            onChange={(e) => setPasswordForm({ ...passwordForm, new_password: e.target.value })}
                          />
                        </label>

              <label>
                          {t("confirmPasswordLabel")}
                          <Input
                            required
                            minLength={8}
                            type="password"
                            autoComplete="new-password"
                            value={passwordForm.confirm_password}
                            onChange={(e) => setPasswordForm({ ...passwordForm, confirm_password: e.target.value })}
                          />
                        </label>
              </FormModal>}
        {passwordNotice && <Alert severity="success" sx={{ mt: 1 }}>{passwordNotice}</Alert>}
        {passwordError && <Alert severity="error" sx={{ mt: 1 }}>{passwordError}</Alert>}
      </PageSection>
    </>
  );
}
