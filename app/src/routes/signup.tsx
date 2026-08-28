import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { UserPlus, Loader2, ArrowLeft, Building2, Phone, Mail, Globe } from "lucide-react";
import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";

import { apiErrorMessage, signupInitiate, signupVerify } from "@/lib/mms/api";
import { maskPhone } from "@/lib/masks";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";

export const Route = createFileRoute("/signup")({
  head: () => ({
    meta: [
      { title: "Create an Account — Suffa MS" },
      { name: "description", content: "Create a new madrasa account." },
    ],
  }),
  component: SignupPage,
});

function SignupPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();

  const toggleLanguage = () => {
    const currentLang = i18n.language || "en";
    const nextLang = currentLang.startsWith("ur") ? "en" : "ur";
    void i18n.changeLanguage(nextLang);
    localStorage.setItem("mms_lang", nextLang);
    const dir = nextLang === "ur" ? "rtl" : "ltr";
    document.documentElement.dir = dir;
    document.documentElement.lang = nextLang;
  };
  
  const [step, setStep] = useState<"initiate" | "verify">("initiate");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("+92");
  const [schoolName, setSchoolName] = useState("");
  const [withDemoData, setWithDemoData] = useState(false);
  const [otp, setOtp] = useState("");
  
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const onInitiate = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      await signupInitiate({ email, phone, school_name: schoolName, with_demo_data: withDemoData });
      setStep("verify");
    } catch (err) {
      setError(apiErrorMessage(err, "Failed to initiate signup."));
    } finally {
      setSubmitting(false);
    }
  };

  const onVerify = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    if (otp.length !== 6) {
      setError("Please enter the 6-digit OTP.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await signupVerify({ email, otp });
      window.setTimeout(() => void navigate({ to: res.set_password_url }), 500);
    } catch (err) {
      setError(apiErrorMessage(err, "Invalid OTP."));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="gradient-emerald flex min-h-screen flex-col text-primary-foreground">
      <div className="pt-safe px-6 pb-10 pt-16">
        <div className="mx-auto max-w-lg">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button 
                onClick={() => step === "verify" ? setStep("initiate") : navigate({ to: "/" })}
                className="grid h-10 w-10 place-items-center rounded-full bg-primary-foreground/15 backdrop-blur transition-all active:scale-95 shrink-0"
                aria-label={t("Go back")}
              >
                <ArrowLeft className="h-5 w-5" />
              </button>
              <span className="gradient-gold grid h-14 w-14 place-items-center rounded-2xl text-accent-foreground shadow-[var(--shadow-raised)] shrink-0">
                <UserPlus className="h-6 w-6" />
              </span>
            </div>
            <button
              type="button"
              onClick={toggleLanguage}
              className="flex items-center gap-1.5 rounded-full bg-primary-foreground/15 px-3.5 py-1.5 text-xs font-bold tracking-wide backdrop-blur transition-all active:scale-95 shrink-0"
            >
              <Globe className="h-4 w-4" />
              <span suppressHydrationWarning>
                {i18n.language?.startsWith("ur") ? "English" : "اردو"}
              </span>
            </button>
          </div>
          <h1 className="mt-6 font-display text-3xl font-extrabold leading-tight">
            {step === "initiate" ? t("Create an account") : t("Verify email")}
          </h1>
          <p className="mt-2 max-w-sm text-sm text-primary-foreground/75">
            {step === "initiate" 
              ? t("Set up a new madrasa account in seconds.")
              : t("Enter the 6-digit code sent to your email.")}
          </p>
        </div>
      </div>

      <section className="flex-1 rounded-t-[2rem] bg-background px-6 pb-10 pt-8 text-foreground">
        <div className="mx-auto max-w-lg">
          {step === "initiate" ? (
            <form onSubmit={onInitiate} className="space-y-4">
              <Field icon={<Building2 className="h-4 w-4" />} label={t("School Name")}>
                <input
                  type="text"
                  className="w-full bg-transparent text-base outline-none placeholder:text-muted-foreground"
                  value={schoolName}
                  onChange={(event) => setSchoolName(event.target.value)}
                  placeholder={t("e.g. Suffa Madrasa")}
                  required
                />
              </Field>
              
              <Field icon={<Mail className="h-4 w-4" />} label={t("Email Address")}>
                <input
                  type="email"
                  className="w-full bg-transparent text-base outline-none placeholder:text-muted-foreground"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder={t("admin@madrasa.com")}
                  required
                />
              </Field>
              
              <Field icon={<Phone className="h-4 w-4" />} label={t("Phone Number")}>
                <input
                  type="tel"
                  className="w-full bg-transparent text-base outline-none placeholder:text-muted-foreground"
                  value={phone}
                  onChange={(event) => setPhone(maskPhone(event.target.value))}
                  placeholder={t("+923000000000")}
                  required
                />
              </Field>

              <label className="flex items-center gap-2 px-1 py-2 text-sm font-medium text-foreground cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={withDemoData}
                  onChange={(e) => setWithDemoData(e.target.checked)}
                  className="h-4 w-4 rounded-md border-muted-foreground/30 text-emerald-600 focus:ring-emerald-500"
                />
                {t("Include demo data for exploration")}
              </label>

              {error ? (
                <p className="rounded-xl bg-destructive/10 px-3 py-2.5 text-sm font-medium text-destructive">
                  {error}
                </p>
              ) : null}

              <button
                type="submit"
                disabled={submitting}
                className="gradient-emerald mt-2 flex w-full items-center justify-center gap-2 rounded-2xl py-4 font-display text-base font-extrabold text-primary-foreground shadow-[var(--shadow-raised)] transition-transform active:scale-[0.98] disabled:opacity-60"
              >
                {submitting ? <Loader2 className="h-5 w-5 animate-spin" /> : null}
                {t("Continue")}</button>
            </form>
          ) : (
            <form onSubmit={onVerify} className="space-y-6">
              <div className="flex justify-center py-4">
                <InputOTP maxLength={6} value={otp} onChange={setOtp} disabled={submitting}>
                  <InputOTPGroup>
                    <InputOTPSlot index={0} />
                    <InputOTPSlot index={1} />
                    <InputOTPSlot index={2} />
                    <InputOTPSlot index={3} />
                    <InputOTPSlot index={4} />
                    <InputOTPSlot index={5} />
                  </InputOTPGroup>
                </InputOTP>
              </div>

              {error ? (
                <p className="rounded-xl bg-destructive/10 px-3 py-2.5 text-sm font-medium text-destructive">
                  {error}
                </p>
              ) : null}

              <button
                type="submit"
                disabled={submitting || otp.length < 6}
                className="gradient-emerald flex w-full items-center justify-center gap-2 rounded-2xl py-4 font-display text-base font-extrabold text-primary-foreground shadow-[var(--shadow-raised)] transition-transform active:scale-[0.98] disabled:opacity-60"
              >
                {submitting ? <Loader2 className="h-5 w-5 animate-spin" /> : null}
                {t("Verify & Create")}</button>
            </form>
          )}
        </div>
      </section>
    </main>
  );
}

function Field({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
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
    </label>
  );
}
