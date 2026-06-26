import { useCallback, useEffect, useState } from "react";

import type { AttendanceStatus } from "../data/mockData";
import { API_BASE } from "../lib/config";
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

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const queueAttendance = useCallback(
    async (studentId: string, status: AttendanceStatus): Promise<void> => {
      await db.outbox.add(createAttendanceEntry(studentId, status));
      await refresh();
    },
    [refresh],
  );

  const sync = useCallback(async (): Promise<void> => {
    const pending = await db.outbox.toArray();
    if (pending.length === 0) return;

    setIsSyncing(true);
    try {
      const response = await fetch(`${API_BASE}/api/v1/attendance/sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entries: pending })
      });
      if (!response.ok) {
        throw new Error("Attendance sync failed");
      }
      const payload = (await response.json()) as { idempotency_keys: string[] };
      await db.outbox.where("idempotency_key").anyOf(payload.idempotency_keys).delete();
      await refresh();
    } finally {
      setIsSyncing(false);
    }
  }, [refresh]);

  return { entries, isSyncing, queueAttendance, sync };
}
