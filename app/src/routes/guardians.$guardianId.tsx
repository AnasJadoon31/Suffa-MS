import { useQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";

import { AppShell } from "@/components/app/AppShell";
import { EmptyState, SkeletonList } from "@/components/app/Primitives";
import { GuardianDetailSheet } from "@/components/app/people/PersonDetail";
import { peopleMutations } from "@/lib/mms/more-endpoints";

export const Route = createFileRoute("/guardians/$guardianId")({
  component: GuardianProfilePage,
});

function GuardianProfilePage() {
  const { guardianId } = Route.useParams();
  const navigate = useNavigate();
  const guardian = useQuery({ queryKey: ["guardian-detail", guardianId], queryFn: () => peopleMutations.guardianDetail(guardianId) });

  return <AppShell title="Guardian profile" subtitle="Guardian record">
    {guardian.isLoading ? <SkeletonList rows={6} /> : null}
    {guardian.isError || !guardian.data ? <EmptyState title="Guardian not found" /> : null}
    {guardian.data ? <GuardianDetailSheet guardian={guardian.data} open page onOpenChange={() => navigate({ to: "/people", search: { tab: "guardians" as const, section_id: undefined as string | undefined } })} /> : null}
  </AppShell>;
}
