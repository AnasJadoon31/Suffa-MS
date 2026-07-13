/**
 * Tiny one-shot signal used to deep-link the dashboard's "open class list"
 * buttons into the Attendance/Assessments screens. The app switches views by
 * simple state (no route params — see App.tsx renderActiveView), so the
 * target screen consumes this once on mount and clears it immediately after.
 */
export type PendingClassNav = {
  classId: string;
  sectionId: string | null;
  courseId: string | null;
};

let pending: PendingClassNav | null = null;

export function setPendingClassNav(nav: PendingClassNav): void {
  pending = nav;
}

export function consumePendingClassNav(): PendingClassNav | null {
  const value = pending;
  pending = null;
  return value;
}
