import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";

export function NotFoundView({ homePath = "/dashboard" }: Readonly<{ homePath?: string }>) {
  const { t } = useTranslation();
  return (
    <section className="modulePanel notFoundView">
      <strong className="notFoundCode">404</strong>
      <h2>{t("pageNotFound")}</h2>
      <p className="notice">{t("pageNotFoundDescription")}</p>
      <Link className="primaryAction" to={homePath}>{t("backToDashboard")}</Link>
    </section>
  );
}
