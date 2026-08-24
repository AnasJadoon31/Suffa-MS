import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { BellRing } from "lucide-react";
import { toast } from "sonner";

import { AppShell } from "@/components/app/AppShell";
import { ActionButton, Card, EmptyState, Pill, SectionTitle, SkeletonList } from "@/components/app/Primitives";
import { reportingApi } from "@/lib/mms/endpoints";

export const Route = createFileRoute("/incomplete-profiles")({
  validateSearch: (search: Record<string, unknown>) => ({ type: search["type"] === "guardian" ? "guardian" as const : "student" as const }),
  component: IncompleteProfilesPage,
});

function IncompleteProfilesPage() {
  const { type } = Route.useSearch();
  const query = useQuery({ queryKey: ["incomplete-profiles", type], queryFn: () => reportingApi.incompleteProfiles(type) });
  const remind = useMutation({ mutationFn: () => reportingApi.remindIncompleteProfiles(type, (query.data ?? []).map((profile) => profile.id)), onSuccess: (result) => toast.success(`${result.sent} reminder${result.sent === 1 ? "" : "s"} sent`) });
  const title = type === "student" ? "Students with incomplete profiles" : "Guardians with incomplete profiles";
  return <AppShell title={title} subtitle="Complete the required profile details">
    {query.isLoading ? <SkeletonList rows={4} /> : null}
    {!query.isLoading && !query.data?.length ? <EmptyState title="All profiles are complete" hint="There is nothing to follow up right now." /> : null}
    {query.data?.length ? <><SectionTitle action={<ActionButton onClick={() => remind.mutate()} disabled={remind.isPending}><BellRing className="h-4 w-4" />Send reminder</ActionButton>}>Profiles</SectionTitle><div className="space-y-2.5">{query.data.map((profile) => {
      const card = <Card><div className="flex items-start justify-between gap-3"><div><p className="font-semibold">{profile.name}</p><p className="mt-1 text-xs text-muted-foreground">{profile.phone || "No default phone"}</p></div><Pill tone="warning">Incomplete</Pill></div><p className="mt-3 text-sm text-muted-foreground">Missing: {profile.missing_fields.join(", ")}</p></Card>;
      return type === "student" ? <Link key={profile.id} to="/people/$studentId" params={{ studentId: profile.id }} className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{card}</Link> : <div key={profile.id}>{card}</div>;
    })}</div></> : null}
  </AppShell>;
}
