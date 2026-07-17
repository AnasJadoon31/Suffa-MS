import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { LogIn, Building2, KeyRound, Loader2 } from "lucide-react";
import { useAuth } from "../lib/AuthContext";
import { api } from "../lib/api";
import { Input } from "./ui/Field";


export function LoginScreen() {
  const { t } = useTranslation();
  const { login } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [tenant, setTenant] = useState("suffa");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError("");

    try {
      const response = await api.post("/api/v1/auth/token", {
        username,
        password,
      }, {
        headers: {
          "X-Madrasa": tenant
        }
      });
      
      const token = response.data.access_token;
      await login(token, tenant);
    } catch (err: any) {
      if (err.response?.status === 401) {
        setError(t("invalidCredentials"));
      } else {
        setError(t("serverUnavailable"));
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="login-container">
      <div className="login-split">
        {/* Left Side: Branding / Hero */}
        <div className="login-hero">
          <div className="hero-content">
            <h1>MMS</h1>
            <p>{t("loginTagline")}</p>
            <div className="hero-stats">
              <div className="stat-card">
                <h3>{t("loginOfflineTitle")}</h3>
                <span>{t("loginOfflineSub")}</span>
              </div>
              <div className="stat-card">
                <h3>{t("loginTenantTitle")}</h3>
                <span>{t("loginTenantSub")}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Right Side: Form */}
        <div className="login-form-container">
          <div className="login-card glass">
            <div className="login-header">
              <div className="login-icon-wrapper">
                <LogIn size={28} />
              </div>
              <h2>{t("welcomeBack")}</h2>
              <p>{t("signInSubtitle")}</p>
            </div>

            <form onSubmit={handleSubmit} className="login-form">
              {error && <div className="login-error slide-in">{error}</div>}

              <div className="form-group">
                <label>{t("madrasaIdLabel")}</label>
                <div className="input-with-icon">
                  <Building2 size={18} className="input-icon" />
                  <Input
                    type="text"
                    value={tenant}
                    onChange={(e) => setTenant(e.target.value)}
                    placeholder="suffa"
                    required
                  />
                </div>
              </div>

              <div className="form-group">
                <label>{t("usernameLabel")}</label>
                <div className="input-with-icon">
                  <span className="input-icon">@</span>
                  <Input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder={t("usernamePlaceholder")}
                    required
                  />
                </div>
              </div>

              <div className="form-group">
                <label>{t("passwordLabel")}</label>
                <div className="input-with-icon">
                  <KeyRound size={18} className="input-icon" />
                  <Input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={t("passwordPlaceholder")}
                    required
                  />
                </div>
              </div>

              <button type="submit" className="login-button" disabled={isLoading}>
                {isLoading ? (
                  <>
                    <Loader2 size={18} className="spin" />
                    {t("signingIn")}
                  </>
                ) : (
                  t("signInButton")
                )}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
