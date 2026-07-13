import { useTranslation } from "react-i18next";

/**
 * §E cross-cutting polish: a shared loading/error/empty-state trio so views
 * stop inventing their own (an audit found only 2/28 views handled loading
 * state at all — AttendanceBoard and RolloverWizard already had a good
 * pattern; this codifies it for reuse). Reuses the existing `emptyState`/
 * `notice` CSS classes already used ad hoc across the app.
 */
export function LoadingState() {
  const { t } = useTranslation();
  return <p className="emptyState">{t("loadingLabel")}</p>;
}

export function ErrorState({ message }: Readonly<{ message: string }>) {
  if (!message) return null;
  return <p className="notice" style={{ color: "var(--rose)" }}>{message}</p>;
}

export function EmptyState({ label }: Readonly<{ label: string }>) {
  return <p className="emptyState">{label}</p>;
}
