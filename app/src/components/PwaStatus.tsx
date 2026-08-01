import { Download, RefreshCw, Smartphone, WifiOff } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { styled } from "@mui/material/styles";

import { applyPwaUpdate, subscribePwaRegistration } from "../lib/pwaRegistration";
import { Button } from "./ui/Button";
import { useSnackbar } from "./ui/Snackbar";

type InstallPromptEvent = Event & {
  prompt?: () => Promise<void>;
  userChoice?: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

const PwaButton = styled(Button)(({ theme }) => ({
  borderRadius: 999,
  padding: theme.spacing(0.75, 1.5),
  fontSize: "0.75rem",
  minHeight: 44,
  gap: theme.spacing(0.5),
}));

function isStandaloneMode() {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(display-mode: standalone)").matches
    || Boolean((window.navigator as Navigator & { standalone?: boolean }).standalone);
}

export function PwaStatus() {
  const { t } = useTranslation();
  const snackbar = useSnackbar();
  const [online, setOnline] = useState(() => typeof navigator === "undefined" ? true : navigator.onLine);
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);
  const [standalone, setStandalone] = useState(isStandaloneMode);
  const [updateReady, setUpdateReady] = useState(false);
  const [offlineReady, setOfflineReady] = useState(false);

  useEffect(() => {
    const unsubscribe = subscribePwaRegistration((event) => {
      if (event === "needRefresh") {
        setUpdateReady(true);
        snackbar.info(t("pwaUpdateReady"), { duration: 8000 });
      }
      if (event === "offlineReady") {
        setOfflineReady(true);
        snackbar.success(t("pwaOfflineReady"), { duration: 6000 });
      }
      if (event === "error") snackbar.warning(t("pwaServiceWorkerError"), { duration: 6000 });
    });
    return unsubscribe;
  }, [snackbar, t]);

  useEffect(() => {
    const handleInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as InstallPromptEvent);
    };
    const handleInstalled = () => {
      setInstallPrompt(null);
      setStandalone(true);
      snackbar.success(t("pwaInstalled"), { duration: 6000 });
    };
    const handleOnline = () => setOnline(true);
    const handleOffline = () => setOnline(false);
    const displayMode = window.matchMedia("(display-mode: standalone)");
    const handleDisplayMode = () => setStandalone(isStandaloneMode());

    window.addEventListener("beforeinstallprompt", handleInstallPrompt);
    window.addEventListener("appinstalled", handleInstalled);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    displayMode.addEventListener("change", handleDisplayMode);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleInstallPrompt);
      window.removeEventListener("appinstalled", handleInstalled);
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      displayMode.removeEventListener("change", handleDisplayMode);
    };
  }, [snackbar, t]);

  const status = useMemo(() => {
    if (!online) return { key: "offline", icon: <WifiOff size={16} />, label: t("pwaOffline"), title: t("pwaOfflineHint"), action: undefined };
    if (updateReady) return { key: "update", icon: <RefreshCw size={16} />, label: t("pwaUpdate"), title: t("pwaUpdateHint"), action: () => void applyPwaUpdate() };
    if (installPrompt && !standalone) return { key: "install", icon: <Download size={16} />, label: t("pwaInstall"), title: t("pwaInstallHint"), action: () => void promptInstall() };
    if (standalone || offlineReady) return { key: "ready", icon: <Smartphone size={16} />, label: t("pwaReady"), title: t("pwaReadyHint"), action: undefined };
    return null;
  }, [installPrompt, offlineReady, online, standalone, t, updateReady]);

  async function promptInstall() {
    if (!installPrompt?.prompt) return;
    await installPrompt.prompt();
    const choice = await installPrompt.userChoice?.catch(() => undefined);
    if (choice?.outcome !== "dismissed") setInstallPrompt(null);
  }

  if (!status) return <span className="pwaStatusProbe" data-pwa-status="idle" hidden />;

  return (
    <PwaButton
      type="button"
      className={`pwaStatusProbe pwaStatusChip pwaStatusChip-${status.key}`}
      title={status.title}
      aria-label={status.title}
      onClick={status.action}
    >
      {status.icon}
      <span>{status.label}</span>
    </PwaButton>
  );
}
