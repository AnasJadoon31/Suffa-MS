import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Phone, UserPlus } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/app/AppShell";
import { FilterBar } from "@/components/app/FilterBar";
import { FormSheet } from "@/components/app/FormSheet";
import {
  Card,
  EmptyState,
  Field,
  Pill,
  SelectInput,
  SkeletonList,
  TextArea,
  TextInput,
} from "@/components/app/Primitives";
import { useAuth } from "@/lib/mms/auth";
import { academicsExtraApi, admissionsMutations, opsApi } from "@/lib/mms/more-endpoints";

export const Route = createFileRoute("/admissions")({
  head: () => ({
    meta: [
      { title: "Admissions — Suffa MS" },
      { name: "description", content: "Track admission applications from enquiry to enrolment." },
      { property: "og:title", content: "Admissions — Suffa MS" },
      {
        property: "og:description",
        content: "Track admission applications from enquiry to enrolment.",
      },
    ],
  }),
  component: AdmissionsPage,
});

const FILTERS = ["all", "pending", "approved", "rejected"] as const;
const emptyExtra = { search: "" };

function AdmissionsPage() {
  const { hasPermission } = useAuth();
  const canManage = hasPermission("admissions.manage");
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("all");
  const [extra, setExtra] = useState(emptyExtra);

  const params = useMemo(
    () => ({
      status: filter === "all" ? undefined : filter,
      q: extra.search || undefined,
    }),
    [filter, extra.search],
  );

  const query = useQuery({
    queryKey: ["admissions", params],
    queryFn: () => opsApi.listAdmissions(params),
    retry: false,
  });
  const setStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      opsApi.setAdmissionStatus(id, status),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["admissions"] }),
  });

  const items = query.data ?? [];
  const activeCount = (filter !== "all" ? 1 : 0) + (extra.search ? 1 : 0);

  const programs = useQuery({
    queryKey: ["programs"],
    queryFn: () => academicsExtraApi.listPrograms(),
    enabled: canManage,
    retry: false,
  });

  const [applicant, setApplicant] = useState("");
  const [contact, setContact] = useState("");
  const [programId, setProgramId] = useState("");
  const [dob, setDob] = useState("");
  const [notes, setNotes] = useState("");

  const create = useMutation({
    mutationFn: () =>
      admissionsMutations.createAdmission({
        applicant_name: applicant.trim(),
        guardian_contact: contact.trim(),
        ...(programId ? { program_id: programId } : {}),
        ...(dob ? { date_of_birth: dob } : {}),
        ...(notes.trim() ? { notes: notes.trim() } : {}),
      }),
    onSuccess: () => {
      toast.success("Application added");
      setApplicant("");
      setContact("");
      setNotes("");
      void queryClient.invalidateQueries({ queryKey: ["admissions"] });
    },
  });

  return (
    <AppShell
      title="Admissions"
      subtitle={`${items.length} applications`}
      right={
        canManage ? (
          <FormSheet
            title="New application"
            triggerLabel="Add"
            submitLabel="Create"
            onSubmit={() => create.mutateAsync()}
          >
            <Field label="Applicant name">
              <TextInput
                required
                value={applicant}
                onChange={(e) => setApplicant(e.target.value)}
              />
            </Field>
            <Field label="Guardian contact">
              <TextInput required value={contact} onChange={(e) => setContact(e.target.value)} />
            </Field>
            <Field label="Program">
              <SelectInput value={programId} onChange={(e) => setProgramId(e.target.value)}>
                <option value="">Not decided</option>
                {(programs.data ?? []).map((program) => (
                  <option key={program.id} value={program.id}>
                    {program.name}
                  </option>
                ))}
              </SelectInput>
            </Field>
            <Field label="Date of birth">
              <TextInput type="date" value={dob} onChange={(e) => setDob(e.target.value)} />
            </Field>
            <Field label="Notes">
              <TextArea value={notes} onChange={(e) => setNotes(e.target.value)} />
            </Field>
          </FormSheet>
        ) : undefined
      }
    >
      <FilterBar
        chips={FILTERS.map((key) => ({
          key,
          label: key,
          active: filter === key,
          onClick: () => setFilter(key),
        }))}
        search={{
          value: extra.search,
          onChange: (v) => setExtra({ search: v }),
          placeholder: "Search applicant, guardian…",
        }}
        activeCount={activeCount}
        onClear={() => {
          setFilter("all");
          setExtra(emptyExtra);
        }}
      />

      {query.isLoading ? <SkeletonList rows={5} /> : null}
      {query.isError ? (
        <EmptyState title="Admissions unavailable" hint="You may not have access to this module." />
      ) : null}
      {!query.isLoading && !query.isError && items.length === 0 ? (
        <EmptyState title="No applications" />
      ) : null}

      <div className="space-y-2.5">
        {items.map((item) => (
          <Card key={item.id} className="space-y-2 p-3.5">
            <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary">
                <UserPlus className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <p className="truncate font-semibold">{item.applicant_name}</p>
                <p className="flex items-center gap-1 truncate text-xs text-muted-foreground">
                  <Phone className="h-3.5 w-3.5" />
                  {item.guardian_contact}
                </p>
              </div>
              <Pill
                tone={
                  item.status === "approved"
                    ? "success"
                    : item.status === "rejected"
                      ? "destructive"
                      : "warning"
                }
              >
                {item.status}
              </Pill>
            </div>
            {item.notes ? <p className="text-sm text-muted-foreground">{item.notes}</p> : null}
            {canManage && item.status === "pending" ? (
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setStatus.mutate({ id: item.id, status: "approved" })}
                  className="rounded-xl bg-primary-soft py-2 text-xs font-bold uppercase tracking-wide text-success"
                >
                  Approve
                </button>
                <button
                  onClick={() => setStatus.mutate({ id: item.id, status: "rejected" })}
                  className="rounded-xl bg-destructive/10 py-2 text-xs font-bold uppercase tracking-wide text-destructive"
                >
                  Reject
                </button>
              </div>
            ) : null}
          </Card>
        ))}
      </div>
    </AppShell>
  );
}
