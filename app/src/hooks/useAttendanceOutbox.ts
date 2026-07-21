import { useCallback, useEffect, useState } from "react";

import type { AttendanceStatus } from "../data/mockData";
import { api } from "../lib/api";
import { db, type OutboxEntry } from "../lib/offlineDb";
import { getOfflineAccountKey } from "../lib/offlineCache";

type AttendanceOutboxState = Readonly<{
  entries: OutboxEntry[];
  lockedKeys: string[];
  isSyncing: boolean;
  queueAttendance: (studentId: string, status: AttendanceStatus) => Promise<void>;
  queueAttendanceBatch: (marks: Record<string, AttendanceStatus>) => Promise<void>;
  sync: () => Promise<void>;
  overrideEntry: (entry: OutboxEntry, reason: string) => Promise<void>;
}>;

function createAttendanceEntry(
  studentId: string,
  status: AttendanceStatus,
  sessionId: string,
  courseId: string,
  timetableSlotId: string,
  capturedAt = new Date().toISOString(),
): OutboxEntry {
  const attendanceDate = capturedAt.slice(0, 10);

  return {
    account_key: getOfflineAccountKey(),
    subject_type: "student",
    subject_id: studentId,
    session_id: sessionId,
    course_id: courseId,
    timetable_slot_id: timetableSlotId,
    attendance_date: attendanceDate,
    status,
    captured_at: capturedAt,
    // Deterministic per (student, session, day): a same-day re-mark reuses the
    // key, so the server updates the existing row (logging a correction)
    // instead of inserting a duplicate.
    idempotency_key: `${studentId}:${sessionId}:${attendanceDate}:${timetableSlotId}`
  };
}

export function useAttendanceOutbox(
  sessionId: string | null,
  courseId: string | null,
  timetableSlotId: string | null,
): AttendanceOutboxState {
  const accountKey = getOfflineAccountKey();
  const [entries, setEntries] = useState<OutboxEntry[]>([]);
  const [lockedKeys, setLockedKeys] = useState<string[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);

  const refresh = useCallback(async (): Promise<void> => {
    setEntries(await db.outbox.where("account_key").equals(accountKey).toArray());
  }, [accountKey]);

  const sync = useCallback(async (): Promise<void> => {
    const pending = await db.outbox.where("account_key").equals(accountKey).toArray();
    if (pending.length === 0) return;

    setIsSyncing(true);
    try {
      const response = await api.post("/api/v1/attendance/sync", { entries: pending });

      const payload = response.data;
      await db.outbox.where("[account_key+idempotency_key]").anyOf(
        payload.idempotency_keys.map((key: string) => [accountKey, key]),
      ).delete();
      setLockedKeys(payload.locked ?? []);
      await refresh();
    } catch (error) {
      console.error("Attendance sync failed:", error);
    } finally {
      setIsSyncing(false);
    }
  }, [accountKey, refresh]);

  const overrideEntry = useCallback(
    async (entry: OutboxEntry, reason: string): Promise<void> => {
      await api.post("/api/v1/attendance/override", { entry, reason });
      await db.outbox.where("[account_key+idempotency_key]").equals([accountKey, entry.idempotency_key]).delete();
      setLockedKeys((current) => current.filter((key) => key !== entry.idempotency_key));
      await refresh();
    },
    [accountKey, refresh],
  );

  useEffect(() => {
    void refresh();

    const handleOnline = () => { void sync(); };
    window.addEventListener("online", handleOnline);
    return () => window.removeEventListener("online", handleOnline);
  }, [refresh, sync]);

  const queueAttendance = useCallback(
    async (studentId: string, status: AttendanceStatus): Promise<void> => {
      if (!sessionId || !courseId || !timetableSlotId) return;
      const entry = createAttendanceEntry(studentId, status, sessionId, courseId, timetableSlotId);
      // Upsert: re-marking a student the same day replaces the queued entry.
      await db.outbox.where("[account_key+idempotency_key]").equals([accountKey, entry.idempotency_key]).delete();
      await db.outbox.add(entry);
      await refresh();
      if (navigator.onLine) {
        sync();
      }
    },
    [accountKey, courseId, refresh, sync, sessionId, timetableSlotId],
  );

  const queueAttendanceBatch = useCallback(
    async (marks: Record<string, AttendanceStatus>): Promise<void> => {
      if (!sessionId || !courseId || !timetableSlotId) return;
      const capturedAt = new Date().toISOString();
      const batch = Object.entries(marks).map(([studentId, status]) =>
        createAttendanceEntry(studentId, status, sessionId, courseId, timetableSlotId, capturedAt),
      );
      if (batch.length === 0) return;

      for (const entry of batch) {
        await db.outbox.where("[account_key+idempotency_key]").equals([accountKey, entry.idempotency_key]).delete();
        await db.outbox.add(entry);
      }

      await refresh();
      if (navigator.onLine) {
        sync();
      }
    },
    [accountKey, courseId, refresh, sync, sessionId, timetableSlotId],
  );

  return { entries, lockedKeys, isSyncing, queueAttendance, queueAttendanceBatch, sync, overrideEntry };
}
