import { Download, MessageCircle } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";

import { Card, EmptyState, SkeletonList, ManagedSheet } from "@/components/app/Primitives";
import { apiErrorMessage } from "@/lib/mms/api";
import { financeApi, financeMutations } from "@/lib/mms/more-endpoints";
import { useTranslation } from "react-i18next";

function money(amount: number, currency?: string) {
  return `${currency ?? "PKR"} ${Number(amount ?? 0).toLocaleString()}`;
}

export function DonorProfileSheet({ donorId, onClose }: { donorId: string; onClose: () => void }) {
    const { t } = useTranslation();
  const profile = useQuery({
    queryKey: ["donor-profile", donorId],
    queryFn: () => financeApi.donorProfile(donorId),
    retry: false,
  });

  const total = (profile.data?.donations ?? []).reduce((sum, d) => sum + Number(d.amount ?? 0), 0);

  async function sendReceipt(donationId: string) {
    try {
      const result = await financeMutations.sendDonationReceipt(donationId);
      toast.success(`${t("Receipt sent on WhatsApp")} +${result.normalised_number}`);
    } catch (error) {
      toast.error(apiErrorMessage(error, t("Failed to send receipt on WhatsApp")));
    }
  }

  return (
    <ManagedSheet
      open={true}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={profile.data?.name ?? "Donor"}
    >
      {profile.isLoading ? (
          <SkeletonList rows={3} />
        ) : profile.data ? (
          <div className="space-y-3">
            <Card className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {t("Contact")}</p>
                <p className="font-semibold">{profile.data.contact || "—"}</p>
              </div>
              <div className="text-right">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {t("Total donated")}</p>
                <p className="font-display font-extrabold">{money(total)}</p>
              </div>
            </Card>
            {profile.data.donations.length === 0 ? (
              <EmptyState title={t("No donations yet")} />
            ) : (
              <div className="space-y-2">
                {profile.data.donations.map((d) => (
                  <Card
                    key={d.id}
                    className="grid grid-cols-[minmax(0,1fr)_auto_auto_auto] items-center gap-2 p-3.5"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-semibold">{d.category_name ?? "Donation"}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {new Date(d.donation_date).toLocaleDateString()} · {d.note ?? "—"}
                      </p>
                    </div>
                    <span className="font-display text-sm font-extrabold">
                      {money(d.amount, d.currency)}
                    </span>
                    <button
                      aria-label="Download receipt"
                      onClick={() => void financeMutations.donationReceipt(d.id)}
                      className="grid h-9 w-9 place-items-center rounded-xl bg-primary-soft text-primary"
                    >
                      <Download className="h-4 w-4" />
                    </button>
                    <button
                      aria-label={t("Send receipt via WhatsApp")}
                      onClick={() => void sendReceipt(d.id)}
                      className="grid h-9 w-9 place-items-center rounded-xl bg-accent-soft text-accent-foreground"
                    >
                      <MessageCircle className="h-4 w-4" />
                    </button>
                  </Card>
                ))}
              </div>
            )}
          </div>
        ) : (
          <EmptyState title={t("Couldn't load donor")} />
        )}
    </ManagedSheet>
  );
}
