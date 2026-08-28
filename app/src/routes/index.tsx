import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Building2, Eye, EyeOff, Globe, KeyRound, Loader2, LogIn, UserRound } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";

import { apiErrorMessage, DEFAULT_TENANT } from "@/lib/mms/api";
import { useAuth } from "@/lib/mms/auth";
import { useTranslation } from "react-i18next";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Suffa MS — Madrasa Management Portal" },
      {
        name: "description",
        content:
          "Sign in to Suffa MS to manage attendance, students, staff and academics from your phone.",
      },
      { property: "og:title", content: "Suffa MS — Madrasa Management Portal" },
      {
        property: "og:description",
        content: "Mobile-first madrasa management: attendance, people, timetable and results.",
      },
    ],
  }),
  component: LoginPage,
});

function LoginPage() {
  const { t, i18n } = useTranslation();
  const { login, isAuthenticated, isLoading, user } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [tenant, setTenant] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);

  useEffect(() => {
    if (!isLoading && isAuthenticated) void navigate({ to: user?.role === "super_admin" ? "/platform" : "/dashboard" });
  }, [isAuthenticated, isLoading, navigate, user?.role]);

  const toggleLanguage = () => {
    const currentLang = i18n.language || "en";
    const nextLang = currentLang.startsWith("ur") ? "en" : "ur";
    void i18n.changeLanguage(nextLang);
    localStorage.setItem("mms_lang", nextLang);
    const dir = nextLang === "ur" ? "rtl" : "ltr";
    document.documentElement.dir = dir;
    document.documentElement.lang = nextLang;
  };

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      const loginTenant = tenant.trim() || DEFAULT_TENANT;
      await login(username.trim(), password, loginTenant, rememberMe);
    } catch (err) {
      setError(apiErrorMessage(err, "Invalid username or password"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="gradient-emerald flex min-h-screen flex-col text-primary-foreground">
      <div className="pt-safe px-6 pb-10 pt-16">
        <div className="mx-auto max-w-lg">
          <div className="flex items-center justify-between">
            <span className="gradient-gold grid h-14 w-14 place-items-center rounded-2xl text-accent-foreground shadow-[var(--shadow-raised)]">
              <LogIn className="h-6 w-6" />
            </span>
            <button
              type="button"
              onClick={toggleLanguage}
              className="flex items-center gap-1.5 rounded-full bg-primary-foreground/15 px-3.5 py-1.5 text-xs font-bold tracking-wide backdrop-blur transition-all active:scale-95"
            >
              <Globe className="h-4 w-4" />
              {i18n.language?.startsWith("ur") ? "English" : "اردو"}
            </button>
          </div>
          <h1 className="mt-6 font-display text-3xl font-extrabold leading-tight">{t("Suffa MS")}</h1>
          <p className="mt-2 max-w-xs text-sm text-primary-foreground/75">
            {t("Attendance, people and academics — designed for the phone in your pocket.")}</p>
        </div>
      </div>

      <div className="flex-1 rounded-t-[2rem] bg-background px-6 pb-10 pt-8 text-foreground">
        <form onSubmit={onSubmit} className="mx-auto max-w-lg space-y-4">
          <Field icon={<Building2 className="h-4 w-4" />} label={t("Madrasa")}>
            <input
              className="w-full bg-transparent text-base outline-none placeholder:text-muted-foreground"
              value={tenant}
              onChange={(e) => setTenant(e.target.value)}
              placeholder={t("Enter your tenant id")}
              autoCapitalize="none"
            />
          </Field>

          <Field icon={<UserRound className="h-4 w-4" />} label={t("Username")}>
            <input
              className="w-full bg-transparent text-base outline-none placeholder:text-muted-foreground"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder={t("Enter your username")}
              autoCapitalize="none"
              autoComplete="username"
              required
            />
          </Field>

          <Field 
            icon={<KeyRound className="h-4 w-4" />} 
            label={t("Password")}
            action={
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  setShowPassword(!showPassword);
                }}
                className="grid h-9 w-9 place-items-center rounded-xl text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                aria-label={showPassword ? t("Hide password") : t("Show password")}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            }
          >
            <input
              type={showPassword ? "text" : "password"}
              className="w-full bg-transparent text-base outline-none placeholder:text-muted-foreground"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={t("Enter your password")}
              autoComplete="current-password"
              required
            />
          </Field>

          <label className="flex items-center gap-2 px-1 text-sm font-medium text-foreground cursor-pointer select-none">
            <input
              type="checkbox"
              checked={rememberMe}
              onChange={(e) => setRememberMe(e.target.checked)}
              className="h-4 w-4 rounded-md border-muted-foreground/30 text-emerald-600 focus:ring-emerald-500"
            />
            {t("Remember me")}
          </label>

          {error ? (
            <p className="rounded-xl bg-destructive/10 px-3 py-2.5 text-sm font-medium text-destructive">
              {error}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={submitting}
            className="gradient-emerald flex h-13 w-full items-center justify-center gap-2 rounded-2xl py-4 font-display text-base font-extrabold text-primary-foreground shadow-[var(--shadow-raised)] transition-transform active:scale-[0.98] disabled:opacity-60"
          >
            {submitting ? <Loader2 className="h-5 w-5 animate-spin" /> : null}
            {t("Sign in")}</button>

          <p className="pt-2 text-center text-xs text-muted-foreground">
            {t("Trouble signing in? Contact your madrasa administrator.")}</p>

          <p className="pt-4 text-center text-sm font-medium">
            {t("Don't have an account?")} <a href="/signup" className="text-emerald-600 hover:underline">{t("Create one")}</a>
          </p>
        </form>
      </div>
    </div>
  );
}

function Field({
  icon,
  label,
  children,
  action,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
    const { t } = useTranslation();
  return (
    <label className="card-surface flex items-center gap-3 px-4 py-3">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[0.68rem] font-bold uppercase tracking-widest text-muted-foreground">
          {label}
        </span>
        {children}
      </span>
      {action && <div className="shrink-0">{action}</div>}
    </label>
  );
}
