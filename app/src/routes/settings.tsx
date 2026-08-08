import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Building2, Check, Loader2, Power, QrCode, RefreshCw, Settings2, Smartphone } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/app/AppShell";
import {
  Card,
  EmptyState,
  SectionTitle,
  CustomDropdown,
  SkeletonList,
  TextInput,
} from "@/components/app/Primitives";
import { useAuth } from "@/lib/mms/auth";
import { opsApi, opsMutations, type TypedMadrasaSetting } from "@/lib/mms/more-endpoints";
import { apiErrorMessage } from "@/lib/mms/api";
import { useTranslation } from "react-i18next";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "Settings — Suffa MS" },
      { name: "description", content: "Madrasa configuration and app appearance preferences." },
      { property: "og:title", content: "Settings — Suffa MS" },
      {
        property: "og:description",
        content: "Madrasa configuration and app appearance preferences.",
      },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
    const { t } = useTranslation();
  const { madrasa, hasPermission } = useAuth();
  const canManage = hasPermission("settings.manage");

  const settings = useQuery({
    queryKey: ["settings-catalog"],
    queryFn: () => opsApi.listSettingsCatalog(),
    retry: false,
  });

  const grouped = useMemo(() => {
    const map = new Map<string, TypedMadrasaSetting[]>();
    for (const setting of settings.data ?? []) {
      const existing = map.get(setting.category) ?? [];
      existing.push(setting);
      map.set(setting.category, existing);
    }
    return Array.from(map.entries());
  }, [settings.data]);

  return (
    <AppShell title={t("Settings")} subtitle={madrasa?.name ?? "Suffa MS"}>
      <SectionTitle>{t("Madrasa")}</SectionTitle>
      <Card className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 p-3.5">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary">
          <Building2 className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <p className="truncate font-semibold">{madrasa?.name ?? "—"}</p>
          <p className="truncate text-xs text-muted-foreground">{madrasa?.slug ?? "—"}</p>
        </div>
        <span />
      </Card>

      <WhatsAppConnectionPanel canManage={canManage} />

      <SectionTitle>{t("Configuration")}</SectionTitle>
      {settings.isLoading ? <SkeletonList rows={4} /> : null}
      {!settings.isLoading && grouped.length === 0 ? (
        <EmptyState
          title={t("No settings available")}
          hint="Only administrators can change configuration."
        />
      ) : null}
      <div className="space-y-5">
        {grouped.map(([category, entries]) => (
          <div key={category}>
            <SectionTitle>{t(category)}</SectionTitle>
            <div className="space-y-2">
              {entries.map((setting) => (
                <SettingRow key={setting.key} setting={setting} canManage={canManage} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </AppShell>
  );
}

function qrImageSource(value: string) {
  return value.startsWith("data:image") ? value : `data:image/png;base64,${value}`;
}

function WhatsAppConnectionPanel({ canManage }: { canManage: boolean }) {
  const { t } = useTranslation();
  const client = useQueryClient();
  const [phoneNumber, setPhoneNumber] = useState("+92");
  const [replaceExisting, setReplaceExisting] = useState(false);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const [qrCode, setQrCode] = useState("");
  const [pairingCode, setPairingCode] = useState("");

  const connection = useQuery({
    queryKey: ["whatsapp-connection"],
    queryFn: () => opsApi.whatsappConnection(),
    enabled: canManage,
    retry: false,
  });

  const requestQr = useMutation({
    mutationFn: () => opsApi.whatsappQrCode(replaceExisting),
    onSuccess: (response) => {
      setQrCode(response.qr_code_base64);
      setPairingCode("");
      void client.invalidateQueries({ queryKey: ["whatsapp-connection"] });
    },
    onError: (error) => toast.error(apiErrorMessage(error, t("Could not request QR code"))),
  });

  const requestPairing = useMutation({
    mutationFn: () => opsApi.whatsappPairingCode(phoneNumber.trim(), replaceExisting),
    onSuccess: (response) => {
      setPairingCode(response.pairing_code);
      setQrCode("");
      void client.invalidateQueries({ queryKey: ["whatsapp-connection"] });
    },
    onError: (error) => toast.error(apiErrorMessage(error, t("Could not request pairing code"))),
  });

  const disconnect = useMutation({
    mutationFn: () => opsApi.whatsappDisconnect(),
    onSuccess: () => {
      setQrCode("");
      setPairingCode("");
      setConfirmDisconnect(false);
      toast.success(t("WhatsApp connection closed"));
      void client.invalidateQueries({ queryKey: ["whatsapp-connection"] });
    },
    onError: (error) => toast.error(apiErrorMessage(error, t("Could not close WhatsApp connection"))),
  });

  const state = connection.data?.state ?? "unknown";
  const connected = connection.data?.connected ?? false;
  const connectedNumber = connection.data?.connected_phone_number ?? connection.data?.connected_jid;

  return (
    <>
      <SectionTitle
        action={
          canManage ? (
            <button
              type="button"
              onClick={() => void connection.refetch()}
              disabled={connection.isFetching}
              className="grid h-9 w-9 place-items-center rounded-xl bg-muted text-muted-foreground disabled:opacity-50"
              aria-label={t("Refresh WhatsApp status")}
            >
              <RefreshCw className={connection.isFetching ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
            </button>
          ) : undefined
        }
      >
        {t("WhatsApp connection")}
      </SectionTitle>
      <Card className="space-y-4">
        <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary">
            <Smartphone className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <p className="truncate font-semibold">
              {connection.data?.instance_name || t("No instance configured")}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {t("Status")}: {t(state)}
              {connected ? ` · ${t("Connected")}` : ""}
            </p>
          </div>
        </div>

        {connected ? (
          <div className="rounded-xl bg-primary-soft px-3 py-2 text-sm text-primary">
            <span className="font-semibold">{t("Connected phone")}:</span>{" "}
            {connectedNumber ? connectedNumber : t("Connected phone not reported by Evolution")}
          </div>
        ) : null}

        {connection.isError ? (
          <p className="rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {apiErrorMessage(connection.error, t("WhatsApp is not configured yet"))}
          </p>
        ) : null}

        {canManage ? (
          <>
            {connected ? (
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={() => setConfirmDisconnect(true)}
                  disabled={disconnect.isPending}
                  aria-label={t("Close WhatsApp connection")}
                  className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl bg-destructive/10 px-4 py-2.5 font-display text-sm font-extrabold text-destructive disabled:opacity-50"
                >
                  {disconnect.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Power className="h-4 w-4" />
                  )}
                  {t("Close WhatsApp connection")}
                </button>
                <p className="text-xs text-muted-foreground">
                  {t("Close the current WhatsApp session before pairing a different phone.")}
                </p>
              </div>
            ) : (
              <>
                <label className="flex items-start gap-2 rounded-xl bg-muted px-3 py-2.5 text-sm">
                  <input
                    type="checkbox"
                    checked={replaceExisting}
                    onChange={(event) => setReplaceExisting(event.target.checked)}
                    className="mt-1 h-4 w-4 shrink-0"
                  />
                  <span className="min-w-0">
                    <span className="block font-semibold">{t("Replace stale pairing")}</span>
                    <span className="block text-xs text-muted-foreground">
                      {t("Use when Evolution keeps returning an old QR or pairing code.")}
                    </span>
                  </span>
                </label>

                <div className="grid gap-2 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => requestQr.mutate()}
                    disabled={requestQr.isPending}
                    aria-label={t("Show QR code")}
                    className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-primary-soft px-4 py-2.5 font-display text-sm font-extrabold text-primary disabled:opacity-50"
                  >
                    {requestQr.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <QrCode className="h-4 w-4" />}
                    {t("Show QR code")}
                  </button>
                  <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
                    <TextInput
                      value={phoneNumber}
                      onChange={(event) => setPhoneNumber(event.target.value)}
                      onFocus={() => {
                        if (!phoneNumber.trim()) {
                          setPhoneNumber("+92");
                        }
                      }}
                      placeholder={t("+923001234567")}
                      inputMode="tel"
                    />
                    <button
                      type="button"
                      onClick={() => requestPairing.mutate()}
                      disabled={requestPairing.isPending || phoneNumber.trim().length <= 3}
                      aria-label={t("Pair with phone number")}
                      className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-primary-soft px-3.5 py-2.5 font-display text-sm font-extrabold text-primary disabled:opacity-50"
                    >
                      {requestPairing.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Smartphone className="h-4 w-4" />
                      )}
                      <span className="hidden sm:inline">{t("Pair")}</span>
                    </button>
                  </div>
                </div>

                {qrCode ? (
                  <div className="rounded-2xl border border-border bg-card p-3 text-center">
                    <img
                      src={qrImageSource(qrCode)}
                      alt={t("WhatsApp QR code")}
                      className="mx-auto aspect-square w-full max-w-64 rounded-xl bg-white p-2"
                    />
                  </div>
                ) : null}

                {pairingCode ? (
                  <div className="rounded-2xl border border-border bg-muted p-4 text-center">
                    <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                      {t("Pairing code")}
                    </p>
                    <p className="mt-1 font-display text-3xl font-extrabold tracking-widest">
                      {pairingCode}
                    </p>
                  </div>
                ) : null}
              </>
            )}

            {confirmDisconnect ? (
              <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
                <div className="w-full max-w-sm space-y-3 rounded-3xl bg-card p-5">
                  <p className="font-display text-base font-extrabold">{t("Close WhatsApp connection?")}</p>
                  <p className="text-sm text-muted-foreground">
                    {t("This will disconnect the currently paired phone from Evolution.")}
                  </p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setConfirmDisconnect(false)}
                      className="flex-1 rounded-2xl bg-muted px-4 py-2.5 text-sm font-bold"
                    >
                      {t("Cancel")}
                    </button>
                    <button
                      type="button"
                      onClick={() => disconnect.mutate()}
                      disabled={disconnect.isPending}
                      className="flex-1 rounded-2xl bg-destructive px-4 py-2.5 text-sm font-bold text-destructive-foreground disabled:opacity-60"
                    >
                      {t("Close")}
                    </button>
                  </div>
                </div>
              </div>
            ) : null}
          </>
        ) : (
          <p className="text-sm text-muted-foreground">{t("Only administrators can pair WhatsApp.")}</p>
        )}
      </Card>
    </>
  );
}

function SettingRow({
  setting,
  canManage,
}: {
  setting: TypedMadrasaSetting;
  canManage: boolean;
}) {
    const { t } = useTranslation();
  const client = useQueryClient();
  const [draft, setDraft] = useState(setting.value);
  const dirty = draft !== setting.value;

  const save = useMutation({
    mutationFn: () => opsMutations.updateSetting(setting.key, draft),
    onSuccess: () => {
      toast.success(t("Setting saved"));
      void client.invalidateQueries({ queryKey: ["settings-catalog"] });
    },
  });

  return (
    <Card className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 p-3.5">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary">
        <Settings2 className="h-4 w-4" />
      </span>
      <label className="min-w-0">
        <span className="block truncate text-[0.7rem] font-bold uppercase tracking-wide text-muted-foreground">
          {t(setting.label)}
        </span>
        {setting.type === "bool" ? (
          <CustomDropdown
            disabled={!canManage}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
          >
            <option value="true">{t("Enabled")}</option>
            <option value="false">{t("Disabled")}</option>
          </CustomDropdown>
        ) : setting.type === "int" ? (
          <TextInput
            disabled={!canManage}
            type="number"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
          />
        ) : setting.type === "secret" ? (
          <TextInput
            disabled={!canManage}
            type="password"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder={t("Paste API key")}
          />
        ) : (
          <TextInput
            disabled={!canManage}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
          />
        )}
      </label>
      {canManage ? (
        <button
          aria-label="Save setting"
          disabled={!dirty || save.isPending}
          onClick={() => save.mutate()}
          className="grid h-9 w-9 place-items-center rounded-xl bg-primary-soft text-primary disabled:opacity-40"
        >
          <Check className="h-4 w-4" />
        </button>
      ) : (
        <span />
      )}
    </Card>
  );
}
