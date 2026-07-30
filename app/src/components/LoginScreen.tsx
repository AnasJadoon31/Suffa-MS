import React, { useState } from "react";
import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import useMediaQuery from "@mui/material/useMediaQuery";
import { useTheme } from "@mui/material/styles";
import { useTranslation } from "react-i18next";
import { LogIn, Building2, KeyRound } from "lucide-react";
import { useAuth } from "../lib/AuthContext";
import { api } from "../lib/api";
import { Input } from "./ui/Field";
import { Button } from "./ui/Button";

export function LoginScreen() {
  const { t } = useTranslation();
  const { login } = useAuth();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
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
    <Box
      sx={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: isMobile ? "background.paper" : "background.default",
        padding: isMobile ? 0 : 3,
      }}
    >
      {isMobile ? (
        // Mobile: full-screen form
        <Box
          sx={{
            width: "100%",
            height: "100vh",
            display: "flex",
            flexDirection: "column",
            padding: 3,
          }}
        >
          <Box sx={{ marginBottom: 4, textAlign: "center" }}>
            <Box
              sx={{
                width: 64,
                height: 64,
                borderRadius: 3,
                backgroundColor: "primary.main",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                margin: "0 auto 16px",
                color: "primary.contrastText",
              }}
            >
              <LogIn size={28} />
            </Box>
            <h1 style={{ margin: 0, fontSize: "1.5rem" }}>MMS</h1>
            <p style={{ margin: "4px 0 0", color: "var(--muted, #5f6d67)", fontSize: "0.875rem" }}>
              {t("loginTagline")}
            </p>
          </Box>

          <form onSubmit={handleSubmit} style={{ flex: 1 }}>
            <Stack spacing={2.5} sx={{ maxWidth: 400, margin: "0 auto" }}>
              {error && (
                <Box
                  sx={{
                    padding: 1.5,
                    borderRadius: 2,
                    backgroundColor: "error.light",
                    color: "error.dark",
                    fontSize: "0.875rem",
                  }}
                >
                  {error}
                </Box>
              )}

              <Box>
                <label htmlFor="login-tenant" style={{ display: "block", marginBottom: 6, fontSize: "0.875rem", fontWeight: 500 }}>
                  {t("madrasaIdLabel")}
                </label>
                <Box sx={{ position: "relative" }}>
                  <Building2 size={18} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--muted, #5f6d67)" }} />
                  <Input
                    id="login-tenant"
                    type="text"
                    value={tenant}
                    onChange={(e) => setTenant(e.target.value)}
                    placeholder="suffa"
                    required
                  />
                </Box>
              </Box>

              <Box>
                <label htmlFor="login-username" style={{ display: "block", marginBottom: 6, fontSize: "0.875rem", fontWeight: 500 }}>
                  {t("usernameLabel")}
                </label>
                <Box sx={{ position: "relative" }}>
                  <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--muted, #5f6d67)", fontWeight: 600 }}>@</span>
                  <Input
                    id="login-username"
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder={t("usernamePlaceholder")}
                    required
                  />
                </Box>
              </Box>

              <Box>
                <label htmlFor="login-password" style={{ display: "block", marginBottom: 6, fontSize: "0.875rem", fontWeight: 500 }}>
                  {t("passwordLabel")}
                </label>
                <Box sx={{ position: "relative" }}>
                  <KeyRound size={18} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--muted, #5f6d67)" }} />
                  <Input
                    id="login-password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={t("passwordPlaceholder")}
                    required
                  />
                </Box>
              </Box>

              <Button type="submit" isLoading={isLoading} style={{ marginTop: 8 }}>
                {t("signInButton")}
              </Button>

              <Box sx={{ textAlign: "center", marginTop: 1 }}>
                <a href="#" style={{ color: "var(--accent, #0f766e)", fontSize: "0.875rem", textDecoration: "none" }}>
                  {t("forgotPasswordLink", "Forgot password?")}
                </a>
              </Box>
            </Stack>
          </form>
        </Box>
      ) : (
        // Desktop: centered card with pattern background
        <Paper
          variant="outlined"
          sx={{
            width: "100%",
            maxWidth: 420,
            padding: 4,
            borderRadius: 3,
            boxShadow: theme.shadows[2],
          }}
        >
          <Box sx={{ textAlign: "center", marginBottom: 3 }}>
            <Box
              sx={{
                width: 64,
                height: 64,
                borderRadius: 3,
                backgroundColor: "primary.main",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                margin: "0 auto 16px",
                color: "primary.contrastText",
              }}
            >
              <LogIn size={28} />
            </Box>
            <h1 style={{ margin: 0, fontSize: "1.5rem" }}>MMS</h1>
            <p style={{ margin: "4px 0 0", color: "var(--muted, #5f6d67)", fontSize: "0.875rem" }}>
              {t("loginTagline")}
            </p>
          </Box>

          <form onSubmit={handleSubmit}>
            <Stack spacing={2.5}>
              {error && (
                <Box
                  sx={{
                    padding: 1.5,
                    borderRadius: 2,
                    backgroundColor: "error.light",
                    color: "error.dark",
                    fontSize: "0.875rem",
                  }}
                >
                  {error}
                </Box>
              )}

              <Box>
                <label htmlFor="login-tenant" style={{ display: "block", marginBottom: 6, fontSize: "0.875rem", fontWeight: 500 }}>
                  {t("madrasaIdLabel")}
                </label>
                <Box sx={{ position: "relative" }}>
                  <Building2 size={18} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--muted, #5f6d67)" }} />
                  <Input
                    id="login-tenant"
                    type="text"
                    value={tenant}
                    onChange={(e) => setTenant(e.target.value)}
                    placeholder="suffa"
                    required
                  />
                </Box>
              </Box>

              <Box>
                <label htmlFor="login-username" style={{ display: "block", marginBottom: 6, fontSize: "0.875rem", fontWeight: 500 }}>
                  {t("usernameLabel")}
                </label>
                <Box sx={{ position: "relative" }}>
                  <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--muted, #5f6d67)", fontWeight: 600 }}>@</span>
                  <Input
                    id="login-username"
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder={t("usernamePlaceholder")}
                    required
                  />
                </Box>
              </Box>

              <Box>
                <label htmlFor="login-password" style={{ display: "block", marginBottom: 6, fontSize: "0.875rem", fontWeight: 500 }}>
                  {t("passwordLabel")}
                </label>
                <Box sx={{ position: "relative" }}>
                  <KeyRound size={18} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--muted, #5f6d67)" }} />
                  <Input
                    id="login-password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={t("passwordPlaceholder")}
                    required
                  />
                </Box>
              </Box>

              <Button type="submit" isLoading={isLoading} style={{ marginTop: 8 }}>
                {t("signInButton")}
              </Button>

              <Box sx={{ textAlign: "center", marginTop: 1 }}>
                <a href="#" style={{ color: "var(--accent, #0f766e)", fontSize: "0.875rem", textDecoration: "none" }}>
                  {t("forgotPasswordLink", "Forgot password?")}
                </a>
              </Box>
            </Stack>
          </form>
        </Paper>
      )}
    </Box>
  );
}
