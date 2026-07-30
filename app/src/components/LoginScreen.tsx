import React, { useState } from "react";
import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import useMediaQuery from "@mui/material/useMediaQuery";
import { useTheme } from "@mui/material/styles";
import { useTranslation } from "react-i18next";
import { styled } from "@mui/material/styles";
import Typography from "@mui/material/Typography";
import { LogIn, Building2, KeyRound } from "lucide-react";
import { useAuth } from "../lib/AuthContext";
import { api } from "../lib/api";
import { Input } from "./ui/Field";
import { Button } from "./ui/Button";

const LoginWrapper = styled(Box)(({ theme }) => ({
  minHeight: "100vh",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  backgroundColor: theme.palette.background.default,
  padding: theme.spacing(3),
  [theme.breakpoints.down("sm")]: {
    padding: 0,
    backgroundColor: theme.palette.background.paper,
  },
}));

const MobileWrapper = styled(Box)({
  width: "100%",
  height: "100vh",
  display: "flex",
  flexDirection: "column",
  padding: 24,
});

const LoginCard = styled(Paper)(({ theme }) => ({
  width: "100%",
  maxWidth: 420,
  padding: theme.spacing(4),
  borderRadius: 20,
  boxShadow: theme.shadows[2],
}));

const LogoBox = styled(Box)(({ theme }) => ({
  width: 64,
  height: 64,
  borderRadius: 12,
  backgroundColor: theme.palette.primary.main,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  margin: "0 auto 16px",
  color: theme.palette.primary.contrastText,
}));

const Title = styled("h1")({
  margin: 0,
  fontSize: "1.5rem",
});

const Tagline = styled("p")(({ theme }) => ({
  margin: "4px 0 0",
  color: theme.palette.text.secondary,
  fontSize: "0.875rem",
}));

const ErrorBox = styled(Box)(({ theme }) => ({
  padding: 12,
  borderRadius: 8,
  backgroundColor: theme.palette.error.light,
  color: theme.palette.error.dark,
  fontSize: "0.875rem",
}));

const FieldLabel = styled("label")({
  display: "block",
  marginBottom: 6,
  fontSize: "0.875rem",
  fontWeight: 500,
});

const ForgotLink = styled("a")(({ theme }) => ({
  color: theme.palette.primary.main,
  fontSize: "0.875rem",
  textDecoration: "none",
}));

const iconStyle = { color: "text.secondary" } as const;

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

  const formContent = (
    <>
      <Box sx={{ textAlign: "center", mb: 3 }}>
        <LogoBox>
          <LogIn size={28} />
        </LogoBox>
        <Title>MMS</Title>
        <Tagline>{t("loginTagline")}</Tagline>
      </Box>

      <form onSubmit={handleSubmit}>
        <Stack spacing={2.5}>
          {error && <ErrorBox>{error}</ErrorBox>}

          <Box>
            <FieldLabel htmlFor="login-tenant">
              {t("madrasaIdLabel")}
            </FieldLabel>
            <Input
              id="login-tenant"
              type="text"
              value={tenant}
              onChange={(e) => setTenant(e.target.value)}
              placeholder="suffa"
              required
              startAdornment={<Building2 size={18} style={iconStyle} />}
            />
          </Box>

          <Box>
            <FieldLabel htmlFor="login-username">
              {t("usernameLabel")}
            </FieldLabel>
            <Input
              id="login-username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder={t("usernamePlaceholder")}
              required
              startAdornment={<Box component="span" sx={{ color: "text.secondary", fontWeight: 600 }}>@</Box>}
            />
          </Box>

          <Box>
            <FieldLabel htmlFor="login-password">
              {t("passwordLabel")}
            </FieldLabel>
            <Input
              id="login-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={t("passwordPlaceholder")}
              required
              startAdornment={<KeyRound size={18} style={iconStyle} />}
            />
          </Box>

          <Button type="submit" isLoading={isLoading} sx={{ mt: 1 }}>
            {t("signInButton")}
          </Button>

          <Box sx={{ textAlign: "center", mt: 1 }}>
            <ForgotLink href="#">
              {t("forgotPasswordLink", "Forgot password?")}
            </ForgotLink>
          </Box>
        </Stack>
      </form>
    </>
  );

  if (isMobile) {
    return (
      <LoginWrapper>
        <MobileWrapper>
          {formContent}
        </MobileWrapper>
      </LoginWrapper>
    );
  }

  return (
    <LoginWrapper>
      <LoginCard variant="outlined">
        {formContent}
      </LoginCard>
    </LoginWrapper>
  );
}
