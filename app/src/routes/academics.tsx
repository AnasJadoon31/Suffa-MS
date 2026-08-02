import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { BookOpen, CalendarRange, GraduationCap, Layers } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/app/AppShell";
import { FormSheet } from "@/components/app/FormSheet";
import {
  Card,
  EmptyState,
  Field,
  Pill,
  CustomDropdown,
  SkeletonList,
  TextInput,
} from "@/components/app/Primitives";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/mms/auth";
import { academicsApi } from "@/lib/mms/endpoints";
import { academicsExtraApi, academicsMutations } from "@/lib/mms/more-endpoints";

export const Route = createFileRoute("/academics")({
  head: () => ({
    meta: [
      { title: "Academics — Suffa MS" },
      { name: "description", content: "Sessions, programs, classes and courses of the madrasa." },
      { property: "og:title", content: "Academics — Suffa MS" },
      { property: "og:description", content: "Sessions, programs, classes and courses." },
    ],
  }),
  component: AcademicsPage,
});

type Tab = "sessions" | "programs" | "classes" | "courses";

function AcademicsPage() {
  const { user } = useAuth();
  const client = useQueryClient();
  const canManage = user?.role === "principal" || user?.role === "super_admin";
  const [tab, setTab] = useState<Tab>("sessions");
  const today = new Date().toISOString().slice(0, 10);

  const sessions = useQuery({ queryKey: ["sessions"], queryFn: () => academicsApi.listSessions() });
  const classes = useQuery({ queryKey: ["classes"], queryFn: () => academicsApi.listClasses() });
  const programs = useQuery({
    queryKey: ["programs"],
    queryFn: () => academicsExtraApi.listPrograms(),
  });
  const courses = useQuery({
    queryKey: ["courses"],
    queryFn: () => academicsExtraApi.listCourses(),
  });

  const loading =
    (tab === "sessions" && sessions.isLoading) ||
    (tab === "classes" && classes.isLoading) ||
    (tab === "programs" && programs.isLoading) ||
    (tab === "courses" && courses.isLoading);

  const [name, setName] = useState("");
  const [programId, setProgramId] = useState("");
  const [start, setStart] = useState(today);
  const [end, setEnd] = useState(today);

  const create = useMutation({
    mutationFn: async () => {
      if (tab === "sessions")
        return academicsMutations.createSession({
          name: name.trim(),
          start_date: start,
          end_date: end,
        });
      if (tab === "programs") return academicsMutations.createProgram(name.trim());
      if (tab === "classes")
        return academicsMutations.createClass({ program_id: programId, name: name.trim() });
      return academicsMutations.createCourse(name.trim());
    },
    onSuccess: () => {
      toast.success("Created");
      setName("");
      void client.invalidateQueries({ queryKey: [tab] });
    },
  });

  const activate = useMutation({
    mutationFn: (id: string) => academicsMutations.activateSession(id),
    onSuccess: () => {
      toast.success("Session activated");
      void client.invalidateQueries({ queryKey: ["sessions"] });
    },
  });

  return (
    <AppShell
      title="Academics"
      subtitle="Structure of your madrasa"
      right={
        canManage ? (
          <FormSheet
            title={`New ${tab.slice(0, -1)}`}
            triggerLabel="Add"
            submitLabel="Create"
            onSubmit={() => create.mutateAsync()}
          >
            <Field label="Name">
              <TextInput required value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
            {tab === "classes" ? (
              <Field label="Program">
                <CustomDropdown
                  required
                  value={programId}
                  onChange={(e) => setProgramId(e.target.value)}
                >
                  <option value="">Select program</option>
                  {(programs.data ?? []).map((program) => (
                    <option key={program.id} value={program.id}>
                      {program.name}
                    </option>
                  ))}
                </CustomDropdown>
              </Field>
            ) : null}
            {tab === "sessions" ? (
              <div className="grid grid-cols-2 gap-3">
                <Field label="Start">
                  <TextInput
                    type="date"
                    required
                    value={start}
                    onChange={(e) => setStart(e.target.value)}
                  />
                </Field>
                <Field label="End">
                  <TextInput
                    type="date"
                    required
                    value={end}
                    onChange={(e) => setEnd(e.target.value)}
                  />
                </Field>
              </div>
            ) : null}
          </FormSheet>
        ) : undefined
      }
    >
      <div className="mb-3 grid grid-cols-4 gap-1.5 rounded-2xl bg-muted p-1">
        {(["sessions", "programs", "classes", "courses"] as Tab[]).map((key) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={cn(
              "rounded-xl py-2 text-[0.68rem] font-bold uppercase tracking-wide transition-colors",
              tab === key
                ? "bg-card text-primary shadow-[var(--shadow-soft)]"
                : "text-muted-foreground",
            )}
          >
            {key}
          </button>
        ))}
      </div>

      {loading ? <SkeletonList rows={5} /> : null}

      {!loading && tab === "sessions" ? (
        <Items
          empty={(sessions.data ?? []).length === 0}
          rows={(sessions.data ?? []).map((item) => ({
            id: item.id,
            icon: <CalendarRange className="h-5 w-5" />,
            title: item.name,
            subtitle: `${item.start_date ?? ""} — ${item.end_date ?? ""}`,
            pill: item.is_active ? "Active" : undefined,
            action:
              canManage && !item.is_active
                ? { label: "Activate", onClick: () => activate.mutate(item.id) }
                : undefined,
          }))}
        />
      ) : null}

      {!loading && tab === "programs" ? (
        <Items
          empty={(programs.data ?? []).length === 0}
          rows={(programs.data ?? []).map((item) => ({
            id: item.id,
            icon: <Layers className="h-5 w-5" />,
            title: item.name,
            subtitle: "Program",
          }))}
        />
      ) : null}

      {!loading && tab === "classes" ? (
        <Items
          empty={(classes.data ?? []).length === 0}
          rows={(classes.data ?? []).map((item) => ({
            id: item.id,
            icon: <GraduationCap className="h-5 w-5" />,
            title: item.name,
            subtitle:
              programs.data?.find((program) => program.id === item.program_id)?.name ?? "Class",
          }))}
        />
      ) : null}

      {!loading && tab === "courses" ? (
        <Items
          empty={(courses.data ?? []).length === 0}
          rows={(courses.data ?? []).map((item) => ({
            id: item.id,
            icon: <BookOpen className="h-5 w-5" />,
            title: item.name,
            subtitle: "Course",
          }))}
        />
      ) : null}
    </AppShell>
  );
}

function Items({
  empty,
  rows,
}: {
  empty: boolean;
  rows: {
    id: string;
    icon: React.ReactNode;
    title: string;
    subtitle: string;
    pill?: string | undefined;
    action?: { label: string; onClick: () => void } | undefined;
  }[];
}) {
  if (empty) return <EmptyState title="Nothing here yet" />;
  return (
    <div className="space-y-2">
      {rows.map((row) => (
        <Card
          key={row.id}
          className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 p-3.5"
        >
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary">
            {row.icon}
          </span>
          <div className="min-w-0">
            <p className="truncate font-semibold">{row.title}</p>
            <p className="truncate text-xs text-muted-foreground">{row.subtitle}</p>
          </div>
          {row.pill ? (
            <Pill tone="success">{row.pill}</Pill>
          ) : row.action ? (
            <button
              onClick={row.action.onClick}
              className="rounded-xl bg-primary-soft px-3 py-1.5 text-xs font-bold text-primary"
            >
              {row.action.label}
            </button>
          ) : (
            <span />
          )}
        </Card>
      ))}
    </div>
  );
}
