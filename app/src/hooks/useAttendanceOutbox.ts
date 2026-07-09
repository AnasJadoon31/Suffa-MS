import { useCallback, useEffect, useState } from "react";

import type { AttendanceStatus } from "../data/mockData";
import { api } from "../lib/api";
import { db, type OutboxEntry } from "../lib/offlineDb";

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
  capturedAt = new Date().toISOString(),
): OutboxEntry {
  const attendanceDate = capturedAt.slice(0, 10);

  return {
    subject_type: "student",
    subject_id: studentId,
    session_id: sessionId,
    attendance_date: attendanceDate,
    status,
    captured_at: capturedAt,
    // Deterministic per (student, session, day): a same-day re-mark reuses the
    // key, so the server updates the existing row (logging a correction)
    // instead of inserting a duplicate.
    idempotency_key: `${studentId}:${sessionId}:${attendanceDate}`
  };
}

export function useAttendanceOutbox(sessionId: string | null): AttendanceOutboxState {
  const [entries, setEntries] = useState<OutboxEntry[]>([]);
  const [lockedKeys, setLockedKeys] = useState<string[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);

  const refresh = useCallback(async (): Promise<void> => {
    setEntries(await db.outbox.toArray());
  }, []);

  const sync = useCallback(async (): Promise<void> => {
    const pending = await db.outbox.toArray();
    if (pending.length === 0) return;

    setIsSyncing(true);
    try {
      const response = await api.post("/api/v1/attendance/sync", { entries: pending });

      const payload = response.data;
      await db.outbox.where("idempotency_key").anyOf(payload.idempotency_keys).delete();
      setLockedKeys(payload.locked ?? []);
      await refresh();
    } catch (error) {
      console.error("Attendance sync failed:", error);
    } finally {
      setIsSyncing(false);
    }
  }, [refresh]);

  const overrideEntry = useCallback(
    async (entry: OutboxEntry, reason: string): Promise<void> => {
      await api.post("/api/v1/attendance/override", { entry, reason });
      await db.outbox.where("idempotency_key").equals(entry.idempotency_key).delete();
      setLockedKeys((current) => current.filter((key) => key !== entry.idempotency_key));
      await refresh();
    },
    [refresh],
  );

  useEffect(() => {
    void refresh();

    const handleOnline = () => { void sync(); };
    window.addEventListener("online", handleOnline);
    return () => window.removeEventListener("online", handleOnline);
  }, [refresh, sync]);

  const queueAttendance = useCallback(
    async (studentId: string, status: AttendanceStatus): Promise<void> => {
      if (!sessionId) return;
      const entry = createAttendanceEntry(studentId, status, sessionId);
      // Upsert: re-marking a student the same day replaces the queued entry.
      await db.outbox.where("idempotency_key").equals(entry.idempotency_key).delete();
      await db.outbox.add(entry);
      await refresh();
      if (navigator.onLine) {
        sync();
      }
    },
    [refresh, sync, sessionId],
  );

  const queueAttendanceBatch = useCallback(
    async (marks: Record<string, AttendanceStatus>): Promise<void> => {
      if (!sessionId) return;
      const capturedAt = new Date().toISOString();
      const batch = Object.entries(marks).map(([studentId, status]) =>
        createAttendanceEntry(studentId, status, sessionId, capturedAt),
      );
      if (batch.length === 0) return;

      for (const entry of batch) {
        await db.outbox.where("idempotency_key").equals(entry.idempotency_key).delete();
        await db.outbox.add(entry);
      }

      await refresh();
      if (navigator.onLine) {
        sync();
      }
    },
    [refresh, sync, sessionId],
  );

  return { entries, lockedKeys, isSyncing, queueAttendance, queueAttendanceBatch, sync, overrideEntry };
}
