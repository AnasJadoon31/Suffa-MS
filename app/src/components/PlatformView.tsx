import { useEffect, useState } from "react";
import { Building2, Plus, ToggleLeft } from "lucide-react";
import { useTranslation } from "react-i18next";

import { platformApi, type FeatureFlag, type PlatformMadrasa } from "../lib/endpoints";
import { useAuth } from "../lib/AuthContext";
import { Input } from "./ui/Field";
import { ErrorState, LoadingState } from "./ui/AsyncState";
import { Modal } from "./ui/Modal";

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
    <main className="appShell platformShell">
      <section className="workspace" style={{ padding: 24 }}>
        <header className="topbar">
          <div className="topbarContext">
            <h1><Building2 size={20} /> {t("platformTitle")}</h1>
            <p className="viewDescription">{t("platformSubtitle", { username: user?.username })}</p>
          </div>
          <button className="secondaryAction" type="button" onClick={logout}>{t("logout")}</button>
        </header>

        <div className="modulePanel" style={{ marginTop: 16 }}>
          <h3>{t("onboardHeading")}</h3>
          <button className="primaryAction" type="button" onClick={() => setShowOnboard(true)}><Plus size={16} /> {t("onboardBtn")}</button>
          {showOnboard && <Modal title={t("onboardHeading")} onClose={() => setShowOnboard(false)}><form
            className="inlineForm"
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
          >
            <label>{t("nameLabel")}<Input required minLength={2} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
            <label>{t("slugLabel")}<Input required pattern="[a-z0-9][a-z0-9-]*" value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} /></label>
            <label>{t("principalUsernameLabel")}<Input required minLength={3} value={form.principal_username} onChange={(e) => setForm({ ...form, principal_username: e.target.value })} /></label>
            <div className="formActions"><button className="primaryAction" type="submit"><Plus size={16} /> {t("onboardBtn")}</button></div>
          </form></Modal>}
          {error && <p className="notice" style={{ color: "var(--rose)" }}>{error}</p>}
          {notice && <p className="notice">{notice}</p>}
        </div>

        <div className="modulePanel" style={{ marginTop: 16 }}>
          <h3>{t("madarisHeading")}</h3>
          <div className="dataTable">
            <div className="dataRow header"><span>{t("nameLabel")}</span><span>{t("slugLabel")}</span><span>{t("createdCol")}</span><span></span></div>
            {isLoading && <LoadingState />}
            {!isLoading && loadError && <ErrorState message={loadError} />}
            {!isLoading && !loadError && madaris.length === 0 && <p className="emptyState">{t("noMadarisYet")}</p>}
            {!isLoading && !loadError && madaris.map((m) => (
              <div className="dataRow" key={m.id}>
                <span>{m.name}</span>
                <span>{m.slug}</span>
                <span>{new Date(m.created_at).toLocaleDateString()}</span>
                <span>
                  <button className="tableAction" type="button" onClick={() => void openMadrasa(m)}>
                    <ToggleLeft size={14} /> {t("featuresBtn")}
                  </button>
                </span>
              </div>
            ))}
          </div>
        </div>

        {selected && (
          <div className="modulePanel" style={{ marginTop: 16 }}>
            <h3>{t("featuresHeading", { name: selected.name })}</h3>
            <p className="notice">{t("featuresHint")}</p>
            <div className="delegateList">
              {features.map((flag) => (
                <label key={flag.key} className="checkboxLabel">
                  <input type="checkbox" checked={flag.enabled} onChange={() => void toggleFeature(flag)} />
                  {flag.label} <small className="notice">({flag.key})</small>
                </label>
              ))}
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
