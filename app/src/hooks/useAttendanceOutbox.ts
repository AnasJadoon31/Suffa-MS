import { useCallback, useEffect, useState } from "react";

import type { AttendanceStatus } from "../data/mockData";
import { api } from "../lib/api";
import { db, type OutboxEntry } from "../lib/offlineDb";

type AttendanceOutboxState = Readonly<{
  entries: OutboxEntry[];
  isSyncing: boolean;
  queueAttendance: (studentId: string, status: AttendanceStatus) => Promise<void>;
  sync: () => Promise<void>;
}>;

function createAttendanceEntry(studentId: string, status: AttendanceStatus): OutboxEntry {
  const now = new Date();
  const capturedAt = now.toISOString();

  return {
    subject_type: "student",
    subject_id: studentId,
    session_id: "a01bc7a7-9e56-46f6-8954-8194b0c439ae",
    attendance_date: capturedAt.slice(0, 10),
    status,
    captured_at: capturedAt,
    idempotency_key: `${studentId}-${capturedAt}`
  };
}

export function useAttendanceOutbox(): AttendanceOutboxState {
  const [entries, setEntries] = useState<OutboxEntry[]>([]);
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
      await refresh();
    } catch (error) {
      console.error("Attendance sync failed:", error);
    } finally {
      setIsSyncing(false);
    }
  }, [refresh]);

  useEffect(() => {
    void refresh();
    
    const handleOnline = () => { void sync(); };
    window.addEventListener("online", handleOnline);
    return () => window.removeEventListener("online", handleOnline);
  }, [refresh, sync]);

  const queueAttendance = useCallback(
    async (studentId: string, status: AttendanceStatus): Promise<void> => {
      await db.outbox.add(createAttendanceEntry(studentId, status));
      await refresh();
      if (navigator.onLine) {
        sync();
      }
    },
    [refresh, sync],
  );

  return { entries, isSyncing, queueAttendance, sync };
}
