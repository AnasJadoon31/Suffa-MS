import { KeyRound, User as UserIcon } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { useAuth } from "../lib/AuthContext";
import { authApi } from "../lib/endpoints";
import { RoleBadge } from "./Sidebar";
import { Input, Select } from "./ui/Field";
import { Modal } from "./ui/Modal";

/** Personal settings — shared by teacher and student portals (missing entirely
 * before this). Reuses PATCH /auth/me (preferred language) and
 * POST /auth/change-password; no new backend beyond what already exists. */
export function ProfileView() {
  const { t, i18n } = useTranslation();
  const { user, updateProfile } = useAuth();
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
      <section className="modulePanel">
        <div className="moduleHeader">
          <h2><UserIcon size={18} /> {t("myProfile")}</h2>
          <p className="notice">{t("descProfile")}</p>
        </div>
        <div className="dataTable">
          <div className="dataRow">
            <span>{t("usernameLabel")}</span>
            <span>{user.username}</span>
          </div>
          <div className="dataRow">
            <span>{t("roleLabel")}</span>
            <span><RoleBadge role={user.role} /></span>
          </div>
        </div>
        <button className="primaryAction" type="button" onClick={() => setProfileModal("language")}>{t("preferredLanguageLabel")}</button>
        {profileModal === "language" && <Modal title={t("preferredLanguageLabel")} onClose={() => setProfileModal(null)}><form
          className="inlineForm"
          style={{ marginTop: 16 }}
          onSubmit={(e) => e.preventDefault()}
        >
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
        </form></Modal>}
        {languageNotice && <p className="notice">{languageNotice}</p>}
        {languageError && <p className="notice" style={{ color: "var(--rose)" }}>{languageError}</p>}
      </section>

      <section className="modulePanel">
        <div className="moduleHeader">
          <h2><KeyRound size={18} /> {t("changePasswordHeading")}</h2>
        </div>
        <button className="primaryAction" type="button" onClick={() => setProfileModal("password")}>{t("changePasswordBtn")}</button>
        {profileModal === "password" && <Modal title={t("changePasswordHeading")} onClose={() => setProfileModal(null)}><form className="inlineForm" onSubmit={(e) => void changePassword(e)}>
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
          <div className="formActions">
            <button className="primaryAction" type="submit" disabled={savingPassword}>
              {t("changePasswordBtn")}
            </button>
          </div>
        </form></Modal>}
        {passwordNotice && <p className="notice">{passwordNotice}</p>}
        {passwordError && <p className="notice" style={{ color: "var(--rose)" }}>{passwordError}</p>}
      </section>
    </>
  );
}
