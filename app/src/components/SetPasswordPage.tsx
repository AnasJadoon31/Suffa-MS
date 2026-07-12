import { useTranslation } from "react-i18next";
import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { KeyRound } from "lucide-react";

import { api } from "../lib/api";
import { Input } from "./ui/Field";


export function SetPasswordPage() {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get("token") ?? "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (password !== confirm) {
      setError("Passwords do not match");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }
    try {
      await api.post("/api/v1/auth/set-password", { token, password });
      setDone(true);
      setTimeout(() => navigate("/"), 1500);
    } catch (err: any) {
      setError(err.response?.data?.detail ?? "This link is invalid or has expired.");
    }
  };

  return (
    <div className="login-container">
      <div className="login-split">
        <div className="login-hero">
          <div className="hero-content">
            <h1>MMS</h1>
            <p>{t("setPasswordTagline")}</p>
          </div>
        </div>
        <div className="login-form-container">
          <div className="login-card glass">
            <div className="login-header">
              <div className="login-icon-wrapper"><KeyRound size={28} /></div>
              <h2>{t("setPasswordHeading")}</h2>
            </div>
            {done ? (
              <p className="notice">{t("passwordSetNotice")}</p>
            ) : (
              <form onSubmit={onSubmit} className="login-form">
                {error && <div className="login-error">{error}</div>}
                <div className="form-group">
                  <label>{t("newPasswordLabel")}</label>
                  <div className="input-with-icon">
                    <Input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} />
                  </div>
                </div>
                <div className="form-group">
                  <label>{t("confirmPasswordLabel")}</label>
                  <div className="input-with-icon">
                    <Input type="password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} />
                  </div>
                </div>
                <button type="submit" className="login-button">{t("setPasswordBtn")}</button>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
