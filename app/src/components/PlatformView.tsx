import { Button } from "./ui/Button";
import { useEffect, useState } from "react";
import { Building2, Plus, ToggleLeft } from "lucide-react";
import { useTranslation } from "react-i18next";

import { platformApi, type FeatureFlag, type PlatformMadrasa } from "../lib/endpoints";
import { useAuth } from "../lib/AuthContext";
import { Input, Checkbox } from "./ui/Field";
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
    <div className="platformRoot">
      <Workspace style={{ padding: 24 }}>
        <Topbar>
          <div className="topbarContext">
            <h1><Building2 size={20} /> {t("platformTitle")}</h1>
            <p className="viewDescription">{t("platformSubtitle", { username: user?.username })}</p>
          </div>
          <Button className="secondaryAction" type="button" onClick={logout}>{t("logout")}</Button>
        </Topbar>

        <PageSection style={{ marginTop: 16 }}>
          <h3>{t("onboardHeading")}</h3>
          <Button className="primaryAction" type="button" onClick={() => setShowOnboard(true)}><Plus size={16} /> {t("onboardBtn")}</Button>
          {showOnboard && <FormModal
                    title={t("onboardHeading")} onClose={() => setShowOnboard(false)}
                    onSubmit={async (e) => {
                                e.preventDefault();
                                setError("");
                                setNotice("");
                                try {
                                  const created = await platformApi.createMadrasa(form);
                                  setNotice(t("onboardSuccess", { slug: created.slug, url: created.set_password_url }));
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
          {error && <p className="notice" style={{ color: "var(--rose)" }}>{error}</p>}
          {notice && <p className="notice">{notice}</p>}
        </PageSection>

        <PageSection style={{ marginTop: 16 }}>
          <h3>{t("madarisHeading")}</h3>
          <DataTable<PlatformMadrasa>
            columns={[
              { header: t("nameLabel"), render: (m) => m.name },
              { header: t("slugLabel"), render: (m) => m.slug },
              { header: t("createdCol"), render: (m) => new Date(m.created_at).toLocaleDateString() },
              { header: t("actionsCol"), render: (m) => (
                <Button className="tableAction" type="button" onClick={() => openMadrasa(m)}>
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
          <PageSection style={{ marginTop: 16 }}>
            <h3>{t("featuresHeading", { name: selected.name })}</h3>
            <p className="notice">{t("featuresHint")}</p>
            <div className="delegateList">
              {features.map((flag) => (
                <label key={flag.key} className="checkboxLabel">
                  <Checkbox  checked={flag.enabled} onChange={() => void toggleFeature(flag)} />
                  {flag.label} <small className="notice">({flag.key})</small>
                </label>
              ))}
            </div>
          </PageSection>
        )}
      </Workspace>
    </div>
  );
}
