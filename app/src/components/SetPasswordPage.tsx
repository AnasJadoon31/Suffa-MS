import { Button } from "./ui/Button";
import Paper from "@mui/material/Paper";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import { useTranslation } from "react-i18next";
import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { styled } from "@mui/material/styles";
import { KeyRound } from "lucide-react";

import { api } from "../lib/api";
import { Input } from "./ui/Field";

const PageWrapper = styled("div")(({ theme }) => ({
  display: "flex",
  minHeight: "100vh",
  backgroundColor: theme.palette.background.default,
}));

const SplitLayout = styled("div")(({ theme }) => ({
  display: "flex",
  width: "100%",
  [theme.breakpoints.down("sm")]: {
    flexDirection: "column",
  },
}));

const HeroSide = styled("div")(({ theme }) => ({
  flex: 1,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  backgroundColor: theme.palette.primary.main,
  color: theme.palette.primary.contrastText,
  padding: theme.spacing(4),
  [theme.breakpoints.down("sm")]: {
    flex: "none",
    padding: theme.spacing(3),
  },
}));

const FormSide = styled("div")(({ theme }) => ({
  flex: 1,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: theme.spacing(4),
  [theme.breakpoints.down("sm")]: {
    padding: theme.spacing(3),
  },
}));

const LoginCard = styled(Paper)(({ theme }) => ({
  width: "100%",
  maxWidth: 420,
  padding: theme.spacing(4),
  borderRadius: 20,
  boxShadow: theme.shadows[2],
}));

const IconWrapper = styled("div")(({ theme }) => ({
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

const ErrorBox = styled("div")(({ theme }) => ({
  padding: 12,
  borderRadius: 8,
  backgroundColor: theme.palette.error.light,
  color: theme.palette.error.dark,
  fontSize: "0.875rem",
  marginBottom: 16,
}));

const FormGroup = styled("div")({
  marginBottom: 16,
});

const Label = styled("label")({
  display: "block",
  marginBottom: 6,
  fontSize: "0.875rem",
  fontWeight: 500,
});

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
    <PageWrapper>
      <SplitLayout>
        <HeroSide>
          <div>
            <h1>MMS</h1>
            <p>{t("setPasswordTagline")}</p>
          </div>
        </HeroSide>
        <FormSide>
          <LoginCard variant="outlined">
            <Box sx={{ textAlign: "center", mb: 3 }}>
              <IconWrapper><KeyRound size={28} /></IconWrapper>
              <Typography variant="h6" component="h2">{t("setPasswordHeading")}</Typography>
            </Box>
            {done ? (
              <Typography sx={{ textAlign: "center", color: "success.main" }}>
                {t("passwordSetNotice")}
              </Typography>
            ) : (
              <form onSubmit={onSubmit}>
                {error && <ErrorBox>{error}</ErrorBox>}
                <FormGroup>
                  <Label>{t("newPasswordLabel")}</Label>
                  <Input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} />
                </FormGroup>
                <FormGroup>
                  <Label>{t("confirmPasswordLabel")}</Label>
                  <Input type="password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} />
                </FormGroup>
                <Button type="submit" sx={{ width: "100%" }}>{t("setPasswordBtn")}</Button>
              </form>
            )}
          </LoginCard>
        </FormSide>
      </SplitLayout>
    </PageWrapper>
  );
}
