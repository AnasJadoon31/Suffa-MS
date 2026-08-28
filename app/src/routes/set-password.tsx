import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { KeyRound, Loader2, Eye, EyeOff } from "lucide-react";
import { useState, type FormEvent } from "react";

import { api, apiErrorMessage } from "@/lib/mms/api";
import { useTranslation } from "react-i18next";

export const Route = createFileRoute("/set-password")({
  validateSearch: (search: Record<string, unknown>) => ({
    token: typeof search["token"] === "string" ? search["token"] : "",
    username: typeof search["username"] === "string" ? search["username"] : "",
    slug: typeof search["slug"] === "string" ? search["slug"] : "",
  }),
  head: () => ({
    meta: [
      { title: "Set Password — Suffa MS" },
      { name: "description", content: "Create or reset your Suffa MS account password." },
    ],
  }),
  component: SetPasswordPage,
});

function SetPasswordPage() {
  const { t } = useTranslation();
  const { token, username, slug } = Route.useSearch();
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    if (!token) {
      setError("This setup link is missing its token.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    setSubmitting(true);
    try {
      await api.post("/api/v1/auth/set-password", { token, password });
      setDone(true);
      window.setTimeout(() => void navigate({ to: "/" }), 2000);
    } catch (err) {
      setError(apiErrorMessage(err, "This link is invalid or has expired."));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="gradient-emerald flex min-h-screen flex-col text-primary-foreground">
      <section className="pt-safe px-6 pb-8 pt-16">
        <div className="mx-auto max-w-lg">
          <span className="gradient-gold grid h-14 w-14 place-items-center rounded-2xl text-accent-foreground shadow-[var(--shadow-raised)]">
            <KeyRound className="h-6 w-6" />
          </span>
          <h1 className="mt-6 font-display text-3xl font-extrabold leading-tight">
            {t("Set your password")}</h1>
          <p className="mt-2 max-w-sm text-sm text-primary-foreground/75">
            {t("Create a secure password to finish setting up your Suffa MS account.")}</p>

          {username && slug && (
            <div className="mt-6 rounded-2xl bg-primary-foreground/10 p-4 backdrop-blur">
              <p className="text-sm font-medium">{t("Your login details:")}</p>
              <ul className="mt-2 text-sm opacity-90 space-y-1">
                <li><strong>{t("Madrasa (Tenant ID):")}</strong> {slug}</li>
                <li><strong>{t("Username:")}</strong> {username}</li>
              </ul>
              <p className="mt-3 text-xs font-medium text-emerald-200">{t("Please save these somewhere safe. You'll need them to sign in.")}</p>
            </div>
          )}
        </div>
      </section>

      <section className="flex-1 rounded-t-[2rem] bg-background px-6 pb-10 pt-8 text-foreground">
        <div className="mx-auto max-w-lg">
          {done ? (
            <div className="card-surface p-5 text-center">
              <p className="font-display text-lg font-extrabold">{t("Password saved")}</p>
              <p className="mt-1 text-sm text-muted-foreground">{t("Taking you back to sign in.")}</p>
            </div>
          ) : (
            <form onSubmit={onSubmit} className="space-y-4">
              <Field 
                label={t("New password")}
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
                  className="w-full bg-transparent text-base outline-none"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete="new-password"
                  required
                />
              </Field>
              <Field 
                label={t("Confirm password")}
                action={
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      setShowConfirm(!showConfirm);
                    }}
                    className="grid h-9 w-9 place-items-center rounded-xl text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                    aria-label={showConfirm ? t("Hide password") : t("Show password")}
                  >
                    {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                }
              >
                <input
                  type={showConfirm ? "text" : "password"}
                  className="w-full bg-transparent text-base outline-none"
                  value={confirm}
                  onChange={(event) => setConfirm(event.target.value)}
                  autoComplete="new-password"
                  required
                />
              </Field>

              {error ? (
                <p className="rounded-xl bg-destructive/10 px-3 py-2.5 text-sm font-medium text-destructive">
                  {error}
                </p>
              ) : null}

              <button
                type="submit"
                disabled={submitting}
                className="gradient-emerald flex w-full items-center justify-center gap-2 rounded-2xl py-4 font-display text-base font-extrabold text-primary-foreground shadow-[var(--shadow-raised)] transition-transform active:scale-[0.98] disabled:opacity-60"
              >
                {submitting ? <Loader2 className="h-5 w-5 animate-spin" /> : null}
                {t("Save password")}
              </button>
            </form>
          )}
        </div>
      </section>
    </main>
  );
}

function Field({ label, action, children }: { label: string; action?: React.ReactNode; children: React.ReactNode }) {
  const { t } = useTranslation();
  return (
    <label className="card-surface flex items-center justify-between px-4 py-3">
      <div className="min-w-0 flex-1">
        <span className="block text-[0.68rem] font-bold uppercase tracking-widest text-muted-foreground">
          {label}
        </span>
        <span className="mt-1 block">{children}</span>
      </div>
      {action && <div className="-mr-2 ml-3">{action}</div>}
    </label>
  );
}
