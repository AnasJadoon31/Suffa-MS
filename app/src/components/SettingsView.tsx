import { Button } from "./ui/Button";
import { useEffect, useMemo, useState } from "react";
import { Check, Copy, MessageCircle, Pencil, RefreshCw, Settings as SettingsIcon, Upload, Wifi, WifiOff } from "lucide-react";
import { useTranslation } from "react-i18next";

import { filesApi, messagingApi, operationsApi, type TypedSetting, type WhatsAppConnectionStatus } from "../lib/endpoints";
import { useAuth } from "../lib/AuthContext";
import { Input, Select } from "./ui/Field";
import { ErrorState, LoadingState } from "./ui/AsyncState";
import { useSessionReadOnly } from "./SessionSwitcher";
import { Modal, FormModal } from "./ui/Modal";
import { PageSection, PageHeader } from "./ui/Layout";

export function SettingsView() {
  const { t } = useTranslation();
  const { hasPermission, refreshProfile } = useAuth();
  const readOnly = useSessionReadOnly();
  const canManage = !readOnly && hasPermission("settings.manage");
  const [settings, setSettings] = useState<TypedSetting[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [savedKey, setSavedKey] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [whatsAppStatus, setWhatsAppStatus] = useState<WhatsAppConnectionStatus | null>(null);
  const [whatsAppLoading, setWhatsAppLoading] = useState(false);
  const [pairingOpen, setPairingOpen] = useState(false);
  const [pairingPhone, setPairingPhone] = useState("");
  const [pairingCode, setPairingCode] = useState("");
  const [pairingError, setPairingError] = useState("");
  const [replacePairingPending, setReplacePairingPending] = useState(false);

  const loadWhatsAppStatus = async () => {
    if (!canManage) return;
    setWhatsAppLoading(true);
    try {
      setWhatsAppStatus(await messagingApi.whatsappConnection());
    } catch (err: any) {
      setPairingError(err.response?.data?.detail ?? t("whatsappStatusFailed"));
    } finally {
      setWhatsAppLoading(false);
    }
  };

  const load = async () => setSettings(await operationsApi.settingsCatalog());
  useEffect(() => {
    void (async () => {
      setIsLoading(true);
      try {
        await load();
        setLoadError("");
      } catch (err: any) {
        setLoadError(err.response?.data?.detail ?? t("failedLoadSettings"));
      } finally {
        setIsLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (canManage) void loadWhatsAppStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canManage]);

  useEffect(() => {
    if (!pairingOpen || !pairingCode || whatsAppStatus?.connected) return;
    const timer = window.setInterval(() => void loadWhatsAppStatus(), 3000);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pairingOpen, pairingCode, whatsAppStatus?.connected]);

  const categories = useMemo(() => {
    const grouped = new Map<string, TypedSetting[]>();
    for (const item of settings) {
      grouped.set(item.category, [...(grouped.get(item.category) ?? []), item]);
    }
    return [...grouped.entries()];
  }, [settings]);

  const save = async (item: TypedSetting) => {
    const value = drafts[item.key];
    if (value === undefined || value === item.value) return;
    setError("");
    setSavedKey("");
    try {
      await operationsApi.upsertSetting(item.key, value);
      setSavedKey(item.key);
      await load();
      if (item.key.startsWith("madrasa.")) await refreshProfile();
    } catch (err: any) {
      setError(err.response?.data?.detail ?? t("failedSaveSetting"));
    }
  };

  const draftValue = (item: TypedSetting) => drafts[item.key] ?? item.value;

  const uploadFile = async (item: TypedSetting, file: File) => {
    setError("");
    setSavedKey("");
    try {
      const contentType = file.type || "application/octet-stream";
      const { object_key, upload_url } = await filesApi.presignUpload({
        category: "settings",
        filename: file.name,
        content_type: contentType,
        size_bytes: file.size,
      });
      const upload = await fetch(upload_url, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": contentType },
      });
      if (!upload.ok) throw new Error(t("failedUploadSettingFile"));
      await operationsApi.upsertSetting(item.key, object_key);
      setDrafts((current) => ({ ...current, [item.key]: object_key }));
      setSavedKey(item.key);
      await load();
      await refreshProfile();
    } catch (err: any) {
      setError(err.response?.data?.detail ?? err.message ?? t("failedUploadSettingFile"));
    }
  };

  const generatePairingCode = async (replaceExisting = false) => {
    setPairingError("");
    setWhatsAppLoading(true);
    try {
      const response = await messagingApi.requestWhatsAppPairingCode(pairingPhone, replaceExisting);
      setPairingCode(response.pairing_code);
      setReplacePairingPending(false);
      setWhatsAppStatus({ instance_name: response.instance_name, state: response.state, connected: false });
    } catch (err: any) {
      if (err.response?.status === 428) {
        setReplacePairingPending(true);
      } else {
        setPairingError(err.response?.data?.detail ?? t("whatsappPairingCodeFailedError"));
      }
    } finally {
      setWhatsAppLoading(false);
    }
  };

  const requestPairingCode = (event: React.FormEvent) => {
    event.preventDefault();
    void generatePairingCode(false);
  };

  const whatsAppStateLabel = whatsAppStatus
    ? (whatsAppStatus.connected ? t("connectedLabel") : t("disconnectedLabel"))
    : (whatsAppLoading ? t("checkingStatusLabel") : t("statusUnavailableLabel"));

  return (
    <PageSection>
      <PageHeader title={t("settingsTitle")} icon={<SettingsIcon size={18} />} notice={t("settingsSubtitle")} />
      {error && <p className="notice" style={{ color: "var(--rose)" }}>{error}</p>}

      {canManage && (
        <PageSection className="whatsappConnectionCard">
          <div className="whatsappConnectionHeader">
            <div>
              <h3><MessageCircle size={18} /> {t("whatsappConnectionTitle")}</h3>
              <p className="notice">{t("whatsappConnectionDescription")}</p>
            </div>
            <span className={`whatsappConnectionState ${whatsAppStatus?.connected ? "connected" : "disconnected"}`}>
              {whatsAppStatus?.connected ? <Wifi size={15} /> : (whatsAppLoading ? <RefreshCw size={15} /> : <WifiOff size={15} />)}
              {whatsAppStateLabel}
            </span>
          </div>
          {pairingError && <p className="notice" style={{ color: "var(--rose)" }}>{pairingError}</p>}
          <div className="whatsappConnectionActions">
            <Button type="button" onClick={() => { setPairingOpen(true); setPairingCode(""); setPairingError(""); setReplacePairingPending(false); }} disabled={whatsAppLoading || !whatsAppStatus || whatsAppStatus.connected}>
              <MessageCircle size={15} /> {t("connectWhatsAppBtn")}
            </Button>
            <Button className="secondaryAction" type="button" onClick={() => void loadWhatsAppStatus()} disabled={whatsAppLoading}>
              <RefreshCw size={15} /> {t("refreshStatusBtn")}
            </Button>
          </div>
        </PageSection>
      )}

      {pairingOpen && (
        <Modal title={t("connectWhatsAppTitle")} onClose={() => { setPairingOpen(false); setPairingCode(""); }}>
          {!pairingCode ? (
            <form className="whatsappPairingForm" onSubmit={requestPairingCode}>
              <p className="notice">{t("whatsappPhoneHelp")}</p>
              <label>{t("whatsappPhoneLabel")}<Input autoFocus required inputMode="tel" placeholder={t("whatsappPhonePlaceholder")} value={pairingPhone} onChange={(event) => setPairingPhone(event.target.value)} /></label>
              {pairingError && <p className="notice" style={{ color: "var(--rose)" }}>{pairingError}</p>}
              {replacePairingPending ? (
                <div className="whatsappPairingWarning" role="alert">
                  <p>{t("whatsappReplacePairingWarning")}</p>
                  <div className="whatsappConnectionActions">
                    <Button type="button" onClick={() => void generatePairingCode(true)} disabled={whatsAppLoading}>{t("replacePairingBtn")}</Button>
                    <Button className="secondaryAction" type="button" onClick={() => setReplacePairingPending(false)}>{t("cancelBtn")}</Button>
                  </div>
                </div>
              ) : (
                <Button type="submit" disabled={whatsAppLoading}>{whatsAppLoading ? t("generatingCodeLabel") : t("generatePairingCodeBtn")}</Button>
              )}
            </form>
          ) : whatsAppStatus?.connected ? (
            <div className="whatsappPairingSuccess"><Wifi size={30} /><h3>{t("whatsappConnectedTitle")}</h3><p className="notice">{t("whatsappConnectedDescription")}</p></div>
          ) : (
            <div className="whatsappPairingCode">
              <p>{t("whatsappPairingInstructions")}</p>
              <div className="pairingCodeValue" aria-label={t("whatsappPairingCodeLabel")}>{pairingCode}</div>
              <Button className="secondaryAction" type="button" onClick={() => void navigator.clipboard.writeText(pairingCode.replace("-", ""))}><Copy size={15} /> {t("copyCodeBtn")}</Button>
              <p className="notice">{t("whatsappWaitingForConnection")}</p>
            </div>
          )}
        </Modal>
      )}

      {isLoading && <LoadingState />}
      {!isLoading && loadError && <ErrorState message={loadError} />}
      {!isLoading && !loadError && categories.length === 0 && <p className="emptyState">{t("noSettingsYet")}</p>}
      {!isLoading && !loadError && categories.map(([category, items]) => (
        <PageSection key={category} style={{ marginBottom: 16 }}>
          <h3 className="settingsCategory">{t(`settingsCategory_${category}`, { defaultValue: category })}</h3>
          <div className="settingsList">
            {items.map((item) => (
              <div className="settingsRow" key={item.key}>
                <span className="settingsLabel">{item.label}</span>
                <span className="notice">{item.type === "file" ? (draftValue(item) ? t("fileUploadedLabel") : "—") : draftValue(item)}</span>
                {canManage && <Button className="tableAction" type="button" onClick={() => setEditingKey(item.key)}><Pencil size={14} /> {t("editBtn")}</Button>}
                {savedKey === item.key && <Check size={16} className="savedTick" />}
                {editingKey === item.key && (
                  item.type === "file" ? (
                    <Modal title={item.label} onClose={() => setEditingKey(null)}>
                      <label className="secondaryAction">
                        <Upload size={16} /> {t("chooseLogoBtn")}
                        <Input className="visuallyHidden" type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={(event) => {
                          const file = event.target.files?.[0];
                          if (file) void uploadFile(item, file).then(() => setEditingKey(null));
                          event.target.value = "";
                        }} />
                      </label>
                    </Modal>
                  ) : (
                    <FormModal
                      title={t("editBtn") + " " + item.label}
                      onClose={() => setEditingKey(null)}
                      submitLabel={t("saveBtn")}
                      onSubmit={(event: React.FormEvent) => { event.preventDefault(); void save(item).then(() => setEditingKey(null)); }}
                    >
                      {item.type === "bool" ? <Select value={draftValue(item)} onChange={(event) => setDrafts({ ...drafts, [item.key]: event.target.value })}><option value="true">{t("yesLabel")}</option><option value="false">{t("noLabel")}</option></Select> : <Input type={item.type === "int" ? "number" : "text"} value={draftValue(item)} onChange={(event) => setDrafts({ ...drafts, [item.key]: event.target.value })} />}
                    </FormModal>
                  )
                )}
              </div>
            ))}
          </div>
        </PageSection>
      ))}
    </PageSection>
  );
}
