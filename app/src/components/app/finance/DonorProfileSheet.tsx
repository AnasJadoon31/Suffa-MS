import { Download, X } from "lucide-react";
import { useQuery } from "@tanstack/react-query";

import { Card, EmptyState, SkeletonList } from "@/components/app/Primitives";
import { financeApi, financeMutations } from "@/lib/mms/more-endpoints";

function money(amount: number, currency?: string) {
  return `${currency ?? "PKR"} ${Number(amount ?? 0).toLocaleString()}`;
}

export function DonorProfileSheet({ donorId, onClose }: { donorId: string; onClose: () => void }) {
  const profile = useQuery({
    queryKey: ["donor-profile", donorId],
    queryFn: () => financeApi.donorProfile(donorId),
    retry: false,
  });

  const total = (profile.data?.donations ?? []).reduce((sum, d) => sum + Number(d.amount ?? 0), 0);

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/40" onClick={onClose}>
      <div
        className="max-h-[88vh] overflow-y-auto rounded-t-3xl border-t border-border bg-card px-4 pb-8 pt-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-lg font-extrabold">{profile.data?.name ?? "Donor"}</h2>
          <button onClick={onClose} aria-label="Close" className="rounded-full bg-muted p-2">
            <X className="h-4 w-4" />
          </button>
        </div>
        {profile.isLoading ? (
          <SkeletonList rows={3} />
        ) : profile.data ? (
          <div className="space-y-3">
            <Card className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Contact
                </p>
                <p className="font-semibold">{profile.data.contact || "—"}</p>
              </div>
              <div className="text-right">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Total donated
                </p>
                <p className="font-display font-extrabold">{money(total)}</p>
              </div>
            </Card>
            {profile.data.donations.length === 0 ? (
              <EmptyState title="No donations yet" />
            ) : (
              <div className="space-y-2">
                {profile.data.donations.map((d) => (
                  <Card
                    key={d.id}
                    className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-3 p-3.5"
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
                  </Card>
                ))}
              </div>
            )}
          </div>
        ) : (
          <EmptyState title="Couldn't load donor" />
        )}
      </div>
    </div>
  );
}
