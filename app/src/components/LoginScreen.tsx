import { Button } from "./ui/Button";
import React, { useState } from "react";
import Paper from "@mui/material/Paper";
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
              <Paper variant="outlined" className="stat-card">
                <h3>{t("loginOfflineTitle")}</h3>
                <span>{t("loginOfflineSub")}</span>
              </Paper>
              <Paper variant="outlined" className="stat-card">
                <h3>{t("loginTenantTitle")}</h3>
                <span>{t("loginTenantSub")}</span>
              </Paper>
            </div>
          </div>
        </div>

        {/* Right Side: Form */}
        <div className="login-form-container">
          <Paper variant="outlined" className="login-card glass">
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
                <label htmlFor="login-tenant">{t("madrasaIdLabel")}</label>
                <div className="input-with-icon">
                  <Building2 size={18} className="input-icon" />
                  <Input
                    id="login-tenant"
                    type="text"
                    value={tenant}
                    onChange={(e) => setTenant(e.target.value)}
                    placeholder="suffa"
                    required
                  />
                </div>
              </div>

              <div className="form-group">
                <label htmlFor="login-username">{t("usernameLabel")}</label>
                <div className="input-with-icon">
                  <span className="input-icon">@</span>
                  <Input
                    id="login-username"
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder={t("usernamePlaceholder")}
                    required
                  />
                </div>
              </div>

              <div className="form-group">
                <label htmlFor="login-password">{t("passwordLabel")}</label>
                <div className="input-with-icon">
                  <KeyRound size={18} className="input-icon" />
                  <Input
                    id="login-password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={t("passwordPlaceholder")}
                    required
                  />
                </div>
              </div>

              <Button type="submit" className="login-button" isLoading={isLoading}>
                {t("signInButton")}
              </Button>
            </form>
          </Paper>
        </div>
      </div>
    </div>
  );
}
