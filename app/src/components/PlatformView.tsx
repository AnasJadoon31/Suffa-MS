import { Button } from "./ui/Button";
import { useEffect, useState } from "react";
import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";
import Alert from "@mui/material/Alert";
import { Building2, Copy, Plus, ToggleLeft } from "lucide-react";
import { useTranslation } from "react-i18next";

import { platformApi, type FeatureFlag, type PlatformMadrasa } from "../lib/endpoints";
import { useAuth } from "../lib/AuthContext";
import { Input, CheckboxField } from "./ui/Field";
import { ErrorState, LoadingState } from "./ui/AsyncState";
import { DataTable } from "./ui/DataTable";
import { Modal, FormModal } from "./ui/Modal";
import { Workspace, Topbar, PageSection } from "./ui/Layout";

/** Super-admin console: onboard madaris + per-madrasa feature flags (§1). */
export function PlatformView() {
  const { t } = useTranslation();
  const { logout, user } = useAuth();
  const [madaris, setMadaris] = useState<PlatformMadrasa[]>([]);
  const [selected, setSelected] = useState<PlatformMadrasa | null>(null);
  const [features, setFeatures] = useState<FeatureFlag[]>([]);
  const [form, setForm] = useState({ name: "", slug: "", principal_username: "" });
  const [notice, setNotice] = useState("");
  const [principalSetupUrl, setPrincipalSetupUrl] = useState("");
  const [showOnboard, setShowOnboard] = useState(false);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const load = async () => setMadaris(await platformApi.listMadaris());
  useEffect(() => {
    void (async () => {
      setIsLoading(true);
      try {
        await load();
        setLoadError("");
      } catch (err: any) {
        setLoadError(err.response?.data?.detail ?? t("failedLoadMadaris"));
      } finally {
        setIsLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openMadrasa = async (madrasa: PlatformMadrasa) => {
    setSelected(madrasa);
    setFeatures(await platformApi.getFeatures(madrasa.id));
  };

  const toggleFeature = async (flag: FeatureFlag) => {
    if (!selected) return;
    setFeatures(await platformApi.setFeatures(selected.id, { [flag.key]: !flag.enabled }));
  };

  return (
    <Box sx={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>
      <Workspace sx={{ p: 3 }}>
        <Topbar>
          <Box sx={{ flex: 1 }}>
            <Typography variant="h5" sx={{ display: "flex", alignItems: "center", gap: 1, fontWeight: 700 }}>
              <Building2 size={20} /> {t("platformTitle")}
            </Typography>
            <Typography sx={{ color: "text.secondary", fontSize: "0.875rem" }}>
              {t("platformSubtitle", { username: user?.username })}
            </Typography>
          </Box>
          <Button type="button" onClick={logout}>{t("logout")}</Button>
        </Topbar>

        <PageSection sx={{ marginTop: 16 }}>
          <Typography variant="h6" sx={{ fontWeight: 600 }}>{t("onboardHeading")}</Typography>
          <Button type="button" onClick={() => setShowOnboard(true)}><Plus size={16} /> {t("onboardBtn")}</Button>
          {showOnboard && <FormModal
                    title={t("onboardHeading")} onClose={() => setShowOnboard(false)}
                    onSubmit={async (e) => {
                                e.preventDefault();
                                setError("");
                                setNotice("");
                                try {
                                  const created = await platformApi.createMadrasa(form);
                                  setNotice(t("onboardSuccess", { slug: created.slug }));
                                  setPrincipalSetupUrl(`${window.location.origin}${created.set_password_url}`);
                                  setForm({ name: "", slug: "", principal_username: "" });
                                  setShowOnboard(false);
                                  await load();
                                } catch (err: any) {
                                  setError(err.response?.data?.detail ?? t("onboardFailed"));
                                }
                              }}
                    submitLabel={t("onboardBtn")}
                    submitIcon={<Plus size={16} />}
                  >
                    <label>{t("nameLabel")}<Input required minLength={2} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>

                  <label>{t("slugLabel")}<Input required pattern="[a-z0-9][a-z0-9-]*" value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} /></label>

                  <label>{t("principalUsernameLabel")}<Input required minLength={3} value={form.principal_username} onChange={(e) => setForm({ ...form, principal_username: e.target.value })} /></label>
                  </FormModal>}
          {error && <Alert severity="error" sx={{ mt: 1 }}>{error}</Alert>}
          {notice && <Alert severity="success" sx={{ mt: 1 }}>{notice}</Alert>}
          {principalSetupUrl && (
            <Box sx={{ display: "flex", alignItems: "center", gap: 1, mt: 1 }} role="status" aria-label={t("credentialsReadyLabel")}>
              <Typography>{t("credentialsReadyLabel")}</Typography>
              <Button type="button" onClick={() => void navigator.clipboard.writeText(principalSetupUrl)}>
                <Copy size={15} /> {t("copyLinkBtn")}
              </Button>
            </Box>
          )}
        </PageSection>

        <PageSection sx={{ marginTop: 16 }}>
          <Typography variant="h6" sx={{ fontWeight: 600 }}>{t("madarisHeading")}</Typography>
          <DataTable<PlatformMadrasa>
            columns={[
              { header: t("nameLabel"), render: (m) => m.name },
              { header: t("slugLabel"), render: (m) => m.slug },
              { header: t("createdCol"), render: (m) => new Date(m.created_at).toLocaleDateString() },
              { header: t("actionsCol"), render: (m) => (
                <Button type="button" onClick={() => openMadrasa(m)}>
                  <ToggleLeft size={14} /> {t("featuresBtn")}
                </Button>
              )},
            ]}
            data={madaris}
            keyExtractor={(m) => m.id}
            isLoading={isLoading}
            error={loadError}
            emptyMessage={t("noMadarisYet")}
          />
        </PageSection>

        {selected && (
          <PageSection sx={{ marginTop: 16 }}>
            <Typography variant="h6" sx={{ fontWeight: 600 }}>{t("featuresHeading", { name: selected.name })}</Typography>
            <Typography sx={{ color: "text.secondary", fontSize: "0.875rem", mb: 1 }}>{t("featuresHint")}</Typography>
            <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
              {features.map((flag) => (
                <CheckboxField
                  key={flag.key}
                  checked={flag.enabled}
                  onChange={() => void toggleFeature(flag)}
                  label={<>{flag.label} <Typography component="span" sx={{ color: "text.secondary", fontSize: "0.75rem" }}>({flag.key})</Typography></>}
                />
              ))}
            </Box>
          </PageSection>
        )}
      </Workspace>
    </Box>
  );
}
