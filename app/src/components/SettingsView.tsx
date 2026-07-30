import { Button } from "./ui/Button";
import { useEffect, useMemo, useState } from "react";
import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";
import Alert from "@mui/material/Alert";
import Chip from "@mui/material/Chip";
import FormControl from "@mui/material/FormControl";
import FormControlLabel from "@mui/material/FormControlLabel";
import Radio from "@mui/material/Radio";
import RadioGroup from "@mui/material/RadioGroup";
import { Check, Copy, MessageCircle, Moon, Pencil, RefreshCw, Settings as SettingsIcon, Sun, Upload, Wifi, WifiOff } from "lucide-react";
import { useTranslation } from "react-i18next";

import { filesApi, messagingApi, operationsApi, type TypedSetting, type WhatsAppConnectionStatus } from "../lib/endpoints";
import { useAuth } from "../lib/AuthContext";
import { useThemeMode } from "../lib/ThemeContext";
import { Input, Select } from "./ui/Field";
import { PhoneInput } from "./ui/PhoneInput";
import { ErrorState, LoadingState } from "./ui/AsyncState";
import { useSessionReadOnly } from "./SessionSwitcher";
import { Modal, FormModal } from "./ui/Modal";
import { PageSection, PageHeader } from "./ui/Layout";
import { FormStack, FormField } from "./ui/FormLayout";

export function SettingsView() {
  const { t } = useTranslation();
  const { hasPermission, refreshProfile } = useAuth();
  const readOnly = useSessionReadOnly();
  const canManage = !readOnly && hasPermission("settings.manage");
  const { mode: themeMode, setDarkMode } = useThemeMode();
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
  const [pairingMethod, setPairingMethod] = useState<"phone" | "qr">("phone");
  const [pairingPhone, setPairingPhone] = useState("");
  const [pairingCode, setPairingCode] = useState("");
  const [qrCode, setQrCode] = useState("");
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

  const generateQrCode = async (replaceExisting = false) => {
    setPairingError("");
    setWhatsAppLoading(true);
    try {
      const response = await messagingApi.requestWhatsAppQrCode(replaceExisting);
      setQrCode(response.qr_code_base64);
      setPairingCode("");
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
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      <Paper variant="outlined" sx={{ border: 1, borderColor: "divider", borderRadius: 2, p: 2.5, mb: 2.5 }}>
        <Typography variant="h6" sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1.5 }}>
          <Sun size={18} /> {t("themeTitle", { defaultValue: "Theme" })}
        </Typography>
        <Typography sx={{ color: "text.secondary", fontSize: "0.875rem", mb: 2 }}>
          {t("themeDescription", { defaultValue: "Choose your preferred theme. System will follow your OS setting." })}
        </Typography>
        <FormControl component="fieldset">
          <RadioGroup
            row
            aria-label={t("themeTitle", { defaultValue: "Theme" })}
            name="theme-mode"
            value={themeMode}
            onChange={(event) => setDarkMode(event.target.value as "light" | "dark" | "system")}
          >
            <FormControlLabel value="light" control={<Radio size="small" />} label={<Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}><Sun size={15} /> {t("themeLight", { defaultValue: "Light" })}</Box>} />
            <FormControlLabel value="dark" control={<Radio size="small" />} label={<Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}><Moon size={15} /> {t("themeDark", { defaultValue: "Dark" })}</Box>} />
            <FormControlLabel value="system" control={<Radio size="small" />} label={<Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}><SettingsIcon size={15} /> {t("themeSystem", { defaultValue: "System" })}</Box>} />
          </RadioGroup>
        </FormControl>
      </Paper>

      {canManage && (
        <Paper variant="outlined" sx={{ border: 1, borderColor: "divider", borderRadius: 2, p: 2.5, mb: 2.5 }}>
          <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 2 }}>
            <Box>
              <Typography variant="h6" sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                <MessageCircle size={18} /> {t("whatsappConnectionTitle")}
              </Typography>
              <Typography sx={{ color: "text.secondary", fontSize: "0.875rem", mt: 0.5 }}>
                {t("whatsappConnectionDescription")}
              </Typography>
            </Box>
            <Chip
              icon={whatsAppStatus?.connected ? <Wifi size={15} /> : (whatsAppLoading ? <RefreshCw size={15} /> : <WifiOff size={15} />)}
              label={whatsAppStateLabel}
              color={whatsAppStatus?.connected ? "success" : "default"}
              size="small"
            />
          </Box>
          {pairingError && <Alert severity="error" sx={{ mt: 1 }}>{pairingError}</Alert>}
          <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", mt: 2 }}>
            <Button type="button" onClick={() => { setPairingOpen(true); setPairingMethod("phone"); setPairingCode(""); setQrCode(""); setPairingError(""); setReplacePairingPending(false); }} disabled={whatsAppLoading || !whatsAppStatus || whatsAppStatus.connected}>
              <MessageCircle size={15} /> {t("connectWhatsAppBtn")}
            </Button>
            <Button type="button" onClick={() => void loadWhatsAppStatus()} disabled={whatsAppLoading}>
              <RefreshCw size={15} /> {t("refreshStatusBtn")}
            </Button>
          </Box>
        </Paper>
      )}

      {pairingOpen && (
        <Modal title={t("connectWhatsAppTitle")} onClose={() => { setPairingOpen(false); setPairingCode(""); setQrCode(""); }}>
          {!pairingCode && !qrCode ? (
            <form onSubmit={pairingMethod === "phone" ? requestPairingCode : (event) => { event.preventDefault(); void generateQrCode(false); }}>
              <Box sx={{ display: "flex", gap: 1, mb: 2 }} role="tablist" aria-label={t("whatsappPairingMethodLabel")}>
                <Button type="button" role="tab" aria-selected={pairingMethod === "phone"} onClick={() => { setPairingMethod("phone"); setReplacePairingPending(false); setPairingError(""); }}>
                  {t("whatsappPhonePairingTab")}
                </Button>
                <Button type="button" role="tab" aria-selected={pairingMethod === "qr"} onClick={() => { setPairingMethod("qr"); setReplacePairingPending(false); setPairingError(""); }}>
                  {t("whatsappQrPairingTab")}
                </Button>
              </Box>
              <Typography sx={{ color: "text.secondary", fontSize: "0.875rem", mb: 1 }}>
                {pairingMethod === "phone" ? t("whatsappPhoneHelp") : t("whatsappQrHelp")}
              </Typography>
              {pairingMethod === "phone" ? (
                <PhoneInput
                  id="whatsapp-pairing-phone"
                  required
                  label={t("whatsappPhoneLabel")}
                  placeholder={t("whatsappPhonePlaceholder")}
                  value={pairingPhone}
                  onChange={setPairingPhone}
                />
              ) : null}
              {pairingError && <Alert severity="error" sx={{ mt: 1 }}>{pairingError}</Alert>}
              {replacePairingPending ? (
                <Alert severity="warning" sx={{ mt: 1 }}>
                  <Typography>{t("whatsappReplacePairingWarning")}</Typography>
                  <Box sx={{ display: "flex", gap: 1, mt: 1 }}>
                    <Button type="button" onClick={() => void (pairingMethod === "phone" ? generatePairingCode(true) : generateQrCode(true))} disabled={whatsAppLoading}>{t("replacePairingBtn")}</Button>
                    <Button type="button" onClick={() => setReplacePairingPending(false)}>{t("cancelBtn")}</Button>
                  </Box>
                </Alert>
              ) : (
                <Button type="submit" disabled={whatsAppLoading || (pairingMethod === "phone" && !pairingPhone)}>{whatsAppLoading ? t("generatingCodeLabel") : pairingMethod === "phone" ? t("generatePairingCodeBtn") : t("generateQrCodeBtn")}</Button>
              )}
            </form>
          ) : whatsAppStatus?.connected ? (
            <Box sx={{ textAlign: "center", py: 2 }}>
              <Wifi size={30} />
              <Typography variant="h6">{t("whatsappConnectedTitle")}</Typography>
              <Typography sx={{ color: "text.secondary", fontSize: "0.875rem" }}>{t("whatsappConnectedDescription")}</Typography>
            </Box>
          ) : qrCode ? (
            <Box sx={{ textAlign: "center" }}>
              <Typography>{t("whatsappQrInstructions")}</Typography>
              <Box component="img" sx={{ margin: "16px auto", display: "block" }} src={qrCode.startsWith("data:") ? qrCode : `data:image/png;base64,${qrCode}`} alt={t("whatsappQrAlt")} />
              <Typography sx={{ color: "text.secondary", fontSize: "0.875rem" }}>{t("whatsappWaitingForConnection")}</Typography>
            </Box>
          ) : (
            <Box sx={{ textAlign: "center" }}>
              <Typography>{t("whatsappPairingInstructions")}</Typography>
              <Box
                sx={{
                  fontSize: "1.5rem",
                  fontWeight: 700,
                  letterSpacing: "0.1em",
                  py: 2,
                  px: 3,
                  bgcolor: "action.hover",
                  borderRadius: 2,
                  display: "inline-block",
                  my: 1,
                }}
                aria-label={t("whatsappPairingCodeLabel")}
              >
                {pairingCode}
              </Box>
              <Button type="button" onClick={() => void navigator.clipboard.writeText(pairingCode.replace("-", ""))}><Copy size={15} /> {t("copyCodeBtn")}</Button>
              <Typography sx={{ color: "text.secondary", fontSize: "0.875rem", mt: 1 }}>{t("whatsappWaitingForConnection")}</Typography>
            </Box>
          )}
        </Modal>
      )}

      {isLoading && <LoadingState />}
      {!isLoading && loadError && <ErrorState message={loadError} />}
      {!isLoading && !loadError && categories.length === 0 && <Typography sx={{ color: "text.secondary", fontStyle: "italic" }}>{t("noSettingsYet")}</Typography>}
      {!isLoading && !loadError && categories.map(([category, items]) => (
        <PageSection key={category} sx={{ marginBottom: 16 }}>
          <Typography variant="h6" sx={{ mb: 1, fontWeight: 600 }}>{t(`settingsCategory_${category}`, { defaultValue: category })}</Typography>
          <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
            {items.map((item) => (
              <Box key={item.key} sx={{ display: "flex", alignItems: "center", gap: 2, flexWrap: "wrap", py: 1, borderBottom: 1, borderColor: "divider" }}>
                <Typography sx={{ fontWeight: 600, minWidth: 120 }}>{item.label}</Typography>
                <Typography sx={{ color: "text.secondary", flex: 1 }}>
                  {item.type === "file" ? (draftValue(item) ? t("fileUploadedLabel") : "—") : draftValue(item)}
                </Typography>
                {canManage && <Button type="button" onClick={() => setEditingKey(item.key)}><Pencil size={14} /> {t("editBtn")}</Button>}
                {savedKey === item.key && <Check size={16} />}
                {editingKey === item.key && (
                  item.type === "file" ? (
                    <Modal title={item.label} onClose={() => setEditingKey(null)}>
                      <label>
                        <Button type="button"><Upload size={16} /> {t("chooseLogoBtn")}</Button>
                        <Input type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={(event) => {
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
                      <FormStack>
                        <FormField label={item.label}>
                          {item.type === "bool" ? <Select value={draftValue(item)} onChange={(event) => setDrafts({ ...drafts, [item.key]: event.target.value })}><option value="true">{t("yesLabel")}</option><option value="false">{t("noLabel")}</option></Select> : <Input type={item.type === "int" ? "number" : "text"} value={draftValue(item)} onChange={(event) => setDrafts({ ...drafts, [item.key]: event.target.value })} />}
                        </FormField>
                      </FormStack>
                    </FormModal>
                  )
                )}
              </Box>
            ))}
          </Box>
        </PageSection>
      ))}
    </PageSection>
  );
}
