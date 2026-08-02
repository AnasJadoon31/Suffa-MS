import { Download, WifiOff, X } from "lucide-react";
import { useEffect, useState } from "react";

import { registerServiceWorker } from "@/lib/mms/pwa";
import { useTranslation } from "react-i18next";

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

export function PwaLayer() {
    const { t } = useTranslation();
  const [offline, setOffline] = useState(false);
  const [installEvent, setInstallEvent] = useState<InstallPromptEvent | null>(null);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    setOffline(!window.navigator.onLine);
    const goOnline = () => setOffline(false);
    const goOffline = () => setOffline(true);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);

    const onInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallEvent(event as InstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", onInstallPrompt);

    registerServiceWorker();

    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
      window.removeEventListener("beforeinstallprompt", onInstallPrompt);
    };
  }, []);

  return (
    <>
      {offline ? (
        <div className="fixed inset-x-0 top-0 z-[70] flex items-center justify-center gap-2 bg-foreground/90 px-4 py-2 text-xs font-bold uppercase tracking-wide text-background">
          <WifiOff className="h-3.5 w-3.5" />
          {t("Offline — showing saved data")}</div>
      ) : null}

      {installEvent && !hidden ? (
        <div className="mb-safe-nav fixed inset-x-3 bottom-20 z-[70] flex items-center gap-3 rounded-2xl border border-border bg-card p-3 shadow-[var(--shadow-raised)] lg:bottom-6 lg:left-auto lg:right-6 lg:w-80">
          <div className="min-w-0 flex-1">
            <p className="font-display text-sm font-extrabold">{t("Install Suffa MS")}</p>
            <p className="truncate text-xs text-muted-foreground">
              {t("Add to your home screen for offline access.")}</p>
          </div>
          <button
            onClick={async () => {
              await installEvent.prompt();
              await installEvent.userChoice;
              setInstallEvent(null);
            }}
            className="gradient-emerald inline-flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-2 font-display text-xs font-extrabold uppercase tracking-wide text-primary-foreground"
          >
            <Download className="h-3.5 w-3.5" />
            {t("Install")}</button>
          <button
            aria-label="Dismiss install prompt"
            onClick={() => setHidden(true)}
            className="shrink-0 text-muted-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : null}
    </>
  );
}
