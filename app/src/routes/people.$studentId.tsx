import { useQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";

import { AppShell } from "@/components/app/AppShell";
import { EmptyState, SkeletonList } from "@/components/app/Primitives";
import { StudentDetailSheet } from "@/components/app/people/PersonDetail";
import { peopleMutations } from "@/lib/mms/more-endpoints";

export const Route = createFileRoute("/people/$studentId")({
  component: StudentProfilePage,
});

function StudentProfilePage() {
  const { studentId } = Route.useParams();
  const navigate = useNavigate();
  const student = useQuery({ queryKey: ["student", studentId], queryFn: () => peopleMutations.getStudent(studentId) });

  return <AppShell title="Student profile" subtitle="Student record">
    {student.isLoading ? <SkeletonList rows={6} /> : null}
    {student.isError || !student.data ? <EmptyState title="Student not found" /> : null}
    {student.data ? <StudentDetailSheet student={student.data} open page onOpenChange={() => navigate({ to: "/people", search: { tab: undefined as string | undefined, section_id: undefined as string | undefined } })} /> : null}
  </AppShell>;
}
