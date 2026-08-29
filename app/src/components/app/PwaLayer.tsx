import { AlertTriangle, Download, RefreshCw, WifiOff, X } from "lucide-react";
import { useEffect, useState } from "react";

import { registerServiceWorker } from "@/lib/mms/pwa";
import { useOutboxSync } from "@/lib/mms/useOutboxSync";
import { useMutationSync } from "@/lib/mms/useMutationSync";
import { useTranslation } from "react-i18next";
import { RejectedEntriesSheet } from "./RejectedEntriesSheet";

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

declare global {
  interface Window {
    deferredPrompt: InstallPromptEvent | null;
  }
}

export function PwaLayer() {
  const { t } = useTranslation();
  const [offline, setOffline] = useState(false);
  const [installEvent, setInstallEvent] = useState<InstallPromptEvent | null>(null);
  const [hidden, setHidden] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const { pending, syncing, rejected, refresh: refreshOutbox } = useOutboxSync();
  const {
    pending: pendingMutations,
    syncing: syncingMutations,
    rejected: rejectedMutations,
    refresh: refreshMutations,
  } = useMutationSync();
  const rejectedTotal = rejected + rejectedMutations;
  const refreshRejected = () => {
    void refreshOutbox();
    void refreshMutations();
  };

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

    if (window.deferredPrompt) {
      setInstallEvent(window.deferredPrompt);
    }

    registerServiceWorker();

    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
      window.removeEventListener("beforeinstallprompt", onInstallPrompt);
    };
  }, []);

  return (
    <>
      <div className="fixed inset-x-0 top-0 z-[70] flex flex-col">
        {offline ? (
          <div className="flex items-center justify-center gap-2 bg-foreground/90 px-4 py-2 text-xs font-bold uppercase tracking-wide text-background">
            <WifiOff className="h-3.5 w-3.5" />
            {t("Offline — showing saved data")}
            {pendingMutations > 0
              ? ` · ${pendingMutations} action${pendingMutations > 1 ? "s" : ""} queued`
              : ""}
          </div>
        ) : pending > 0 || pendingMutations > 0 ? (
          <div className="flex items-center justify-center gap-2 bg-accent px-4 py-2 text-xs font-bold uppercase tracking-wide text-accent-foreground">
            <RefreshCw
              className={`h-3.5 w-3.5 ${syncing || syncingMutations ? "animate-spin" : ""}`}
            />
            {syncing || syncingMutations
              ? `Syncing ${pending + pendingMutations}...`
              : `${pending + pendingMutations} pending sync`}
          </div>
        ) : null}

        {rejectedTotal > 0 ? (
          <div className="flex items-center justify-center gap-2 bg-destructive px-4 py-2 text-xs font-bold uppercase tracking-wide text-destructive-foreground">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            {rejectedTotal} {t("couldn't be saved — needs review")}
            <button
              onClick={() => setReviewOpen(true)}
              className="ml-1 shrink-0 rounded-full bg-destructive-foreground/15 px-2 py-0.5 normal-case tracking-normal"
            >
              {t("Review")}
            </button>
          </div>
        ) : null}
      </div>

      <RejectedEntriesSheet
        open={reviewOpen}
        onOpenChange={setReviewOpen}
        onChanged={refreshRejected}
      />

      {installEvent && !hidden ? (
        <div className="mb-safe-nav fixed inset-x-3 bottom-20 z-[70] flex items-center gap-3 rounded-2xl border border-border bg-card p-3 shadow-[var(--shadow-raised)] lg:bottom-6 lg:left-auto lg:right-6 lg:w-80">
          <div className="min-w-0 flex-1">
            <p className="font-display text-sm font-extrabold">{t("Install Suffa MS")}</p>
            <p className="truncate text-xs text-muted-foreground">
              {t("Add to your home screen for offline access.")}
            </p>
          </div>
          <button
            onClick={async () => {
              await installEvent.prompt();
              await installEvent.userChoice;
              setInstallEvent(null);
              window.deferredPrompt = null;
            }}
            className="gradient-emerald inline-flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-2 font-display text-xs font-extrabold uppercase tracking-wide text-primary-foreground"
          >
            <Download className="h-3.5 w-3.5" />
            {t("Install")}
          </button>
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
