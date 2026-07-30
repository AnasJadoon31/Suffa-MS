import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import { styled } from "@mui/material/styles";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";

const NotFoundSection = styled("section")(({ theme }) => ({
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  textAlign: "center",
  padding: theme.spacing(8, 2),
  minHeight: "50vh",
}));

const ErrorCode = styled(Typography)(({ theme }) => ({
  fontSize: "4rem",
  fontWeight: 800,
  color: theme.palette.primary.main,
  lineHeight: 1,
  marginBottom: theme.spacing(1),
}));

const BackLink = styled(Link)(({ theme }) => ({
  display: "inline-flex",
  alignItems: "center",
  gap: theme.spacing(1),
  marginTop: theme.spacing(3),
  padding: theme.spacing(1.5, 3),
  borderRadius: 999,
  backgroundColor: theme.palette.primary.main,
  color: theme.palette.primary.contrastText,
  textDecoration: "none",
  fontWeight: 600,
  "&:hover": {
    backgroundColor: theme.palette.primary.dark,
  },
}));

export function NotFoundView({ homePath = "/dashboard" }: Readonly<{ homePath?: string }>) {
  const { t } = useTranslation();
  return (
    <NotFoundSection>
      <ErrorCode variant="h1">404</ErrorCode>
      <Typography variant="h5" component="h2" sx={{ fontWeight: 700, mb: 1 }}>
        {t("pageNotFound")}
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        {t("pageNotFoundDescription")}
      </Typography>
      <BackLink to={homePath}>{t("backToDashboard")}</BackLink>
    </NotFoundSection>
  );
}
